use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use futures::TryStreamExt;
use hf_hub::progress::{DownloadEvent, Progress, ProgressEvent, ProgressHandler};
use hf_hub::repository::RepoTreeEntry;
use hf_hub::{split_id, HFClient};
use serde::Serialize;
use tokio::task::AbortHandle;

use crate::failure::Failure;
use crate::model_source::ModelSource;
use crate::toolchain::ModelSlot;
use crate::transfer_report::TransferReport;

/// The Hugging Face Cache, located the way Hugging Face's own tools locate it, so a Model they
/// downloaded is found. `variable_by_name` reads an environment variable; the home directory comes
/// from the platform, since hf-hub reads `HOME`, which Windows does not set.
pub fn hub_cache(variable_by_name: impl Fn(&str) -> Option<String>, home: &Path) -> PathBuf {
    let non_empty_value = |name: &str| variable_by_name(name).filter(|value| !value.is_empty());
    if let Some(cache) =
        non_empty_value("HF_HUB_CACHE").or_else(|| non_empty_value("HUGGINGFACE_HUB_CACHE"))
    {
        return PathBuf::from(cache);
    }
    let hf_home = non_empty_value("HF_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            non_empty_value("XDG_CACHE_HOME").map(|cache| PathBuf::from(cache).join("huggingface"))
        })
        .unwrap_or_else(|| home.join(".cache").join("huggingface"));
    hf_home.join("hub")
}

/// A client of the Hugging Face Hub keeping what it downloads in `hub_cache`; `endpoint` stands in
/// for the Hub, or `HF_ENDPOINT` does when none is given.
pub fn hub_client(hub_cache: &Path, endpoint: Option<&str>) -> Result<HFClient, Failure> {
    let builder = HFClient::builder().cache_dir(hub_cache);
    let builder = match endpoint {
        Some(endpoint) => builder.endpoint(endpoint),
        None => builder,
    };
    builder.build().map_err(download_failure)
}

/// A file of a Hugging Face Repository, by its path in the Repository.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RepositoryFile {
    pub path: String,
    pub size: u64,
}

/// Lists the files of `repo` at its main branch a Model for `slot` can be.
pub async fn list_model_files(
    client: &HFClient,
    repo: &str,
    slot: ModelSlot,
) -> Result<Vec<RepositoryFile>, Failure> {
    let (owner, name) = split_id(repo);
    let repository = client.model(owner, name);
    let entries: Vec<RepoTreeEntry> = repository
        .list_tree()
        .recursive(true)
        .send()
        .map_err(download_failure)?
        .try_collect()
        .await
        .map_err(download_failure)?;
    Ok(entries
        .into_iter()
        .filter_map(|entry| match entry {
            RepoTreeEntry::File { path, size, .. } if slot.is_model_file(&path) => {
                Some(RepositoryFile { path, size })
            }
            _ => None,
        })
        .collect())
}

/// How much of a Model being downloaded has arrived.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DownloadProgress {
    pub repo: String,
    pub file: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// The Model downloads under way, by Repository and file, so each can be cancelled.
#[derive(Default)]
pub struct ModelDownloads(Mutex<HashMap<(String, String), AbortHandle>>);

impl ModelDownloads {
    /// Downloads `file` of `repo` at `revision` into the client's cache, answering it as a Model
    /// Source at the commit it was downloaded at; a commit the cache already holds is not asked for.
    pub async fn download(
        &self,
        client: HFClient,
        repo: String,
        file: String,
        revision: Option<String>,
        on_progress: impl Fn(DownloadProgress) + Send + Sync + 'static,
    ) -> Result<ModelSource, Failure> {
        let key = (repo.clone(), file.clone());
        let (owner, name) = split_id(&repo);
        let repository = client.model(owner, name);
        let relay = ProgressRelay {
            repo: repo.clone(),
            file: file.clone(),
            report: Mutex::default(),
            on_progress,
        };
        let filename = file.clone();
        let task = {
            let mut running = self.0.lock().unwrap();
            if running.contains_key(&key) {
                return Err(Failure::ModelDownloading);
            }
            let task = tokio::spawn(async move {
                repository
                    .download_file()
                    .filename(filename)
                    .maybe_revision(revision)
                    .progress(Progress::new(relay))
                    .send()
                    .await
            });
            running.insert(key.clone(), task.abort_handle());
            task
        };
        let task_id = task.id();
        let result = task.await;
        let mut running = self.0.lock().unwrap();
        if running
            .get(&key)
            .is_some_and(|handle| handle.id() == task_id)
        {
            running.remove(&key);
        }
        drop(running);
        let path = match result {
            Ok(downloaded) => downloaded.map_err(download_failure)?,
            Err(error) if error.is_cancelled() => return Err(Failure::ModelDownloadCancelled),
            Err(error) => return Err(error.into()),
        };
        let commit = snapshot_commit(&path, &file).ok_or_else(|| Failure::Internal {
            detail: format!("{} is not in a snapshot", path.display()),
        })?;
        Ok(ModelSource::Repository { repo, file, commit })
    }

    /// Stops downloading `file` of `repo`, if it is downloading.
    pub fn cancel(&self, repo: &str, file: &str) {
        if let Some(task) = self
            .0
            .lock()
            .unwrap()
            .remove(&(repo.to_string(), file.to_string()))
        {
            task.abort();
        }
    }
}

/// The commit of the snapshot directory `file` was downloaded to, as the cache lays it out.
fn snapshot_commit(path: &Path, file: &str) -> Option<String> {
    let snapshot = path.ancestors().nth(Path::new(file).components().count())?;
    Some(snapshot.file_name()?.to_string_lossy().into_owned())
}

fn download_failure(error: hf_hub::HFError) -> Failure {
    Failure::ModelDownloadFailed {
        detail: error.to_string(),
    }
}

/// Passes hf-hub's progress on for one file, paced by a `TransferReport`.
struct ProgressRelay<F> {
    repo: String,
    file: String,
    report: Mutex<TransferReport>,
    on_progress: F,
}

impl<F: Fn(DownloadProgress) + Send + Sync> ProgressHandler for ProgressRelay<F> {
    fn on_progress(&self, event: &ProgressEvent) {
        let (downloaded, total) = match event {
            ProgressEvent::Download(DownloadEvent::Progress { files }) => {
                match files.iter().find(|progress| progress.filename == self.file) {
                    Some(progress) => (progress.bytes_completed, progress.total_bytes),
                    None => return,
                }
            }
            ProgressEvent::Download(DownloadEvent::AggregateProgress {
                bytes_completed,
                total_bytes,
                ..
            }) => (*bytes_completed, *total_bytes),
            _ => return,
        };
        let total = (total > 0).then_some(total);
        if self.report.lock().unwrap().advance(downloaded, total) {
            (self.on_progress)(DownloadProgress {
                repo: self.repo.clone(),
                file: self.file.clone(),
                downloaded,
                total,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc};
    use std::time::Duration;

    use super::*;
    use crate::test_support::{FakeHttp, Request, Response, TempDir};

    const REPO: &str = "tsuzuri-app/Breeze-ASR-25-ggml";
    const FILE: &str = "ggml-breeze-asr-25-q8_0.bin";
    const COMMIT: &str = "cf41205287fb5483317ce2d1d973ba7cac8fa750";

    /// The Hub's answer for `FILE` of `REPO` at the main branch or `COMMIT`: its bytes, ETag and commit.
    fn hub_file(request: &Request, content: &[u8]) -> Response {
        let is_file = [
            format!("/{REPO}/resolve/main/{FILE}"),
            format!("/{REPO}/resolve/{COMMIT}/{FILE}"),
        ]
        .contains(&request.path);
        if !is_file {
            return Response {
                status: 404,
                ..Response::default()
            };
        }
        Response {
            status: 200,
            headers: vec![
                ("ETag".to_string(), "\"breeze-q8\"".to_string()),
                ("X-Repo-Commit".to_string(), COMMIT.to_string()),
            ],
            body: content.to_vec(),
        }
    }

    /// A Hub whose file never finishes downloading, telling `started` once its HEAD is asked.
    fn stalled_hub(started: mpsc::Sender<()>) -> FakeHttp {
        FakeHttp::serve(move |request| {
            if request.method == "HEAD" {
                let _ = started.send(());
            } else {
                std::thread::sleep(Duration::from_secs(5));
            }
            hub_file(request, b"weights")
        })
    }

    fn download_breeze(
        downloads: &ModelDownloads,
        hub: &FakeHttp,
        cache: &Path,
        revision: Option<&str>,
    ) -> Result<ModelSource, Failure> {
        let client = hub_client(cache, Some(&hub.base_url)).unwrap();
        tauri::async_runtime::block_on(downloads.download(
            client,
            REPO.to_string(),
            FILE.to_string(),
            revision.map(str::to_string),
            |_| {},
        ))
    }

    fn cached_file(cache: &Path) -> PathBuf {
        cache
            .join("models--tsuzuri-app--Breeze-ASR-25-ggml/snapshots")
            .join(COMMIT)
            .join(FILE)
    }

    /// A Repository holding one Model for each slot and a file that is none.
    fn repository_tree(request: &Request) -> Response {
        if !request
            .path
            .starts_with(&format!("/api/models/{REPO}/tree/main"))
        {
            return Response {
                status: 404,
                ..Response::default()
            };
        }
        let tree = serde_json::json!([
            { "type": "file", "oid": "1", "size": 3_094_623_691u64, "path": "ggml-large-v3.bin" },
            { "type": "file", "oid": "2", "size": 885_098, "path": "ggml-silero-v6.2.0.bin" },
            { "type": "file", "oid": "3", "size": 2_497_281_120u64, "path": "qwen3.gguf" },
            { "type": "file", "oid": "4", "size": 182, "path": "README.md" },
        ]);
        Response {
            status: 200,
            body: tree.to_string().into_bytes(),
            ..Response::default()
        }
    }

    fn list_tree_files(slot: ModelSlot) -> Vec<(String, u64)> {
        let dir = TempDir::new("hub-tree");
        let hub = FakeHttp::serve(repository_tree);
        let client = hub_client(dir.path(), Some(&hub.base_url)).unwrap();
        tauri::async_runtime::block_on(list_model_files(&client, REPO, slot))
            .unwrap()
            .into_iter()
            .map(|file| (file.path, file.size))
            .collect()
    }

    // @behavior MD-025
    #[test]
    fn lists_the_transcription_models_of_a_repository() {
        let files = list_tree_files(ModelSlot::Transcription);

        assert_eq!(
            files,
            vec![("ggml-large-v3.bin".to_string(), 3_094_623_691)]
        );
    }

    // @behavior MD-026
    #[test]
    fn lists_the_vad_models_of_a_repository() {
        let files = list_tree_files(ModelSlot::Vad);

        assert_eq!(files, vec![("ggml-silero-v6.2.0.bin".to_string(), 885_098)]);
    }

    // @behavior MD-027
    #[test]
    fn lists_the_translation_models_of_a_repository() {
        let files = list_tree_files(ModelSlot::Translation);

        assert_eq!(files, vec![("qwen3.gguf".to_string(), 2_497_281_120)]);
    }

    // @behavior MD-019
    #[test]
    fn downloads_a_repositorys_model_into_the_hugging_face_cache() {
        let dir = TempDir::new("hub-download");
        let hub = FakeHttp::serve(|request| hub_file(request, b"weights"));

        let source = download_breeze(&ModelDownloads::default(), &hub, dir.path(), None).unwrap();

        assert_eq!(
            (source, std::fs::read(cached_file(dir.path())).unwrap()),
            (
                ModelSource::Repository {
                    repo: REPO.to_string(),
                    file: FILE.to_string(),
                    commit: COMMIT.to_string(),
                },
                b"weights".to_vec()
            )
        );
    }

    // @behavior MD-020
    #[test]
    fn takes_a_model_the_cache_already_holds() {
        let dir = TempDir::new("hub-cached-download");
        std::fs::create_dir_all(cached_file(dir.path()).parent().unwrap()).unwrap();
        std::fs::write(cached_file(dir.path()), "weights").unwrap();
        let requests = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&requests);
        let hub = FakeHttp::serve(move |request| {
            counted.fetch_add(1, Ordering::SeqCst);
            hub_file(request, b"weights")
        });

        download_breeze(&ModelDownloads::default(), &hub, dir.path(), Some(COMMIT)).unwrap();

        assert_eq!(requests.load(Ordering::SeqCst), 0);
    }

    // @behavior MD-021
    #[test]
    fn tells_how_far_a_download_has_come() {
        let dir = TempDir::new("hub-progress");
        let hub = FakeHttp::serve(|request| hub_file(request, &[7; 300]));
        let reports = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&reports);

        tauri::async_runtime::block_on(ModelDownloads::default().download(
            hub_client(dir.path(), Some(&hub.base_url)).unwrap(),
            REPO.to_string(),
            FILE.to_string(),
            None,
            move |progress| recorded.lock().unwrap().push(progress),
        ))
        .unwrap();

        assert_eq!(
            reports.lock().unwrap().last(),
            Some(&DownloadProgress {
                repo: REPO.to_string(),
                file: FILE.to_string(),
                downloaded: 300,
                total: Some(300),
            })
        );
    }

    // @behavior MD-022
    #[test]
    fn cancels_a_download() {
        let dir = TempDir::new("hub-cancel");
        let (started, has_started) = mpsc::channel();
        let hub = stalled_hub(started);
        let downloads = Arc::new(ModelDownloads::default());
        let running = Arc::clone(&downloads);
        let cache = dir.path().to_path_buf();
        let base_url = hub.base_url.clone();
        let download = std::thread::spawn(move || {
            let client = hub_client(&cache, Some(&base_url)).unwrap();
            tauri::async_runtime::block_on(running.download(
                client,
                REPO.to_string(),
                FILE.to_string(),
                None,
                |_| {},
            ))
        });
        has_started.recv().unwrap();

        downloads.cancel(REPO, FILE);

        assert_eq!(
            download.join().unwrap(),
            Err(Failure::ModelDownloadCancelled)
        );
    }

    // @behavior MD-023
    #[test]
    fn refuses_a_second_download_of_the_same_file() {
        let dir = TempDir::new("hub-twice");
        let (started, has_started) = mpsc::channel();
        let hub = stalled_hub(started);
        let downloads = Arc::new(ModelDownloads::default());
        let running = Arc::clone(&downloads);
        let cache = dir.path().to_path_buf();
        let base_url = hub.base_url.clone();
        let first = std::thread::spawn(move || {
            let client = hub_client(&cache, Some(&base_url)).unwrap();
            tauri::async_runtime::block_on(running.download(
                client,
                REPO.to_string(),
                FILE.to_string(),
                None,
                |_| {},
            ))
        });
        has_started.recv().unwrap();

        let second = download_breeze(&downloads, &hub, dir.path(), None);

        downloads.cancel(REPO, FILE);
        let _ = first.join();
        assert_eq!(second, Err(Failure::ModelDownloading));
    }

    fn variables(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let variables: HashMap<String, String> = pairs
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect();
        move |name| variables.get(name).cloned()
    }

    // @behavior MD-016
    #[test]
    fn finds_the_hugging_face_cache_in_the_home_directory() {
        let home = Path::new("/home/user");

        let cache = hub_cache(variables(&[]), home);

        assert_eq!(cache, home.join(".cache").join("huggingface").join("hub"));
    }

    // @behavior MD-017
    #[test]
    fn takes_the_hugging_face_cache_a_variable_names() {
        let cache = hub_cache(
            variables(&[("HF_HUB_CACHE", "/models/hub"), ("HF_HOME", "/models/hf")]),
            Path::new("/home/user"),
        );

        assert_eq!(cache, PathBuf::from("/models/hub"));
    }
}

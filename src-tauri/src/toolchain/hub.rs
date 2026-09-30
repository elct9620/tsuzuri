use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use futures::TryStreamExt;
use hf_hub::progress::{DownloadEvent, Progress, ProgressEvent, ProgressHandler};
use hf_hub::repository::RepoTreeEntry;
use hf_hub::{split_id, HFClient, HFError};
use serde::Serialize;
use tokio::task::AbortHandle;

use crate::failure::Failure;
use crate::model_source::ModelSource;
use crate::transfer_report::TransferReport;

/// Where Hugging Face's own tools keep their files, found the way they find it so what they
/// downloaded and the login they saved are both found. `variable_by_name` reads an environment
/// variable; the home directory comes from the platform, since hf-hub reads `HOME`, which Windows
/// does not set.
fn hf_home(variable_by_name: &impl Fn(&str) -> Option<String>, home: &Path) -> PathBuf {
    non_empty_value(variable_by_name, "HF_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            non_empty_value(variable_by_name, "XDG_CACHE_HOME")
                .map(|cache| PathBuf::from(cache).join("huggingface"))
        })
        .unwrap_or_else(|| home.join(".cache").join("huggingface"))
}

fn non_empty_value(
    variable_by_name: &impl Fn(&str) -> Option<String>,
    name: &str,
) -> Option<String> {
    variable_by_name(name).filter(|value| !value.is_empty())
}

/// The Hugging Face Cache, where a Model another Hugging Face tool downloaded is found.
pub fn hub_cache(variable_by_name: impl Fn(&str) -> Option<String>, home: &Path) -> PathBuf {
    non_empty_value(&variable_by_name, "HF_HUB_CACHE")
        .or_else(|| non_empty_value(&variable_by_name, "HUGGINGFACE_HUB_CACHE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| hf_home(&variable_by_name, home).join("hub"))
}

/// The token Hugging Face's tools use: `HF_TOKEN`, else the file `hf auth login` saved, unless
/// implicit tokens are turned off.
pub fn hub_token(variable_by_name: impl Fn(&str) -> Option<String>, home: &Path) -> Option<String> {
    if non_empty_value(&variable_by_name, "HF_HUB_DISABLE_IMPLICIT_TOKEN").is_some() {
        return None;
    }
    if let Some(token) = non_empty_value(&variable_by_name, "HF_TOKEN") {
        return Some(token);
    }
    let token_file = non_empty_value(&variable_by_name, "HF_TOKEN_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| hf_home(&variable_by_name, home).join("token"));
    std::fs::read_to_string(token_file)
        .ok()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

/// A client of the Hugging Face Hub keeping what it downloads in `hub_cache` and signing in with
/// `token`; `endpoint` stands in for the Hub, or `HF_ENDPOINT` does when none is given.
pub fn hub_client(
    hub_cache: &Path,
    token: Option<&str>,
    endpoint: Option<&str>,
) -> Result<HFClient, Failure> {
    let mut builder = HFClient::builder().cache_dir(hub_cache);
    if let Some(token) = token {
        builder = builder.token(token);
    }
    if let Some(endpoint) = endpoint {
        builder = builder.endpoint(endpoint);
    }
    builder
        .build()
        .map_err(|error| Failure::ModelDownloadFailed {
            detail: error.to_string(),
        })
}

/// A file of a Hugging Face Repository, by its path in the Repository.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct RepositoryFile {
    pub path: String,
    pub size: u64,
}

/// Lists every file of `repo` at its main branch.
pub async fn list_files(client: &HFClient, repo: &str) -> Result<Vec<RepositoryFile>, Failure> {
    let (owner, name) = split_id(repo);
    let repository = client.model(owner, name);
    let entries: Vec<RepoTreeEntry> = repository
        .list_tree()
        .recursive(true)
        .send()
        .map_err(|error| hub_failure(repo, error))?
        .try_collect()
        .await
        .map_err(|error| hub_failure(repo, error))?;
    Ok(entries
        .into_iter()
        .filter_map(|entry| match entry {
            RepoTreeEntry::File { path, size, .. } => Some(RepositoryFile { path, size }),
            _ => None,
        })
        .collect())
}

/// How much of a Model being downloaded has arrived.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
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
            let mut running_downloads = self.0.lock().unwrap();
            if running_downloads.contains_key(&key) {
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
            running_downloads.insert(key.clone(), task.abort_handle());
            task
        };
        let task_id = task.id();
        let result = task.await;
        let mut running_downloads = self.0.lock().unwrap();
        if running_downloads
            .get(&key)
            .is_some_and(|handle| handle.id() == task_id)
        {
            running_downloads.remove(&key);
        }
        drop(running_downloads);
        let path = match result {
            Ok(downloaded) => downloaded.map_err(|error| hub_failure(&repo, error))?,
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

/// The Failure an answer of the Hub is, for `repo`: the Hub answers a gated Repository with the
/// `GatedRepo` error code, and one that does not exist, or is someone else's private one, as
/// unauthorized without saying which.
fn hub_failure(repo: &str, error: HFError) -> Failure {
    let repo = repo.to_string();
    let (status, error_code) = match &error {
        HFError::AuthRequired { context }
        | HFError::Forbidden { context }
        | HFError::Http { context } => {
            (Some(context.status.as_u16()), context.error_code.as_deref())
        }
        HFError::RepoNotFound { .. } => (Some(404), None),
        _ => (None, None),
    };
    match (status, error_code) {
        (_, Some("GatedRepo")) | (Some(403), _) => Failure::ModelLoginRequired { repo },
        (Some(401 | 404), _) => Failure::RepositoryNotFound { repo },
        _ => Failure::ModelDownloadFailed {
            detail: error.to_string(),
        },
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

    /// A Hub whose file never finishes downloading, telling `start_signal` once its HEAD is asked.
    fn stalled_hub(start_signal: mpsc::Sender<()>) -> FakeHttp {
        FakeHttp::serve(move |request| {
            if request.method == "HEAD" {
                let _ = start_signal.send(());
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
        let client = hub_client(cache, None, Some(&hub.base_url)).unwrap();
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

    #[test]
    fn lists_every_file_of_a_repository_with_its_size() {
        let dir = TempDir::new("hub-tree");
        let hub = FakeHttp::serve(repository_tree);
        let client = hub_client(dir.path(), None, Some(&hub.base_url)).unwrap();

        let files: Vec<(String, u64)> = tauri::async_runtime::block_on(list_files(&client, REPO))
            .unwrap()
            .into_iter()
            .map(|file| (file.path, file.size))
            .collect();

        assert_eq!(
            files,
            vec![
                ("ggml-large-v3.bin".to_string(), 3_094_623_691),
                ("ggml-silero-v6.2.0.bin".to_string(), 885_098),
                ("qwen3.gguf".to_string(), 2_497_281_120),
                ("README.md".to_string(), 182),
            ]
        );
    }

    /// A home directory holding the token `hf auth login` saves there.
    fn home_with_saved_token(dir: &TempDir) -> PathBuf {
        let hf_home = dir.path().join(".cache").join("huggingface");
        std::fs::create_dir_all(&hf_home).unwrap();
        std::fs::write(hf_home.join("token"), "hf_saved\n").unwrap();
        dir.path().to_path_buf()
    }

    // @behavior MD-042
    #[test]
    fn reads_the_token_hugging_faces_tools_saved() {
        let dir = TempDir::new("hub-saved-token");
        let home = home_with_saved_token(&dir);

        let token = hub_token(variables(&[]), &home);

        assert_eq!(token.as_deref(), Some("hf_saved"));
    }

    // @behavior MD-043
    #[test]
    fn takes_the_token_hf_token_names() {
        let dir = TempDir::new("hub-env-token");
        let home = home_with_saved_token(&dir);

        let token = hub_token(variables(&[("HF_TOKEN", "hf_from_env")]), &home);

        assert_eq!(token.as_deref(), Some("hf_from_env"));
    }

    /// A Hub answering every request as unauthorized, with `error_code` when there is one.
    fn unauthorized_hub(error_code: Option<&'static str>) -> FakeHttp {
        FakeHttp::serve(move |_| Response {
            status: 401,
            headers: error_code
                .map(|code| vec![("X-Error-Code".to_string(), code.to_string())])
                .unwrap_or_default(),
            ..Response::default()
        })
    }

    // @behavior MD-044
    #[test]
    fn asks_to_log_in_for_a_gated_repository() {
        let dir = TempDir::new("hub-gated");
        let hub = unauthorized_hub(Some("GatedRepo"));

        let result = download_breeze(&ModelDownloads::default(), &hub, dir.path(), None);

        assert_eq!(
            result,
            Err(Failure::ModelLoginRequired {
                repo: REPO.to_string()
            })
        );
    }

    // @behavior MD-045
    #[test]
    fn says_a_repository_was_not_found() {
        let dir = TempDir::new("hub-missing");
        let hub = unauthorized_hub(None);
        let client = hub_client(dir.path(), None, Some(&hub.base_url)).unwrap();

        let result = tauri::async_runtime::block_on(list_files(&client, REPO));

        assert_eq!(
            result,
            Err(Failure::RepositoryNotFound {
                repo: REPO.to_string()
            })
        );
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
        let request_count = Arc::clone(&requests);
        let hub = FakeHttp::serve(move |request| {
            request_count.fetch_add(1, Ordering::SeqCst);
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
        let progress_reports = Arc::clone(&reports);

        tauri::async_runtime::block_on(ModelDownloads::default().download(
            hub_client(dir.path(), None, Some(&hub.base_url)).unwrap(),
            REPO.to_string(),
            FILE.to_string(),
            None,
            move |progress| progress_reports.lock().unwrap().push(progress),
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
        let (start_signal, has_started) = mpsc::channel();
        let hub = stalled_hub(start_signal);
        let downloads = Arc::new(ModelDownloads::default());
        let shared_downloads = Arc::clone(&downloads);
        let cache = dir.path().to_path_buf();
        let base_url = hub.base_url.clone();
        let download = std::thread::spawn(move || {
            let client = hub_client(&cache, None, Some(&base_url)).unwrap();
            tauri::async_runtime::block_on(shared_downloads.download(
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
        let (start_signal, has_started) = mpsc::channel();
        let hub = stalled_hub(start_signal);
        let downloads = Arc::new(ModelDownloads::default());
        let shared_downloads = Arc::clone(&downloads);
        let cache = dir.path().to_path_buf();
        let base_url = hub.base_url.clone();
        let first = std::thread::spawn(move || {
            let client = hub_client(&cache, None, Some(&base_url)).unwrap();
            tauri::async_runtime::block_on(shared_downloads.download(
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

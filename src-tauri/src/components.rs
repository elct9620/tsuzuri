pub mod manifest;

use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use reqwest::header::RANGE;
use reqwest::StatusCode;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use manifest::{Archive, ArchiveFormat, Entry, Source};

const INSTALLED_MARKER: &str = ".installed";
const DOWNLOADS_DIR: &str = ".downloads";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ComponentStatus {
    name: String,
    ready: bool,
    hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct Progress {
    name: String,
    downloaded: u64,
    total: Option<u64>,
}

/// Where Components live: downloaded ones under app data, vendored ones under the repository's `vendor/`.
pub struct Locations {
    pub components: PathBuf,
    pub vendor: PathBuf,
}

impl Locations {
    pub fn of(app: &AppHandle) -> Result<Locations, String> {
        let data = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        Ok(Locations {
            components: data.join("components"),
            vendor: Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("vendor"),
        })
    }

    pub fn executable(&self, entry: &Entry) -> PathBuf {
        match &entry.source {
            Source::Download { executable, .. } => {
                self.components.join(&entry.name).join(executable)
            }
            Source::Vendored { executable } => self.vendor.join(executable),
        }
    }
}

pub fn status(entry: &Entry, locations: &Locations) -> ComponentStatus {
    let (ready, hint) = match &entry.source {
        Source::Download { .. } => (is_installed(entry, locations), None),
        Source::Vendored { .. } => {
            let built = locations.executable(entry).is_file();
            (built, (!built).then(|| "run scripts/vendor.sh".to_string()))
        }
    };
    ComponentStatus {
        name: entry.name.clone(),
        ready,
        hint,
    }
}

/// The executable of a Component that is ready to run, or why it is not.
pub fn ready_executable(name: &str, locations: &Locations) -> Result<PathBuf, String> {
    let entry = manifest::manifest()
        .into_iter()
        .find(|entry| entry.name == name)
        .ok_or_else(|| format!("{name} is not in the Manifest"))?;
    let status = status(&entry, locations);
    if status.ready {
        Ok(locations.executable(&entry))
    } else {
        Err(match status.hint {
            Some(hint) => format!("{name} is not ready: {hint}"),
            None => format!("{name} is not installed"),
        })
    }
}

fn installed_marker(tag: &str, archives: &[Archive]) -> String {
    std::iter::once(tag)
        .chain(archives.iter().map(|archive| archive.sha256.as_str()))
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_installed(entry: &Entry, locations: &Locations) -> bool {
    let Source::Download { tag, archives, .. } = &entry.source else {
        return false;
    };
    let marker = locations
        .components
        .join(&entry.name)
        .join(INSTALLED_MARKER);
    std::fs::read_to_string(marker).is_ok_and(|content| content == installed_marker(tag, archives))
        && locations.executable(entry).is_file()
}

/// Downloads, verifies and unpacks a downloaded Component unless the pinned archives are already installed.
/// Vendored Components are left to `scripts/vendor.sh`.
pub async fn install(
    entry: &Entry,
    locations: &Locations,
    client: &reqwest::Client,
    on_progress: &(dyn Fn(u64, Option<u64>) + Sync),
) -> Result<(), String> {
    let Source::Download { tag, archives, .. } = &entry.source else {
        return Ok(());
    };
    if is_installed(entry, locations) {
        return Ok(());
    }

    let downloads = locations.components.join(DOWNLOADS_DIR);
    tokio::fs::create_dir_all(&downloads)
        .await
        .map_err(|error| error.to_string())?;
    let mut fetched = Vec::with_capacity(archives.len());
    for archive in archives {
        let path = downloads.join(archive_file_name(&archive.url));
        fetch(client, &archive.url, &path, on_progress).await?;
        verify(&path, &archive.sha256).await?;
        fetched.push((path, archive.format));
    }

    let dir = locations.components.join(&entry.name);
    let marker = installed_marker(tag, archives);
    tokio::task::spawn_blocking(move || unpack_all(&dir, &fetched, &marker))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

fn archive_file_name(url: &str) -> &str {
    url.rsplit('/').next().unwrap_or(url)
}

async fn fetch(
    client: &reqwest::Client,
    url: &str,
    path: &Path,
    on_progress: &(dyn Fn(u64, Option<u64>) + Sync),
) -> Result<(), String> {
    let on_disk = tokio::fs::metadata(path)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    let mut request = client.get(url);
    if on_disk > 0 {
        request = request.header(RANGE, format!("bytes={on_disk}-"));
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
        return Ok(());
    }
    let response = response
        .error_for_status()
        .map_err(|error| error.to_string())?;

    let resumed = response.status() == StatusCode::PARTIAL_CONTENT;
    let mut downloaded = if resumed { on_disk } else { 0 };
    let total = response.content_length().map(|length| length + downloaded);
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(path)
        .await
        .map_err(|error| error.to_string())?;
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        file.write_all(&chunk)
            .await
            .map_err(|error| error.to_string())?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total);
    }
    file.flush().await.map_err(|error| error.to_string())
}

/// A mismatched archive is deleted so the next attempt downloads it whole instead of resuming a bad file.
async fn verify(path: &Path, expected: &str) -> Result<(), String> {
    let path = path.to_path_buf();
    let actual = tokio::task::spawn_blocking({
        let path = path.clone();
        move || -> io::Result<String> {
            let mut hasher = Sha256::new();
            io::copy(&mut File::open(path)?, &mut hasher)?;
            Ok(format!("{:x}", hasher.finalize()))
        }
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    if actual == expected {
        Ok(())
    } else {
        let _ = tokio::fs::remove_file(&path).await;
        Err(format!(
            "{} does not match its pinned SHA256",
            path.display()
        ))
    }
}

fn unpack_all(dir: &Path, archives: &[(PathBuf, ArchiveFormat)], marker: &str) -> io::Result<()> {
    match std::fs::remove_dir_all(dir) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
        _ => {}
    }
    std::fs::create_dir_all(dir)?;
    for (path, format) in archives {
        let file = File::open(path)?;
        match format {
            ArchiveFormat::Zip => zip::ZipArchive::new(file)
                .and_then(|mut zip| zip.extract(dir))
                .map_err(io::Error::other)?,
            ArchiveFormat::TarGz => {
                tar::Archive::new(flate2::read::GzDecoder::new(file)).unpack(dir)?
            }
        }
    }
    std::fs::write(dir.join(INSTALLED_MARKER), marker)?;
    for (path, _) in archives {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

#[tauri::command]
pub fn component_statuses(app: AppHandle) -> Result<Vec<ComponentStatus>, String> {
    let locations = Locations::of(&app)?;
    Ok(manifest::manifest()
        .iter()
        .map(|entry| status(entry, &locations))
        .collect())
}

#[tauri::command]
pub async fn install_components(app: AppHandle) -> Result<Vec<ComponentStatus>, String> {
    let locations = Locations::of(&app)?;
    let client = reqwest::Client::new();
    for entry in manifest::manifest() {
        let report = |downloaded, total| {
            let progress = Progress {
                name: entry.name.clone(),
                downloaded,
                total,
            };
            let _ = app.emit("component-progress", progress);
        };
        install(&entry, &locations, &client, &report).await?;
    }
    component_statuses(app)
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::test_support::TempDir;

    /// Serves one body over HTTP, honouring `Range: bytes=N-`, and records the Range header of every request.
    struct ArchiveServer {
        url: String,
        ranges: Arc<Mutex<Vec<Option<String>>>>,
    }

    impl ArchiveServer {
        fn serve(body: Vec<u8>) -> ArchiveServer {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}/tool.tar.gz", listener.local_addr().unwrap());
            let ranges = Arc::new(Mutex::new(Vec::new()));
            let recorded = Arc::clone(&ranges);
            std::thread::spawn(move || {
                for mut stream in listener.incoming().flatten() {
                    let mut range = None;
                    for line in BufReader::new(&stream).lines().map_while(Result::ok) {
                        if line.is_empty() {
                            break;
                        }
                        if let Some(value) = line.to_ascii_lowercase().strip_prefix("range: ") {
                            range = Some(value.to_string());
                        }
                    }
                    recorded.lock().unwrap().push(range.clone());
                    let start = range
                        .and_then(|value| {
                            value
                                .strip_prefix("bytes=")?
                                .strip_suffix('-')?
                                .parse()
                                .ok()
                        })
                        .unwrap_or(0usize);
                    let status = if start == 0 {
                        "200 OK"
                    } else {
                        "206 Partial Content"
                    };
                    let rest = &body[start..];
                    let head = format!(
                        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        rest.len()
                    );
                    let _ = stream.write_all(head.as_bytes());
                    let _ = stream.write_all(rest);
                }
            });
            ArchiveServer { url, ranges }
        }

        fn ranges(&self) -> Vec<Option<String>> {
            self.ranges.lock().unwrap().clone()
        }
    }

    fn tar_gz(path: &str, contents: &[u8]) -> Vec<u8> {
        let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_size(contents.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder.append_data(&mut header, path, contents).unwrap();
        builder.into_inner().unwrap().finish().unwrap()
    }

    fn sha256(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    fn tool_entry(url: &str, sha256: String) -> Entry {
        Entry {
            name: "tool".to_string(),
            source: Source::Download {
                tag: "t1".to_string(),
                archives: vec![Archive {
                    url: url.to_string(),
                    sha256,
                    format: ArchiveFormat::TarGz,
                }],
                executable: "pkg/bin/tool".to_string(),
            },
        }
    }

    fn locations(dir: &TempDir) -> Locations {
        Locations {
            components: dir.path().join("components"),
            vendor: dir.path().join("vendor"),
        }
    }

    // @behavior CP-001
    #[tokio::test]
    async fn installs_the_executable_where_the_manifest_names_it() {
        let dir = TempDir::new("cp-install");
        let archive = tar_gz("pkg/bin/tool", b"#!/bin/sh\n");
        let server = ArchiveServer::serve(archive.clone());
        let entry = tool_entry(&server.url, sha256(&archive));
        let locations = locations(&dir);

        install(&entry, &locations, &reqwest::Client::new(), &|_, _| {})
            .await
            .unwrap();

        assert!(locations.executable(&entry).is_file());
    }

    // @behavior CP-002
    #[tokio::test]
    async fn skips_a_component_already_installed_from_its_pinned_archives() {
        let dir = TempDir::new("cp-skip");
        let archive = tar_gz("pkg/bin/tool", b"#!/bin/sh\n");
        let server = ArchiveServer::serve(archive.clone());
        let entry = tool_entry(&server.url, sha256(&archive));
        let locations = locations(&dir);
        let client = reqwest::Client::new();
        install(&entry, &locations, &client, &|_, _| {})
            .await
            .unwrap();

        install(&entry, &locations, &client, &|_, _| {})
            .await
            .unwrap();

        assert_eq!(server.ranges().len(), 1);
    }

    // @behavior CP-003
    #[tokio::test]
    async fn resumes_an_archive_from_the_first_byte_not_on_disk() {
        let dir = TempDir::new("cp-resume");
        let archive = tar_gz("pkg/bin/tool", b"#!/bin/sh\n");
        let server = ArchiveServer::serve(archive.clone());
        let entry = tool_entry(&server.url, sha256(&archive));
        let locations = locations(&dir);
        let partial = locations.components.join(DOWNLOADS_DIR).join("tool.tar.gz");
        std::fs::create_dir_all(partial.parent().unwrap()).unwrap();
        std::fs::write(&partial, &archive[..10]).unwrap();

        install(&entry, &locations, &reqwest::Client::new(), &|_, _| {})
            .await
            .unwrap();

        assert_eq!(server.ranges(), vec![Some("bytes=10-".to_string())]);
    }

    // @behavior CP-004
    #[tokio::test]
    async fn refuses_an_archive_that_does_not_match_its_hash() {
        let dir = TempDir::new("cp-hash");
        let archive = tar_gz("pkg/bin/tool", b"#!/bin/sh\n");
        let server = ArchiveServer::serve(archive.clone());
        let entry = tool_entry(&server.url, sha256(b"something else"));
        let locations = locations(&dir);

        let result = install(&entry, &locations, &reqwest::Client::new(), &|_, _| {}).await;

        assert!(result.is_err());
        assert!(!status(&entry, &locations).ready);
    }

    // @behavior CP-005
    #[test]
    fn reports_a_vendored_component_that_was_never_built() {
        let dir = TempDir::new("cp-vendor");
        let entry = Entry {
            name: "whisper".to_string(),
            source: Source::Vendored {
                executable: "whisper/bin/whisper-cli".to_string(),
            },
        };

        let status = status(&entry, &locations(&dir));

        assert!(!status.ready);
        assert!(status.hint.unwrap().contains("scripts/vendor.sh"));
    }
}

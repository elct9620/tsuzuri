pub mod detection;
pub mod manifest;

use std::collections::HashMap;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use reqwest::header::RANGE;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use manifest::{Archive, ArchiveFormat, Entry, Source};

const INSTALLED_MARKER: &str = ".installed";
const DOWNLOADS_DIR: &str = ".downloads";
const CHOICES_FILE: &str = "components.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Chosen,
    Detected,
    Downloaded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ComponentStatus {
    name: String,
    ready: bool,
    path: Option<PathBuf>,
    origin: Option<Origin>,
    hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct Progress {
    name: String,
    downloaded: u64,
    total: Option<u64>,
}

/// The executable the user chose for each Component, by Component name.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Choices(HashMap<String, PathBuf>);

impl Choices {
    /// Choices never saved load as none, so a first launch relies on Detection and downloads.
    pub fn load(dir: &Path) -> io::Result<Choices> {
        match std::fs::read(dir.join(CHOICES_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Choices::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        std::fs::write(dir.join(CHOICES_FILE), json)
    }

    pub fn choose(&mut self, name: &str, path: PathBuf) {
        self.0.insert(name.to_string(), path);
    }

    fn get(&self, name: &str) -> Option<&Path> {
        self.0.get(name).map(PathBuf::as_path)
    }
}

/// Finds each Component in order: the user's choice, Detection, then what was downloaded into app data.
pub struct Resolver {
    pub components: PathBuf,
    pub choices: Choices,
    pub search_dirs: Vec<PathBuf>,
}

impl Resolver {
    pub fn of(app: &AppHandle) -> Result<Resolver, String> {
        let data = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        let config = app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?;
        Ok(Resolver {
            components: data.join("components"),
            choices: Choices::load(&config).map_err(|error| error.to_string())?,
            search_dirs: detection::search_dirs(),
        })
    }

    pub fn status(&self, entry: &Entry) -> ComponentStatus {
        let found = |path: PathBuf, origin| ComponentStatus {
            name: entry.name.clone(),
            ready: true,
            path: Some(path),
            origin: Some(origin),
            hint: None,
        };
        if let Some(chosen) = self.choices.get(&entry.name).filter(|path| path.is_file()) {
            return found(chosen.to_path_buf(), Origin::Chosen);
        }
        if let Some(detected) =
            detection::detect(&entry.program, &entry.version_flag, &self.search_dirs)
        {
            return found(detected, Origin::Detected);
        }
        match &entry.source {
            Source::Download { .. } if self.is_installed(entry) => {
                found(self.downloaded_executable(entry), Origin::Downloaded)
            }
            source => ComponentStatus {
                name: entry.name.clone(),
                ready: false,
                path: None,
                origin: None,
                hint: match source {
                    Source::External { install_hint } => Some(install_hint.clone()),
                    Source::Download { .. } => None,
                },
            },
        }
    }

    fn downloaded_executable(&self, entry: &Entry) -> PathBuf {
        let dir = self.components.join(&entry.name);
        match &entry.source {
            Source::Download { executable, .. } => dir.join(executable),
            Source::External { .. } => dir,
        }
    }

    fn is_installed(&self, entry: &Entry) -> bool {
        let Source::Download { tag, archives, .. } = &entry.source else {
            return false;
        };
        let marker = self.components.join(&entry.name).join(INSTALLED_MARKER);
        std::fs::read_to_string(marker)
            .is_ok_and(|content| content == installed_marker(tag, archives))
            && self.downloaded_executable(entry).is_file()
    }
}

/// The executable of a Component that is ready to run, or why it is not.
pub fn ready_executable(name: &str, resolver: &Resolver) -> Result<PathBuf, String> {
    let entry = manifest::manifest()
        .into_iter()
        .find(|entry| entry.name == name)
        .ok_or_else(|| format!("{name} is not in the Manifest"))?;
    let status = resolver.status(&entry);
    match (status.path, status.hint) {
        (Some(path), _) => Ok(path),
        (None, Some(hint)) => Err(format!("{name} is not installed: {hint}")),
        (None, None) => Err(format!("{name} is not downloaded yet")),
    }
}

fn installed_marker(tag: &str, archives: &[Archive]) -> String {
    std::iter::once(tag)
        .chain(archives.iter().map(|archive| archive.sha256.as_str()))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Downloads, verifies and unpacks a Component unless it was chosen, detected, or already installed from its pinned archives.
pub async fn install(
    entry: &Entry,
    resolver: &Resolver,
    client: &reqwest::Client,
    on_progress: &(dyn Fn(u64, Option<u64>) + Sync),
) -> Result<(), String> {
    let Source::Download { tag, archives, .. } = &entry.source else {
        return Ok(());
    };
    if resolver.status(entry).ready {
        return Ok(());
    }

    let downloads = resolver.components.join(DOWNLOADS_DIR);
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

    let dir = resolver.components.join(&entry.name);
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

fn statuses(resolver: &Resolver) -> Vec<ComponentStatus> {
    manifest::manifest()
        .iter()
        .map(|entry| resolver.status(entry))
        .collect()
}

#[tauri::command]
pub fn component_statuses(app: AppHandle) -> Result<Vec<ComponentStatus>, String> {
    Ok(statuses(&Resolver::of(&app)?))
}

#[tauri::command]
pub fn choose_component(
    app: AppHandle,
    name: String,
    path: PathBuf,
) -> Result<Vec<ComponentStatus>, String> {
    let config = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    let mut resolver = Resolver::of(&app)?;
    resolver.choices.choose(&name, path);
    resolver
        .choices
        .save(&config)
        .map_err(|error| error.to_string())?;
    Ok(statuses(&resolver))
}

#[tauri::command]
pub async fn install_components(app: AppHandle) -> Result<Vec<ComponentStatus>, String> {
    let resolver = Resolver::of(&app)?;
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
        install(&entry, &resolver, &client, &report).await?;
    }
    Ok(statuses(&resolver))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::test_support::{FakeHttp, Response, TempDir};

    /// Serves one archive, honouring `Range: bytes=N-`, and records the Range header of every request.
    struct ArchiveServer {
        url: String,
        ranges: Arc<Mutex<Vec<Option<String>>>>,
    }

    impl ArchiveServer {
        fn serve(body: Vec<u8>) -> ArchiveServer {
            let ranges = Arc::new(Mutex::new(Vec::new()));
            let recorded = Arc::clone(&ranges);
            let server = FakeHttp::serve(move |request| {
                let range = request.header("range").map(str::to_string);
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
                Response {
                    status: if start == 0 { 200 } else { 206 },
                    body: body[start..].to_vec(),
                }
            });
            ArchiveServer {
                url: format!("{}/tool.tar.gz", server.base_url),
                ranges,
            }
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

    fn deflated_zip(path: &str, contents: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        writer.start_file(path, options).unwrap();
        writer.write_all(contents).unwrap();
        writer.finish().unwrap().into_inner()
    }

    fn sha256(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    fn tool_entry(url: &str, sha256: String) -> Entry {
        Entry {
            name: "tool".to_string(),
            program: "tool".to_string(),
            version_flag: "--version".to_string(),
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

    fn external_entry() -> Entry {
        Entry {
            name: "tool".to_string(),
            program: "tool".to_string(),
            version_flag: "--version".to_string(),
            source: Source::External {
                install_hint: "brew install tool".to_string(),
            },
        }
    }

    /// A resolver with no choices and no Detection directories, so nothing on this machine is found.
    fn resolver(dir: &TempDir) -> Resolver {
        Resolver {
            components: dir.path().join("components"),
            choices: Choices::default(),
            search_dirs: Vec::new(),
        }
    }

    #[cfg(unix)]
    fn script(dir: &Path, name: &str, exit_code: i32) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\nexit {exit_code}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    // @behavior CP-001
    #[tokio::test]
    async fn installs_the_executable_where_the_manifest_names_it() {
        let dir = TempDir::new("cp-install");
        let archive = tar_gz("pkg/bin/tool", b"#!/bin/sh\n");
        let server = ArchiveServer::serve(archive.clone());
        let entry = tool_entry(&server.url, sha256(&archive));
        let resolver = resolver(&dir);

        install(&entry, &resolver, &reqwest::Client::new(), &|_, _| {})
            .await
            .unwrap();

        assert!(resolver.downloaded_executable(&entry).is_file());
    }

    // @behavior CP-001
    #[tokio::test]
    async fn installs_from_a_deflated_zip_archive() {
        let dir = TempDir::new("cp-zip");
        let archive = deflated_zip("Release/tool.exe", &[b'x'; 4096]);
        let server = ArchiveServer::serve(archive.clone());
        let mut entry = tool_entry(&server.url, sha256(&archive));
        if let Source::Download {
            archives,
            executable,
            ..
        } = &mut entry.source
        {
            archives[0].format = ArchiveFormat::Zip;
            *executable = "Release/tool.exe".to_string();
        }
        let resolver = resolver(&dir);

        install(&entry, &resolver, &reqwest::Client::new(), &|_, _| {})
            .await
            .unwrap();

        assert_eq!(
            std::fs::read(resolver.downloaded_executable(&entry)).unwrap(),
            vec![b'x'; 4096]
        );
    }

    // @behavior CP-002
    #[tokio::test]
    async fn skips_a_component_already_installed_from_its_pinned_archives() {
        let dir = TempDir::new("cp-skip");
        let archive = tar_gz("pkg/bin/tool", b"#!/bin/sh\n");
        let server = ArchiveServer::serve(archive.clone());
        let entry = tool_entry(&server.url, sha256(&archive));
        let resolver = resolver(&dir);
        let client = reqwest::Client::new();
        install(&entry, &resolver, &client, &|_, _| {})
            .await
            .unwrap();

        install(&entry, &resolver, &client, &|_, _| {})
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
        let resolver = resolver(&dir);
        let partial = resolver.components.join(DOWNLOADS_DIR).join("tool.tar.gz");
        std::fs::create_dir_all(partial.parent().unwrap()).unwrap();
        std::fs::write(&partial, &archive[..10]).unwrap();

        install(&entry, &resolver, &reqwest::Client::new(), &|_, _| {})
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
        let resolver = resolver(&dir);

        let result = install(&entry, &resolver, &reqwest::Client::new(), &|_, _| {}).await;

        assert!(result.is_err());
        assert!(!resolver.status(&entry).ready);
    }

    // @behavior CP-005
    #[test]
    fn tells_how_to_install_a_component_that_cannot_be_found() {
        let dir = TempDir::new("cp-external");

        let status = resolver(&dir).status(&external_entry());

        assert!(!status.ready);
        assert_eq!(status.hint.as_deref(), Some("brew install tool"));
    }

    // @behavior CP-009
    #[test]
    fn uses_the_executable_the_user_chose() {
        let dir = TempDir::new("cp-chosen");
        let chosen = dir.file("my-tool");
        let mut resolver = resolver(&dir);
        resolver.choices.choose("tool", chosen.clone());

        let status = resolver.status(&external_entry());

        assert_eq!(
            (status.path, status.origin),
            (Some(chosen), Some(Origin::Chosen))
        );
    }

    // @behavior CP-010
    #[cfg(unix)]
    #[test]
    fn detects_an_installed_executable_that_runs() {
        let dir = TempDir::new("cp-detect");
        let installed = script(&dir.path().join("bin"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("empty"), dir.path().join("bin")];

        let status = resolver.status(&external_entry());

        assert_eq!(
            (status.path, status.origin),
            (Some(installed), Some(Origin::Detected))
        );
    }

    // @behavior CP-011
    #[cfg(unix)]
    #[test]
    fn passes_over_an_executable_that_does_not_run() {
        let dir = TempDir::new("cp-broken");
        script(&dir.path().join("broken"), "tool", 1);
        let working = script(&dir.path().join("working"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("broken"), dir.path().join("working")];

        let status = resolver.status(&external_entry());

        assert_eq!(status.path, Some(working));
    }

    // @behavior CP-012
    #[cfg(unix)]
    #[tokio::test]
    async fn does_not_download_a_component_already_detected() {
        let dir = TempDir::new("cp-detected-skip");
        let archive = tar_gz("pkg/bin/tool", b"#!/bin/sh\n");
        let server = ArchiveServer::serve(archive.clone());
        let entry = tool_entry(&server.url, sha256(&archive));
        script(&dir.path().join("bin"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("bin")];

        install(&entry, &resolver, &reqwest::Client::new(), &|_, _| {})
            .await
            .unwrap();

        assert!(server.ranges().is_empty());
    }
}

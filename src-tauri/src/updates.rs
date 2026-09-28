pub mod commands;

use std::fs;
use std::future::Future;
use std::io;
use std::path::Path;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::failure::Failure;
use crate::json_settings;
use crate::steps::ModeLock;

const SETTINGS_FILE: &str = "updates.json";

/// Whether Tsuzuri looks for an App Update at launch; saved across launches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct UpdateSettings {
    pub has_launch_check: bool,
}

impl Default for UpdateSettings {
    fn default() -> UpdateSettings {
        UpdateSettings {
            has_launch_check: true,
        }
    }
}

impl UpdateSettings {
    /// Settings never saved load as the defaults.
    pub fn load(dir: &Path) -> io::Result<UpdateSettings> {
        json_settings::settings_at(&dir.join(SETTINGS_FILE))
    }

    /// Saves whether Tsuzuri looks for an App Update at launch.
    pub fn record_launch_check(dir: &Path, has_launch_check: bool) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        json_settings::write(
            &dir.join(SETTINGS_FILE),
            &UpdateSettings { has_launch_check },
        )
    }
}

/// The App Update a check found, as the webview shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppUpdate {
    pub release_number: String,
}

/// How much of the App Update being installed has downloaded, in bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// The App Update the last check found, kept for `install_update`.
#[derive(Default)]
pub struct FoundUpdate(Mutex<Option<Arc<Update>>>);

impl FoundUpdate {
    /// Keeps `update` in place of what an earlier check found, and answers it as the webview shows it.
    pub fn keep(&self, update: Option<Update>) -> Option<AppUpdate> {
        let app_update = update.as_ref().map(|update| AppUpdate {
            release_number: update.version.clone(),
        });
        *self.0.lock().unwrap() = update.map(Arc::new);
        app_update
    }

    /// What the last check found; installing needs a check to have found something first.
    pub fn update(&self) -> Result<Arc<Update>, Failure> {
        self.0.lock().unwrap().clone().ok_or(Failure::NoUpdate)
    }
}

/// The App Update the update manifest announces, or none when the App Build is the latest.
pub async fn look_for_update<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Update>, Failure> {
    Ok(app.updater()?.check().await?)
}

/// The answer of `check` when looking at launch is on; a failed check is only logged, since
/// nobody asked for it.
pub async fn check_at_launch<T>(
    settings: &UpdateSettings,
    check: impl Future<Output = Result<Option<T>, Failure>>,
) -> Option<T> {
    if !settings.has_launch_check {
        return None;
    }
    check.await.unwrap_or_else(|failure| {
        log::warn!("no App Update looked for at launch: {failure:?}");
        None
    })
}

/// An App Update that can be downloaded, verified and installed.
pub trait UpdatePackage {
    /// The verified package, calling `on_chunk` with each part's length and the whole size when known.
    fn download(
        &self,
        on_chunk: impl FnMut(usize, Option<u64>) + Send,
    ) -> impl Future<Output = Result<Vec<u8>, Failure>> + Send;

    fn install(&self, package: &[u8]) -> Result<(), Failure>;
}

impl UpdatePackage for Update {
    async fn download(
        &self,
        on_chunk: impl FnMut(usize, Option<u64>) + Send,
    ) -> Result<Vec<u8>, Failure> {
        Ok(Update::download(self, on_chunk, || {}).await?)
    }

    fn install(&self, package: &[u8]) -> Result<(), Failure> {
        Ok(Update::install(self, package)?)
    }
}

/// Downloads and installs `update` while holding the Mode's turn, so no Mode starts meanwhile,
/// stopping the Components first: an installer cannot replace the executables they run from.
pub async fn install_release(
    update: &impl UpdatePackage,
    mode_lock: &ModeLock,
    stop_components: impl FnOnce(),
    mut on_progress: impl FnMut(UpdateProgress) + Send,
) -> Result<(), Failure> {
    let _turn = mode_lock.try_turn().ok_or(Failure::UpdateDuringMode)?;
    let mut report = ProgressReport::default();
    let package = update
        .download(|length, total| {
            if let Some(progress) = report.add(length, total) {
                on_progress(progress);
            }
        })
        .await?;
    stop_components();
    update.install(&package)
}

/// The download's progress, reported once per whole percent, or per MiB when the size is unknown,
/// so a large package does not flood the webview with events.
#[derive(Default)]
struct ProgressReport {
    downloaded: u64,
    last_step: Option<u64>,
}

impl ProgressReport {
    const UNSIZED_STEP: u64 = 1024 * 1024;

    fn add(&mut self, length: usize, total: Option<u64>) -> Option<UpdateProgress> {
        self.downloaded += length as u64;
        let step = match total {
            Some(total) if total > 0 => self.downloaded * 100 / total,
            _ => self.downloaded / Self::UNSIZED_STEP,
        };
        if self.last_step == Some(step) {
            return None;
        }
        self.last_step = Some(step);
        Some(UpdateProgress {
            downloaded: self.downloaded,
            total,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

    use super::*;
    use crate::test_support::{captured_logs, FakeHttp, Response, TempDir};

    const PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEM4MTU3MkMxNDdFOUYwOTEKUldTUjhPbEh3WElWeUtadTI3N3BBaCt5VTM5dmtKVnJqYTZWeHVHMDdwWUZOdjhwN1M3WHhoNEYK";

    /// An app whose updater reads its update manifest from `releases`.
    fn app_with_releases(releases: &FakeHttp) -> tauri::App<MockRuntime> {
        let mut context = mock_context(noop_assets());
        context.config_mut().plugins.0.insert(
            "updater".into(),
            serde_json::json!({
                "pubkey": PUBKEY,
                "endpoints": [format!("{}/latest.json", releases.base_url)],
                "dangerousInsecureTransportProtocol": true,
            }),
        );
        mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap()
    }

    /// Releases whose update manifest announces `release_number` for this platform.
    fn releases_with_latest(release_number: &str) -> FakeHttp {
        let manifest = serde_json::json!({
            "version": release_number,
            "platforms": {
                tauri_plugin_updater::target().unwrap(): {
                    "url": "https://example.com/tsuzuri.tar.gz",
                    "signature": "unchecked until downloaded",
                },
            },
        });
        FakeHttp::serve(move |_| Response {
            status: 200,
            body: manifest.to_string().into_bytes(),
        })
    }

    fn unreachable_releases() -> FakeHttp {
        FakeHttp::serve(|_| Response {
            status: 500,
            body: Vec::new(),
        })
    }

    /// A package that records what was done to it, and while downloading asks for the Mode's
    /// turn when given a lock.
    #[derive(Default)]
    struct FakePackage<'a> {
        chunks: Vec<usize>,
        total: Option<u64>,
        mode_lock: Option<&'a ModeLock>,
        events: Mutex<Vec<&'static str>>,
    }

    impl FakePackage<'_> {
        fn record(&self, event: &'static str) {
            self.events.lock().unwrap().push(event);
        }

        fn events(&self) -> Vec<&'static str> {
            self.events.lock().unwrap().clone()
        }
    }

    impl UpdatePackage for FakePackage<'_> {
        async fn download(
            &self,
            mut on_chunk: impl FnMut(usize, Option<u64>) + Send,
        ) -> Result<Vec<u8>, Failure> {
            self.record("download");
            for chunk in &self.chunks {
                on_chunk(*chunk, self.total);
            }
            if let Some(mode_lock) = self.mode_lock {
                let turn = tokio::time::timeout(Duration::from_millis(20), mode_lock.wait_turn());
                if turn.await.is_err() {
                    self.record("mode waited");
                }
            }
            Ok(Vec::new())
        }

        fn install(&self, _package: &[u8]) -> Result<(), Failure> {
            self.record("install");
            Ok(())
        }
    }

    fn install_with(package: &FakePackage, mode_lock: &ModeLock) -> Result<(), Failure> {
        tauri::async_runtime::block_on(install_release(
            package,
            mode_lock,
            || package.record("stop components"),
            |_| {},
        ))
    }

    // @behavior UP-001
    #[test]
    fn finds_a_release_newer_than_the_app_build() {
        let app = app_with_releases(&releases_with_latest("99.0.0"));

        let update = tauri::async_runtime::block_on(look_for_update(app.handle())).unwrap();

        assert_eq!(update.map(|update| update.version), Some("99.0.0".into()));
    }

    // @behavior UP-002
    #[test]
    fn finds_nothing_when_the_app_build_is_the_latest() {
        let app_build_release = mock_context::<MockRuntime, _>(noop_assets())
            .package_info()
            .version
            .to_string();
        let app = app_with_releases(&releases_with_latest(&app_build_release));

        let update = tauri::async_runtime::block_on(look_for_update(app.handle())).unwrap();

        assert!(update.is_none());
    }

    // @behavior UP-003
    #[test]
    fn looks_at_launch_until_turned_off() {
        let dir = TempDir::new("update-settings-default");

        let settings = UpdateSettings::load(dir.path()).unwrap();

        assert!(settings.has_launch_check);
    }

    // @behavior UP-004
    #[test]
    fn does_not_look_at_launch_once_turned_off() {
        let dir = TempDir::new("update-settings-off");
        UpdateSettings::record_launch_check(dir.path(), false).unwrap();
        let is_asked = Mutex::new(false);

        let update = tauri::async_runtime::block_on(check_at_launch(
            &UpdateSettings::load(dir.path()).unwrap(),
            async {
                *is_asked.lock().unwrap() = true;
                Ok(Some("99.0.0"))
            },
        ));

        assert_eq!((update, *is_asked.lock().unwrap()), (None, false));
    }

    // @behavior UP-005
    #[test]
    fn stays_silent_when_the_launch_check_fails() {
        let app = app_with_releases(&unreachable_releases());
        let mut update = None;

        let logs = captured_logs(|| {
            update = Some(tauri::async_runtime::block_on(check_at_launch(
                &UpdateSettings::default(),
                look_for_update(app.handle()),
            )));
        });

        assert!(update.unwrap().is_none());
        assert!(
            logs.iter()
                .any(|line| line.contains("no App Update looked for at launch")),
            "{logs:?}"
        );
    }

    // @behavior UP-006
    #[test]
    fn fails_a_check_asked_for_when_the_releases_cannot_be_reached() {
        let app = app_with_releases(&unreachable_releases());

        let result = tauri::async_runtime::block_on(look_for_update(app.handle()));

        assert!(
            matches!(result, Err(Failure::UpdateFailed { .. })),
            "{:?}",
            result.err()
        );
    }

    // @behavior UP-007
    #[test]
    fn refuses_to_install_while_a_mode_runs() {
        let mode_lock = ModeLock::default();
        let _running_mode = mode_lock.try_turn().unwrap();
        let package = FakePackage::default();

        let result = install_with(&package, &mode_lock);

        assert_eq!(
            (result, package.events()),
            (Err(Failure::UpdateDuringMode), vec![])
        );
    }

    // @behavior UP-008
    #[test]
    fn refuses_to_install_before_an_update_is_found() {
        let found = FoundUpdate::default();

        let update = found.update();

        assert_eq!(update.err(), Some(Failure::NoUpdate));
    }

    // @behavior UP-009
    #[test]
    fn stops_every_component_between_downloading_and_installing() {
        let package = FakePackage::default();

        install_with(&package, &ModeLock::default()).unwrap();

        assert_eq!(
            package.events(),
            vec!["download", "stop components", "install"]
        );
    }

    // @behavior UP-010
    #[test]
    fn keeps_a_mode_waiting_while_installing() {
        let mode_lock = ModeLock::default();
        let package = FakePackage {
            mode_lock: Some(&mode_lock),
            ..FakePackage::default()
        };

        install_with(&package, &mode_lock).unwrap();

        assert!(package.events().contains(&"mode waited"));
    }

    // @behavior UP-011
    #[test]
    fn reports_each_whole_percent_downloaded() {
        let package = FakePackage {
            chunks: vec![1; 400],
            total: Some(400),
            ..FakePackage::default()
        };
        let mut reports = Vec::new();

        tauri::async_runtime::block_on(install_release(
            &package,
            &ModeLock::default(),
            || {},
            |progress| reports.push(progress),
        ))
        .unwrap();

        assert_eq!(
            (reports.len(), reports.last().copied()),
            (
                101,
                Some(UpdateProgress {
                    downloaded: 400,
                    total: Some(400)
                })
            )
        );
    }

    #[test]
    fn reports_each_mebibyte_of_a_download_of_unknown_size() {
        let mut report = ProgressReport::default();

        let reports: Vec<_> = (0..3)
            .filter_map(|_| report.add(512 * 1024, None))
            .map(|progress| progress.downloaded)
            .collect();

        assert_eq!(reports, vec![512 * 1024, 1024 * 1024]);
    }
}

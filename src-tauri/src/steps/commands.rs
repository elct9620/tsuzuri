use std::ops::Deref;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Runtime, State};

use super::{ModeLock, ModeRun, WORK_DIR};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::progress::Progress;
use crate::timing::{Phase, Phases};

#[tauri::command]
#[specta::specta]
pub fn cancel_task(mode_lock: State<'_, ModeLock>) {
    mode_lock.cancel();
}

/// Begins a run of `mode` once no other Mode runs, its Phases starting with preparing the
/// Components, so waiting for the turn counts in none of them.
pub async fn begin_mode<'a, R: Runtime>(
    app: &'a AppHandle<R>,
    mode_lock: &'a ModeLock,
    processes: &'a Processes,
    mode: &'static str,
) -> (CommandRun<'a, R>, Phases) {
    let run = mode_lock.begin(AppPorts::new(app, processes)).await;
    let phases = Phases::start(mode, Phase::Preparation);
    app.report(Phase::Preparation, None);
    (
        CommandRun {
            run: Some(run),
            app,
        },
        phases,
    )
}

/// A Mode Run a command began. Once dropped, however the command ended, its hold, what it showed
/// and its intermediate files end with it, and the webview is told the Project may have changed.
pub struct CommandRun<'a, R: Runtime> {
    run: Option<ModeRun<'a, AppPorts<'a, R>>>,
    app: &'a AppHandle<R>,
}

impl<'a, R: Runtime> Deref for CommandRun<'a, R> {
    type Target = ModeRun<'a, AppPorts<'a, R>>;

    fn deref(&self) -> &Self::Target {
        self.run
            .as_ref()
            .expect("a CommandRun holds its run until dropped")
    }
}

impl<R: Runtime> Drop for CommandRun<'_, R> {
    fn drop(&mut self) {
        drop(self.run.take());
        self.app.announce_project();
    }
}

/// The directory a run of `kind` keeps its intermediate files in, under the app's cache and
/// named by when it started, so two runs never share one.
pub fn work_directory(app: &AppHandle, kind: &str) -> Result<PathBuf, Failure> {
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    Ok(app
        .path()
        .app_cache_dir()?
        .join(WORK_DIR)
        .join(format!("{kind}-{started_at}")))
}

#[cfg(all(test, unix))]
mod tests {
    use std::time::Duration;

    use tauri::test::mock_builder;

    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use tauri_specta::Event;

    use super::*;
    use crate::progress::ProjectChanged;
    use crate::test_support::{build_mock_app, TempDir};

    // @behavior PR-012
    #[tokio::test]
    async fn tells_the_webview_once_a_mode_ends_before_it_holds_anything() {
        let dir = TempDir::new("pr-end-announced");
        let app = build_mock_app(mock_builder());
        let processes = Processes::new(dir.path().join("processes.json"));
        let mode_lock = ModeLock::default();
        let announcements = Arc::new(AtomicUsize::new(0));
        ProjectChanged::listen_any(app.handle(), {
            let announcements = Arc::clone(&announcements);
            move |_| {
                announcements.fetch_add(1, Ordering::SeqCst);
            }
        });
        let (run, _phases) = begin_mode(app.handle(), &mode_lock, &processes, "transcribe").await;

        drop(run);

        assert_eq!(announcements.load(Ordering::SeqCst), 1);
    }

    // @behavior PR-011
    #[tokio::test]
    async fn counts_no_wait_for_the_modes_turn_as_preparing() {
        let dir = TempDir::new("pr-wait-unprepared");
        let app = build_mock_app(mock_builder());
        let processes = Processes::new(dir.path().join("processes.json"));
        let mode_lock = ModeLock::default();
        let first_run = mode_lock
            .begin(AppPorts::new(app.handle(), &processes))
            .await;
        let end_first_run = async {
            tokio::time::sleep(Duration::from_millis(300)).await;
            drop(first_run);
        };

        let ((_run, phases), ()) = tokio::join!(
            begin_mode(app.handle(), &mode_lock, &processes, "transcribe"),
            end_first_run
        );

        let preparation = &phases.finish()[0];
        assert_eq!(preparation.phase, Phase::Preparation);
        assert!(preparation.seconds < 0.1, "prepared {preparation:?}");
    }
}

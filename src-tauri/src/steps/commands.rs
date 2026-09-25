use std::future::Future;

use tauri::{AppHandle, Manager};

use super::{ModeLock, Turn};
use crate::failure::Failure;
use crate::processes::Processes;

#[tauri::command]
pub fn cancel_task(app: AppHandle) {
    app.state::<ModeLock>().cancel();
}

/// Runs `task` until it ends or the Mode holding `turn` is asked to stop; then the processes
/// started since it began are stopped and it fails as `mode-cancelled`, what it showed so far kept.
pub async fn run_cancellable<T>(
    turn: &mut Turn<'_>,
    processes: &Processes,
    task: impl Future<Output = Result<T, Failure>>,
) -> Result<T, Failure> {
    let kept = processes.pids();
    tokio::select! {
        result = task => result,
        () = turn.wait_for_cancel() => {
            processes.kill_all_except(&kept);
            Err(Failure::ModeCancelled)
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::path::Path;
    use std::time::Duration;

    use tauri::test::{mock_builder, mock_context, noop_assets};

    use super::*;
    use crate::test_support::TempDir;

    fn sleep_for_a_minute(
        app: &tauri::App<tauri::test::MockRuntime>,
        processes: &Processes,
    ) -> u32 {
        processes
            .spawn(app.handle(), Path::new("/bin/sleep"), &["60".to_string()])
            .unwrap()
            .1
    }

    fn is_running(pid: u32) -> bool {
        std::process::Command::new("/bin/kill")
            .args(["-0", &pid.to_string()])
            .status()
            .is_ok_and(|status| status.success())
    }

    // @behavior PR-007
    #[tokio::test]
    async fn stops_what_a_cancelled_mode_started() {
        let dir = TempDir::new("pr-cancel");
        let app = mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(mock_context(noop_assets()))
            .unwrap();
        let processes = Processes::new(dir.path().join("processes.json"));
        let before = sleep_for_a_minute(&app, &processes);
        let lock = ModeLock::default();
        let mut turn = lock.wait_turn().await;
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let task = async {
            started_tx
                .send(sleep_for_a_minute(&app, &processes))
                .unwrap();
            std::future::pending::<Result<(), Failure>>().await
        };
        let cancel = async {
            let started = started_rx.await.unwrap();
            lock.cancel();
            started
        };

        let (result, started) = tokio::join!(run_cancellable(&mut turn, &processes, task), cancel);
        tokio::time::sleep(Duration::from_millis(200)).await;

        assert_eq!(
            (result, is_running(started), is_running(before)),
            (Err(Failure::ModeCancelled), false, true)
        );
        processes.kill_all();
    }
}

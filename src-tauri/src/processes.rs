use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::async_runtime::{self, Receiver, Sender};
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct RecordedProcess {
    pid: u32,
    name: String,
}

struct RunningProcess {
    child: CommandChild,
    name: String,
}

/// Every Component process this launch started. The record on disk mirrors it so a crash leaves the PIDs behind for [`reap_strays`].
#[derive(Clone)]
pub struct Processes {
    running: Arc<Mutex<HashMap<u32, RunningProcess>>>,
    record: PathBuf,
}

impl Processes {
    pub fn new(record: PathBuf) -> Processes {
        Processes {
            running: Arc::default(),
            record,
        }
    }

    pub fn spawn<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        program: &Path,
        args: &[String],
    ) -> Result<(Receiver<CommandEvent>, u32), String> {
        let (events, child) = app
            .shell()
            .command(program)
            .args(args)
            .spawn()
            .map_err(|error| error.to_string())?;
        let pid = child.pid();
        let name = executable_name(&program.to_string_lossy());
        self.running.lock().unwrap().insert(
            pid,
            RunningProcess {
                child,
                name: name.clone(),
            },
        );
        self.write_record();

        let (forward, received) = async_runtime::channel(64);
        let processes = self.clone();
        async_runtime::spawn(async move {
            forward_in_order(&name, events, forward).await;
            processes.forget(pid);
        });
        Ok((received, pid))
    }

    pub fn kill(&self, pid: u32) {
        let running = self.running.lock().unwrap().remove(&pid);
        if let Some(running) = running {
            let _ = running.child.kill();
        }
        self.write_record();
    }

    pub fn kill_all(&self) {
        let running: Vec<RunningProcess> = self
            .running
            .lock()
            .unwrap()
            .drain()
            .map(|(_, running)| running)
            .collect();
        for running in running {
            let _ = running.child.kill();
        }
        self.write_record();
    }

    fn forget(&self, pid: u32) {
        self.running.lock().unwrap().remove(&pid);
        self.write_record();
    }

    fn write_record(&self) {
        let recorded: Vec<RecordedProcess> = self
            .running
            .lock()
            .unwrap()
            .iter()
            .map(|(pid, running)| RecordedProcess {
                pid: *pid,
                name: running.name.clone(),
            })
            .collect();
        if let Some(dir) = self.record.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_vec(&recorded) {
            let _ = std::fs::write(&self.record, json);
        }
    }
}

/// Forwards the plugin's events with the exit status last, logging each line of output under `name`.
/// The plugin sends the exit status as soon as the process exits, possibly ahead of lines its reader threads
/// have yet to send, and its channel closes once they have.
async fn forward_in_order(
    name: &str,
    mut events: Receiver<CommandEvent>,
    forward: Sender<CommandEvent>,
) {
    let mut exit = None;
    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Terminated(_) => exit = Some(event),
            event => {
                if let CommandEvent::Stdout(line) | CommandEvent::Stderr(line) = &event {
                    log::info!("{name}: {}", String::from_utf8_lossy(line).trim_end());
                }
                let _ = forward.send(event).await;
            }
        }
    }
    if let Some(exit) = exit {
        let _ = forward.send(exit).await;
    }
}

/// The file name of an executable without its directory, as both `ps` and `tasklist` report it.
fn executable_name(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

pub fn reap_strays(record: &Path) {
    let Ok(bytes) = std::fs::read(record) else {
        return;
    };
    let recorded: Vec<RecordedProcess> = serde_json::from_slice(&bytes).unwrap_or_default();
    for stray in recorded {
        if find_running_name(stray.pid).is_some_and(|name| name == stray.name) {
            kill_tree(stray.pid);
        }
    }
    let _ = std::fs::remove_file(record);
}

#[cfg(windows)]
fn hidden_command(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = std::process::Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(windows)]
fn find_running_name(pid: u32) -> Option<String> {
    let output = hidden_command("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    let line = String::from_utf8_lossy(&output.stdout);
    let name = line.trim().strip_prefix('"')?.split('"').next()?;
    Some(name.to_string())
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    let _ = hidden_command("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status();
}

#[cfg(unix)]
fn find_running_name(pid: u32) -> Option<String> {
    let output = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .ok()?;
    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!name.is_empty()).then(|| executable_name(&name))
}

#[cfg(unix)]
fn kill_tree(pid: u32) {
    let _ = std::process::Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status();
}

#[cfg(all(test, unix))]
mod tests {
    use std::process::{Child, Command};
    use std::time::{Duration, Instant};

    use tauri::test::{mock_builder, mock_context, noop_assets};
    use tauri_plugin_shell::process::TerminatedPayload;

    use super::*;
    use crate::test_support::{captured_logs, TempDir};

    fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
        mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(mock_context(noop_assets()))
            .unwrap()
    }

    fn sleep_path() -> PathBuf {
        PathBuf::from("/bin/sleep")
    }

    fn is_running(pid: u32) -> bool {
        find_running_name(pid).is_some()
    }

    fn wait_until_gone(pid: u32) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if !is_running(pid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    fn sleeping_child() -> Child {
        Command::new(sleep_path()).arg("30").spawn().unwrap()
    }

    fn record(dir: &TempDir, pid: u32, name: &str) -> PathBuf {
        let record = dir.path().join("processes.json");
        let recorded = vec![RecordedProcess {
            pid,
            name: name.to_string(),
        }];
        std::fs::write(&record, serde_json::to_vec(&recorded).unwrap()).unwrap();
        record
    }

    // @behavior PR-001
    #[test]
    fn records_the_pid_and_name_of_a_launched_process() {
        let dir = TempDir::new("pr-record");
        let app = mock_app();
        let processes = Processes::new(dir.path().join("processes.json"));

        let (_, pid) = processes
            .spawn(app.handle(), &sleep_path(), &["30".to_string()])
            .unwrap();

        let recorded: Vec<RecordedProcess> =
            serde_json::from_slice(&std::fs::read(dir.path().join("processes.json")).unwrap())
                .unwrap();
        processes.kill_all();
        assert_eq!(
            recorded,
            vec![RecordedProcess {
                pid,
                name: "sleep".to_string()
            }]
        );
    }

    // @behavior PR-002
    #[test]
    fn kills_running_processes_at_exit() {
        let dir = TempDir::new("pr-exit");
        let app = mock_app();
        let processes = Processes::new(dir.path().join("processes.json"));
        let (_, pid) = processes
            .spawn(app.handle(), &sleep_path(), &["30".to_string()])
            .unwrap();

        processes.kill_all();

        assert!(wait_until_gone(pid));
    }

    // @behavior PR-003
    #[test]
    fn kills_a_stray_process_still_running_under_its_recorded_name() {
        let dir = TempDir::new("pr-stray");
        let mut child = sleeping_child();
        let record = record(&dir, child.id(), "sleep");

        reap_strays(&record);

        let _ = child.wait();
        assert!(!is_running(child.id()));
    }

    // @behavior PR-004
    #[test]
    fn spares_a_process_that_reused_a_recorded_pid() {
        let dir = TempDir::new("pr-reused");
        let mut child = sleeping_child();
        let record = record(&dir, child.id(), "whisper-cli");

        reap_strays(&record);

        let still_running = child.try_wait().unwrap().is_none();
        let _ = child.kill();
        let _ = child.wait();
        assert!(still_running);
    }

    // @behavior PR-005
    #[test]
    fn delivers_every_line_before_the_exit_status() {
        let (sender, events) = async_runtime::channel(8);
        let (forward, mut received) = async_runtime::channel(8);
        let line = |text: &str| CommandEvent::Stderr(text.as_bytes().to_vec());
        async_runtime::block_on(async move {
            sender.send(line("50%")).await.unwrap();
            // The shell plugin sends the exit status as soon as the process exits, even while a reader still holds its last lines.
            sender
                .send(CommandEvent::Terminated(TerminatedPayload {
                    code: Some(0),
                    signal: None,
                }))
                .await
                .unwrap();
            sender.send(line("100%")).await.unwrap();
        });

        async_runtime::block_on(forward_in_order("whisper-cli", events, forward));

        let mut order = Vec::new();
        while let Some(event) = received.blocking_recv() {
            order.push(match event {
                CommandEvent::Stderr(bytes) => String::from_utf8(bytes).unwrap(),
                CommandEvent::Terminated(_) => "exit".to_string(),
                _ => "other".to_string(),
            });
        }
        assert_eq!(order, vec!["50%", "100%", "exit"]);
    }

    // @behavior OB-003
    #[test]
    fn logs_each_output_line_under_the_executable_name() {
        let (sender, events) = async_runtime::channel(8);
        let (forward, _received) = async_runtime::channel(8);
        async_runtime::block_on(async move {
            sender
                .send(CommandEvent::Stderr(b"load time = 1384 ms\n".to_vec()))
                .await
                .unwrap();
        });

        let logs = captured_logs(|| {
            async_runtime::block_on(forward_in_order("whisper-cli", events, forward))
        });

        assert_eq!(logs, vec!["whisper-cli: load time = 1384 ms"]);
    }
}

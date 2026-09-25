use std::collections::VecDeque;
use std::path::Path;

use tokio::sync::mpsc::Receiver;
use tokio::sync::watch;

use crate::failure::Failure;

pub mod commands;

const STDERR_TAIL_LINES: usize = 5;

/// What a started Component does: each line it writes, without its line ending, and last how it ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepEvent {
    Stdout(String),
    Stderr(String),
    Error(String),
    Exit(Option<i32>),
}

pub trait Steps {
    fn start(&self, program: &Path, args: &[String]) -> Result<(Receiver<StepEvent>, u32), String>;
    fn stop(&self, pid: u32);
}

/// Runs one Step to completion. A Step that exits non-zero fails with the last lines it wrote to stderr.
pub async fn run_step(
    steps: &impl Steps,
    step: &str,
    program: &Path,
    args: &[String],
    mut on_stderr_line: impl FnMut(&str),
    mut on_stdout_line: impl FnMut(&str),
) -> Result<(), Failure> {
    let failed = |detail: String| Failure::StepFailed {
        step: step.to_string(),
        detail,
    };
    let (mut events, _) = steps.start(program, args).map_err(failed)?;
    let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(STDERR_TAIL_LINES + 1);
    while let Some(event) = events.recv().await {
        match event {
            StepEvent::Stderr(line) => {
                on_stderr_line(&line);
                stderr_tail.push_back(line);
                if stderr_tail.len() > STDERR_TAIL_LINES {
                    stderr_tail.pop_front();
                }
            }
            StepEvent::Stdout(line) => on_stdout_line(&line),
            StepEvent::Error(error) => return Err(failed(error)),
            StepEvent::Exit(Some(0)) => return Ok(()),
            StepEvent::Exit(_) => return Err(failed(Vec::from(stderr_tail).join("\n"))),
        }
    }
    Err(failed(
        "the process ended without an exit status".to_string(),
    ))
}

/// Lets one Mode run at a time: another waits its turn rather than unloading or stopping the
/// Model the running one uses. The Mode whose turn it is can be asked to stop.
pub struct ModeLock {
    turn: tokio::sync::Mutex<()>,
    cancel: watch::Sender<bool>,
}

impl Default for ModeLock {
    fn default() -> ModeLock {
        ModeLock {
            turn: tokio::sync::Mutex::default(),
            cancel: watch::channel(false).0,
        }
    }
}

impl ModeLock {
    /// Waits until no other Mode runs; the Mode keeps its turn until the answer is dropped. A
    /// cancel asked before the turn begins is forgotten.
    pub async fn wait_turn(&self) -> Turn<'_> {
        let guard = self.turn.lock().await;
        self.cancel.send_replace(false);
        Turn {
            _guard: guard,
            cancel: self.cancel.subscribe(),
        }
    }

    /// Asks the Mode whose turn it is to stop.
    pub fn cancel(&self) {
        self.cancel.send_replace(true);
    }
}

/// One Mode's turn to run, which it may be asked to give up.
pub struct Turn<'a> {
    _guard: tokio::sync::MutexGuard<'a, ()>,
    cancel: watch::Receiver<bool>,
}

impl Turn<'_> {
    /// Resolves once the Mode is asked to stop.
    pub async fn wait_for_cancel(&mut self) {
        if self
            .cancel
            .wait_for(|is_cancelled| *is_cancelled)
            .await
            .is_err()
        {
            std::future::pending::<()>().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use super::*;

    // @behavior PR-006
    #[tokio::test]
    async fn starts_a_mode_only_once_the_running_one_ends() {
        let lock = Arc::new(ModeLock::default());
        let order = Arc::new(std::sync::Mutex::new(Vec::new()));
        let turn = lock.wait_turn().await;

        let waiting = tokio::spawn({
            let (lock, order) = (Arc::clone(&lock), Arc::clone(&order));
            async move {
                let _turn = lock.wait_turn().await;
                order.lock().unwrap().push("second starts");
            }
        });
        tokio::time::sleep(Duration::from_millis(50)).await;
        order.lock().unwrap().push("first ends");
        drop(turn);
        waiting.await.unwrap();

        assert_eq!(*order.lock().unwrap(), vec!["first ends", "second starts"]);
    }

    // @behavior PR-008
    #[tokio::test]
    async fn clears_a_cancel_once_the_next_mode_takes_its_turn() {
        let lock = ModeLock::default();
        lock.cancel();

        let mut turn = lock.wait_turn().await;
        let is_cancelled = tokio::select! {
            () = turn.wait_for_cancel() => true,
            () = tokio::time::sleep(Duration::from_millis(50)) => false,
        };

        assert!(!is_cancelled);
    }
}

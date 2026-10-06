use std::collections::VecDeque;
use std::future::Future;
use std::io;
use std::path::{Path, PathBuf};

use tokio::sync::mpsc::Receiver;
use tokio::sync::watch;

use crate::conversion::{conversion_args, SPEECH_SAMPLE_RATE};
use crate::failure::Failure;
use crate::progress::{enter, Progress};
use crate::project::{CurrentProject, ResourceHold};
use crate::timing::{Phase, Phases};
use crate::transcript::AudioWindow;

pub mod commands;

const STDERR_TAIL_LINES: usize = 5;

/// The directory in the app's cache that holds what Steps write along the way, one directory a run.
pub const WORK_DIR: &str = "work";

// What each Step is called when it fails, which is how the webview names it to the user
pub const CONVERSION_STEP: &str = "convert";
pub const TRANSCRIPTION_STEP: &str = "transcribe";
pub const DIARIZATION_STEP: &str = "diarize";
pub const WAVEFORM_STEP: &str = "waveform";
pub const TRANSLATION_STEP: &str = "translate";

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
    /// Stops every Component these Steps started that still runs, and none started elsewhere.
    fn stop_started(&self);
}

/// Converts `media`, or only its `window`, to the speech WAV `wav` in the Conversion Phase, and
/// answers how many bytes the WAV holds.
pub async fn convert_speech(
    ports: &(impl Progress + Steps),
    phases: &mut Phases,
    ffmpeg: &Path,
    media: &Path,
    window: Option<AudioWindow>,
    wav: &Path,
) -> Result<u64, Failure> {
    enter(ports, phases, Phase::Conversion);
    run_step(
        ports,
        CONVERSION_STEP,
        ffmpeg,
        &conversion_args(media, wav, SPEECH_SAMPLE_RATE, window),
        |_| {},
        |_| {},
    )
    .await?;
    Ok(std::fs::metadata(wav)?.len())
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
    let step_failure = |detail: String| Failure::StepFailed {
        step: step.to_string(),
        detail,
    };
    let (mut events, _) = steps.start(program, args).map_err(step_failure)?;
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
            StepEvent::Error(error) => return Err(step_failure(error)),
            StepEvent::Exit(Some(0)) => return Ok(()),
            StepEvent::Exit(_) => return Err(step_failure(Vec::from(stderr_tail).join("\n"))),
        }
    }
    Err(step_failure(
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
        self.start_turn(guard)
    }

    /// The turn when no Mode runs, taken without waiting; none while one does.
    pub fn try_turn(&self) -> Option<Turn<'_>> {
        let guard = self.turn.try_lock().ok()?;
        Some(self.start_turn(guard))
    }

    fn start_turn<'a>(&'a self, guard: tokio::sync::MutexGuard<'a, ()>) -> Turn<'a> {
        self.cancel.send_replace(false);
        Turn {
            _guard: guard,
            cancel: self.cancel.subscribe(),
        }
    }

    /// Waits for the Mode Run before to end, then begins one whose Components are started
    /// through `ports` alone.
    pub async fn begin<P: Steps>(&self, ports: P) -> ModeRun<'_, P> {
        ModeRun {
            turn: self.wait_turn().await,
            ports,
            kept_guards: std::sync::Mutex::default(),
        }
    }

    /// Asks the Mode whose turn it is to stop.
    pub fn cancel(&self) {
        self.cancel.send_replace(true);
    }
}

/// One run of a Mode, from taking its turn to its end, and the ports it starts its Components
/// through, so a cancel stops those and nothing else.
pub struct ModeRun<'a, P> {
    turn: Turn<'a>,
    ports: P,
    /// What the run keeps until it ends, such as its hold on the Resource it writes.
    kept_guards: std::sync::Mutex<Vec<Box<dyn Send + 'a>>>,
}

impl<'a, P: Steps> ModeRun<'a, P> {
    pub fn ports(&self) -> &P {
        &self.ports
    }

    /// Keeps `guard` until the Mode Run ends, however it ends.
    pub fn keep(&self, guard: impl Send + 'a) {
        self.kept_guards.lock().unwrap().push(Box::new(guard));
    }

    /// Runs `task` until it ends or the Mode Run is asked to stop; then the Components it
    /// started are stopped and it fails as `mode-cancelled`; what it showed ends with its hold.
    pub async fn run_until_cancelled<T>(
        &self,
        task: impl Future<Output = Result<T, Failure>>,
    ) -> Result<T, Failure> {
        tokio::select! {
            result = task => result,
            () = self.turn.wait_for_cancel() => {
                self.ports.stop_started();
                Err(Failure::ModeCancelled)
            }
        }
    }
}

/// The shape every Mode takes, so one skeleton holds, runs and cancels each of them; the Modes
/// stay a fixed set, each run on its own.
pub trait Mode {
    /// Names the Mode's Phases, its log and its work directory.
    const NAME: &'static str;
    /// What the Mode works on, taken with its hold.
    type Target;
    type Outcome;

    fn hold<'p>(
        &self,
        project: &'p CurrentProject,
    ) -> Result<(Self::Target, ResourceHold<'p>), Failure>;

    fn run<'a, P: Progress + Steps + Sync>(
        &self,
        run: &ModeRun<'a, P>,
        project: &'a CurrentProject,
        target: Self::Target,
        phases: Phases,
    ) -> impl Future<Output = Result<Self::Outcome, Failure>> + Send;

    /// Frees what a cancelled run leaves behind outside its Components; most leave nothing.
    fn release_cancelled(&self) -> impl Future<Output = ()> + Send {
        async {}
    }
}

/// Runs `mode` until it ends or is cancelled, holding its target from the start of the run to
/// its end.
pub async fn run_mode<'a, M: Mode>(
    mode: &M,
    run: &ModeRun<'a, impl Progress + Steps + Sync>,
    project: &'a CurrentProject,
    phases: Phases,
) -> Result<M::Outcome, Failure> {
    let result = run
        .run_until_cancelled(async {
            let (target, hold) = mode.hold(project)?;
            run.keep(hold);
            mode.run(run, project, target, phases).await
        })
        .await;
    if matches!(result, Err(Failure::ModeCancelled)) {
        mode.release_cancelled().await;
    }
    result
}

/// One Mode's turn to run, which it may be asked to give up.
pub struct Turn<'a> {
    _guard: tokio::sync::MutexGuard<'a, ()>,
    cancel: watch::Receiver<bool>,
}

impl Turn<'_> {
    /// Resolves once the Mode is asked to stop.
    pub async fn wait_for_cancel(&self) {
        let mut cancel = self.cancel.clone();
        if cancel.wait_for(|is_cancelled| *is_cancelled).await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

/// The directory a Mode writes its intermediate files to, removed with them once the
/// Mode's run ends, however it ends.
pub struct WorkDir(pub PathBuf);

impl WorkDir {
    /// Creates the directory at `path`; one left half made by a failure is removed all the same.
    pub fn try_new(path: &Path) -> io::Result<WorkDir> {
        let work = WorkDir(path.to_path_buf());
        std::fs::create_dir_all(&work.0)?;
        Ok(work)
    }
}

impl Drop for WorkDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
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

        let waiting_task = tokio::spawn({
            let (lock, order) = (Arc::clone(&lock), Arc::clone(&order));
            async move {
                let _turn = lock.wait_turn().await;
                order.lock().unwrap().push("second starts");
            }
        });
        tokio::time::sleep(Duration::from_millis(50)).await;
        order.lock().unwrap().push("first ends");
        drop(turn);
        waiting_task.await.unwrap();

        assert_eq!(*order.lock().unwrap(), vec!["first ends", "second starts"]);
    }

    // @behavior PR-008
    #[tokio::test]
    async fn clears_a_cancel_once_the_next_mode_takes_its_turn() {
        let lock = ModeLock::default();
        lock.cancel();

        let turn = lock.wait_turn().await;
        let is_cancelled = tokio::select! {
            () = turn.wait_for_cancel() => true,
            () = tokio::time::sleep(Duration::from_millis(50)) => false,
        };

        assert!(!is_cancelled);
    }
}

use std::fmt;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::timing::Phases;

/// One timed part of a Mode's run, named in `pipeline-progress`, in the seconds each took and in the log.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Prepare,
    Convert,
    Load,
    Transcribe,
    Detect,
    Translate,
}

impl fmt::Display for Phase {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Phase::Prepare => "prepare",
            Phase::Convert => "convert",
            Phase::Load => "load",
            Phase::Transcribe => "transcribe",
            Phase::Detect => "detect",
            Phase::Translate => "translate",
        })
    }
}

pub trait Progress {
    fn report(&self, phase: Phase, percent: Option<u8>);
    /// Reports a Phase that works through `total` things and has finished `done` of them.
    fn report_count(&self, phase: Phase, done: usize, total: usize);
    fn announce_project(&self);
}

/// Ends the current Phase and tells the webview the next one has started.
pub fn enter(progress: &impl Progress, phases: &mut Phases, phase: Phase) {
    phases.enter(phase);
    progress.report(phase, None);
}

/// Sent as each Phase starts and as its percentage changes; a Phase that cannot tell how far along it is has no percentage.
#[derive(Clone, Serialize)]
struct PipelineProgress {
    phase: Phase,
    percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    count: Option<Count>,
}

/// How many of the things a Phase works through it has finished.
#[derive(Clone, Serialize)]
struct Count {
    done: usize,
    total: usize,
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, progress: PipelineProgress) {
    // @event pipeline-progress
    let _ = app.emit("pipeline-progress", progress);
}

impl<R: Runtime> Progress for AppHandle<R> {
    fn report(&self, phase: Phase, percent: Option<u8>) {
        emit_progress(
            self,
            PipelineProgress {
                phase,
                percent,
                count: None,
            },
        );
    }

    fn report_count(&self, phase: Phase, done: usize, total: usize) {
        emit_progress(
            self,
            PipelineProgress {
                phase,
                percent: Some((done * 100 / total.max(1)) as u8),
                count: Some(Count { done, total }),
            },
        );
    }

    fn announce_project(&self) {
        // @event project-changed
        let _ = self.emit("project-changed", ());
    }
}

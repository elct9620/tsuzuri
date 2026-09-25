use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::timing::Phases;

pub trait Progress {
    fn report(&self, phase: &'static str, percent: Option<u8>);
    /// Reports a Phase that works through `total` things and has finished `done` of them.
    fn report_count(&self, phase: &'static str, done: usize, total: usize);
    fn announce_project(&self);
}

/// Ends the current Phase and tells the webview the next one has started.
pub fn enter(progress: &impl Progress, phases: &mut Phases, phase: &'static str) {
    phases.enter(phase);
    progress.report(phase, None);
}

/// Sent as each Phase starts and as its percentage changes; a Phase that cannot tell how far along it is has no percentage.
#[derive(Clone, Serialize)]
struct PipelineProgress {
    phase: &'static str,
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
    fn report(&self, phase: &'static str, percent: Option<u8>) {
        emit_progress(
            self,
            PipelineProgress {
                phase,
                percent,
                count: None,
            },
        );
    }

    fn report_count(&self, phase: &'static str, done: usize, total: usize) {
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

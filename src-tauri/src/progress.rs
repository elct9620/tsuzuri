use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::timing::Phases;

pub trait Progress {
    fn report(&self, phase: &'static str, percent: Option<u8>);
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
}

impl<R: Runtime> Progress for AppHandle<R> {
    fn report(&self, phase: &'static str, percent: Option<u8>) {
        let _ = self.emit("pipeline-progress", PipelineProgress { phase, percent });
    }

    fn announce_project(&self) {
        let _ = self.emit("project-changed", ());
    }
}

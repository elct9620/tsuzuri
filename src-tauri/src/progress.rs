use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_specta::Event;

use crate::timing::{Phase, Phases};

pub trait Progress {
    fn report(&self, phase: Phase, percent: Option<u8>);
    /// Reports a Phase that works through `total` things and has finished `done_count` of them.
    fn report_count(&self, phase: Phase, done_count: usize, total: usize);
    fn announce_project(&self);
}

/// Ends the current Phase and tells the webview the next one has started.
pub fn enter(progress: &impl Progress, phases: &mut Phases, phase: Phase) {
    phases.enter(phase);
    progress.report(phase, None);
}

/// Sent as each Phase starts and as its percentage changes; a Phase that cannot tell how far along it is has no percentage.
// @event pipeline-progress
#[derive(Clone, Serialize, specta::Type, Event)]
#[tauri_specta(event_name = "pipeline-progress")]
pub struct PipelineProgress {
    phase: Phase,
    percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(type = Count)]
    count: Option<Count>,
}

/// How many of the things a Phase works through it has finished.
#[derive(Clone, Serialize, specta::Type)]
pub struct Count {
    done_count: usize,
    total: usize,
}

/// The Project changed; the webview reads it again.
// @event project-changed
#[derive(Clone, Serialize, Deserialize, specta::Type, Event)]
#[tauri_specta(event_name = "project-changed")]
pub struct ProjectChanged;

fn emit_progress<R: Runtime>(app: &AppHandle<R>, progress: PipelineProgress) {
    let _ = progress.emit(app);
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

    fn report_count(&self, phase: Phase, done_count: usize, total: usize) {
        emit_progress(
            self,
            PipelineProgress {
                phase,
                percent: Some((done_count * 100 / total.max(1)) as u8),
                count: Some(Count { done_count, total }),
            },
        );
    }

    fn announce_project(&self) {
        let _ = ProjectChanged.emit(self);
    }
}

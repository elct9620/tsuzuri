use std::time::Instant;

use std::fmt;

use serde::Serialize;

/// One timed part of a Mode's run, named in `pipeline-progress`, in the seconds each took and in the log.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub enum Phase {
    #[serde(rename = "prepare")]
    Preparation,
    #[serde(rename = "convert")]
    Conversion,
    #[serde(rename = "load")]
    Loading,
    #[serde(rename = "transcribe")]
    Transcription,
    #[serde(rename = "detect")]
    Detection,
    #[serde(rename = "translate")]
    Translation,
}

/// Written in the log as the webview is sent it.
impl fmt::Display for Phase {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(formatter)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
pub struct PhaseTiming {
    pub phase: Phase,
    #[specta(type = specta_typescript::Number)]
    pub seconds: f64,
}

/// Times the Phases of one Mode run: each Phase ends when the next is entered, and is logged as it ends.
pub struct Phases {
    mode: &'static str,
    current: (Phase, Instant),
    timings: Vec<PhaseTiming>,
}

impl Phases {
    pub fn start(mode: &'static str, phase: Phase) -> Phases {
        Phases {
            mode,
            current: (phase, Instant::now()),
            timings: Vec::new(),
        }
    }

    pub fn enter(&mut self, phase: Phase) {
        let (finished, started) = std::mem::replace(&mut self.current, (phase, Instant::now()));
        self.record(finished, started);
    }

    /// Ends the current Phase and answers every Phase in the order it ran.
    pub fn finish(mut self) -> Vec<PhaseTiming> {
        let (phase, started) = self.current;
        self.record(phase, started);
        self.timings
    }

    fn record(&mut self, phase: Phase, start: Instant) {
        let seconds = start.elapsed().as_secs_f64();
        log::info!("{}: {phase} took {seconds:.2}s", self.mode);
        self.timings.push(PhaseTiming { phase, seconds });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::captured_logs;

    // @behavior OB-001
    #[test]
    fn logs_a_phase_when_the_next_one_starts() {
        let mut phases = Phases::start("transcribe", Phase::Preparation);

        let logs = captured_logs(|| phases.enter(Phase::Conversion));

        assert_eq!(logs.len(), 1);
        assert!(logs[0].starts_with("transcribe: prepare took "));
        assert!(logs[0].ends_with('s'));
    }

    // @behavior OB-002
    #[test]
    fn answers_every_phase_in_the_order_it_ran() {
        let mut phases = Phases::start("transcribe", Phase::Preparation);
        phases.enter(Phase::Conversion);

        let timings = phases.finish();

        let names: Vec<_> = timings.iter().map(|timing| timing.phase).collect();
        assert_eq!(names, vec![Phase::Preparation, Phase::Conversion]);
        assert!(timings.iter().all(|timing| timing.seconds >= 0.0));
    }
}

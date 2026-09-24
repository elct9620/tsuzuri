use std::time::Instant;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PhaseTiming {
    pub phase: &'static str,
    pub seconds: f64,
}

/// Times the Phases of one Mode run: each Phase ends when the next is entered, and is logged as it ends.
pub struct Phases {
    mode: &'static str,
    current: (&'static str, Instant),
    finished: Vec<PhaseTiming>,
}

impl Phases {
    pub fn start(mode: &'static str, phase: &'static str) -> Phases {
        Phases {
            mode,
            current: (phase, Instant::now()),
            finished: Vec::new(),
        }
    }

    pub fn enter(&mut self, phase: &'static str) {
        let (finished, started) = std::mem::replace(&mut self.current, (phase, Instant::now()));
        self.record(finished, started);
    }

    /// Ends the current Phase and answers every Phase in the order it ran.
    pub fn finish(mut self) -> Vec<PhaseTiming> {
        let (phase, started) = self.current;
        self.record(phase, started);
        self.finished
    }

    fn record(&mut self, phase: &'static str, started: Instant) {
        let seconds = started.elapsed().as_secs_f64();
        log::info!("{}: {phase} took {seconds:.2}s", self.mode);
        self.finished.push(PhaseTiming { phase, seconds });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::captured_logs;

    // @behavior OB-001
    #[test]
    fn logs_a_phase_when_the_next_one_starts() {
        let mut phases = Phases::start("transcribe", "prepare");

        let logs = captured_logs(|| phases.enter("convert"));

        assert_eq!(logs.len(), 1);
        assert!(logs[0].starts_with("transcribe: prepare took "));
        assert!(logs[0].ends_with('s'));
    }

    // @behavior OB-002
    #[test]
    fn answers_every_phase_in_the_order_it_ran() {
        let mut phases = Phases::start("transcribe", "prepare");
        phases.enter("convert");

        let timings = phases.finish();

        let names: Vec<_> = timings.iter().map(|timing| timing.phase).collect();
        assert_eq!(names, vec!["prepare", "convert"]);
        assert!(timings.iter().all(|timing| timing.seconds >= 0.0));
    }
}

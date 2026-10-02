//! The diarize Step: the app's own executable started as a child process, so the diarization
//! Model runs, and fails, apart from the window, and leaves no memory behind when it exits.

use std::io::Write;
use std::path::Path;

use super::features::wav_samples;
use super::sortformer::Sortformer;
use super::streaming::Diarizer;
use super::DiarizationError;

/// The first argument that starts the diarize Step instead of the app.
pub const DIARIZE_ARGUMENT: &str = "diarize";
const PROGRESS_MARK: &str = "diarize: progress = ";

/// Runs the diarize Step when `args` (the program first) ask for it, answering its exit code.
pub fn run_diarize_subcommand(args: &[String], stderr: &mut impl Write) -> Option<i32> {
    if args.get(1).map(String::as_str) != Some(DIARIZE_ARGUMENT) {
        return None;
    }
    let [model, audio, turns] = &args[2..] else {
        let _ = writeln!(
            stderr,
            "usage: {DIARIZE_ARGUMENT} <model.gguf> <audio.wav> <turns.json>"
        );
        return Some(1);
    };
    match write_turns(model.as_ref(), audio.as_ref(), turns.as_ref(), stderr) {
        Ok(()) => Some(0),
        Err(error) => {
            let _ = writeln!(stderr, "{error}");
            Some(1)
        }
    }
}

fn write_turns(
    model: &Path,
    audio: &Path,
    turns_path: &Path,
    stderr: &mut impl Write,
) -> Result<(), DiarizationError> {
    let mut diarizer = Diarizer::new(Sortformer::load(model)?);
    let samples = wav_samples(&std::fs::read(audio)?)?;
    let turns = diarizer.turns(&samples, |done, total| {
        let _ = writeln!(stderr, "{}", progress_line(done, total));
    })?;
    let json =
        serde_json::to_vec(&turns).map_err(|error| DiarizationError::Engine(error.to_string()))?;
    std::fs::write(turns_path, json)?;
    Ok(())
}

/// The line the diarize Step writes once `done` of its `total` chunks are done.
pub fn progress_line(done: usize, total: usize) -> String {
    format!("{PROGRESS_MARK}{}%", done * 100 / total.max(1))
}

/// The percentage a progress line of the diarize Step reports.
pub fn progress(line: &str) -> Option<u8> {
    line.strip_prefix(PROGRESS_MARK)?
        .strip_suffix('%')?
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(rest: &[&str]) -> Vec<String> {
        std::iter::once("tsuzuri")
            .chain(rest.iter().copied())
            .map(String::from)
            .collect()
    }

    // @behavior DZ-005
    #[test]
    fn reports_how_far_a_diarization_has_come() {
        assert_eq!(progress(&progress_line(2, 4)), Some(50));
    }

    // @behavior DZ-006
    #[test]
    fn fails_a_diarize_step_whose_model_cannot_be_loaded() {
        let mut stderr = Vec::new();

        let code = run_diarize_subcommand(
            &args(&[
                DIARIZE_ARGUMENT,
                "/no/model.gguf",
                "/no/audio.wav",
                "/no/turns.json",
            ]),
            &mut stderr,
        );

        assert_eq!(
            (code, !String::from_utf8(stderr).unwrap().trim().is_empty()),
            (Some(1), true)
        );
    }

    #[test]
    fn leaves_the_app_to_start_without_the_diarize_argument() {
        assert_eq!(run_diarize_subcommand(&args(&[]), &mut Vec::new()), None);
    }

    #[test]
    fn refuses_a_diarize_call_missing_its_arguments() {
        assert_eq!(
            run_diarize_subcommand(&args(&[DIARIZE_ARGUMENT, "model.gguf"]), &mut Vec::new()),
            Some(1)
        );
    }
}

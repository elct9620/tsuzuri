//! The script Step: the app's own executable started as a child process, so a user's Script
//! runs, and fails or hangs, apart from the window, and is ended by stopping the process.

use std::io::Write;
use std::path::Path;

use serde::Deserialize;

use super::interpreter::ScriptInterpreter;
use super::registry::ScriptFailure;
use super::snapshot::{ExportInput, Snapshot};

/// The first argument that starts the script Step instead of the app.
pub const SCRIPT_ARGUMENT: &str = "script";

/// Runs the script Step when `args` (the program first) ask for it, answering its exit code.
pub fn run_script_subcommand(args: &[String], stderr: &mut impl Write) -> Option<i32> {
    if args.get(1).map(String::as_str) != Some(SCRIPT_ARGUMENT) {
        return None;
    }
    let outcome = match &args[2..] {
        [mode, script, output] if mode == "scan" => write_registrations(script, output),
        [mode, script, id, input, output] if mode == "format" => {
            write_formatted_text(script, id, input, output)
        }
        [mode, script, id, input, output] if mode == "macro" => {
            write_macro_edits(script, id, input, output)
        }
        _ => {
            let _ = writeln!(
                stderr,
                "usage: {SCRIPT_ARGUMENT} scan <script.rb> <registrations.json>\n       \
                 {SCRIPT_ARGUMENT} format <script.rb> <id> <input.json> <text>\n       \
                 {SCRIPT_ARGUMENT} macro <script.rb> <id> <snapshot.json> <edits.json>"
            );
            return Some(1);
        }
    };
    match outcome {
        Ok(()) => Some(0),
        Err(message) => {
            let _ = writeln!(stderr, "{message}");
            Some(1)
        }
    }
}

fn load_interpreter(script: &str) -> Result<ScriptInterpreter, String> {
    let source = std::fs::read_to_string(script).map_err(|error| error.to_string())?;
    ScriptInterpreter::load(&source).map_err(failure_message)
}

fn write_registrations(script: &str, output: &str) -> Result<(), String> {
    let registrations = load_interpreter(script)?
        .registrations()
        .map_err(failure_message)?;
    write_json(output, &registrations)
}

fn write_formatted_text(script: &str, id: &str, input: &str, output: &str) -> Result<(), String> {
    let interpreter = load_interpreter(script)?;
    let input: ExportInput = read_json(input)?;
    let text = interpreter
        .format_text(id, &input.snapshot, &input.options)
        .map_err(failure_message)?;
    std::fs::write(output, text).map_err(|error| error.to_string())
}

fn write_macro_edits(script: &str, id: &str, input: &str, output: &str) -> Result<(), String> {
    let interpreter = load_interpreter(script)?;
    let snapshot: Snapshot = read_json(input)?;
    let edits = interpreter
        .record_macro_edits(id, &snapshot)
        .map_err(failure_message)?;
    write_json(output, &edits)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &str) -> Result<T, String> {
    let bytes = std::fs::read(Path::new(path)).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn write_json(path: &str, value: &impl serde::Serialize) -> Result<(), String> {
    let json = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    std::fs::write(path, json).map_err(|error| error.to_string())
}

/// The message the app reads from the script Step's error output; a Script only raises here, as
/// its declaration and its Segments are checked by the app.
fn failure_message(failure: ScriptFailure) -> String {
    match failure {
        ScriptFailure::Raised { message } => message,
        other => format!("{other:?}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::registry::Registration;
    use crate::test_support::TempDir;

    fn args(rest: &[&str]) -> Vec<String> {
        std::iter::once("tsuzuri")
            .chain(std::iter::once(SCRIPT_ARGUMENT))
            .chain(rest.iter().copied())
            .map(String::from)
            .collect()
    }

    fn path(dir: &TempDir, name: &str) -> String {
        dir.path().join(name).to_string_lossy().into_owned()
    }

    // @behavior SR-015
    #[test]
    fn writes_what_a_script_registers_as_a_child_of_the_app() {
        let dir = TempDir::new("script-scan");
        let script = path(&dir, "macro.rb");
        let output = path(&dir, "registrations.json");
        std::fs::write(&script, "Tsuzuri.macro(:a) {}").unwrap();

        let code = run_script_subcommand(&args(&["scan", &script, &output]), &mut Vec::new());

        let registrations: Vec<Registration> = read_json(&output).unwrap();
        assert_eq!(
            (code, registrations),
            (
                Some(0),
                vec![Registration::Macro {
                    id: "a".to_string(),
                    label: "a".to_string()
                }]
            )
        );
    }

    // @behavior SR-016
    #[test]
    fn reports_a_failing_script_on_its_error_output() {
        let dir = TempDir::new("script-scan-failure");
        let script = path(&dir, "broken.rb");
        std::fs::write(&script, "raise 'boom'").unwrap();
        let mut stderr = Vec::new();

        let code = run_script_subcommand(
            &args(&["scan", &script, &path(&dir, "registrations.json")]),
            &mut stderr,
        );

        assert_eq!(
            (code, String::from_utf8(stderr).unwrap()),
            (Some(1), "boom\n".to_string())
        );
    }

    #[test]
    fn writes_the_text_of_an_export_format() {
        let dir = TempDir::new("script-format");
        let script = path(&dir, "format.rb");
        let input = path(&dir, "input.json");
        let output = path(&dir, "output.txt");
        std::fs::write(
            &script,
            "Tsuzuri.format(:count) { |s, o| s.segments.size.to_s }",
        )
        .unwrap();
        std::fs::write(
            &input,
            r#"{"snapshot": {"primary": "en", "languages": ["en"], "segments": [], "checked_segments": []},
                "options": {"has_speakers": true, "has_blank_lines": true, "speaker_names": {}}}"#,
        )
        .unwrap();

        let code = run_script_subcommand(
            &args(&["format", &script, "count", &input, &output]),
            &mut Vec::new(),
        );

        assert_eq!(
            (code, std::fs::read_to_string(&output).unwrap()),
            (Some(0), "0".to_string())
        );
    }

    #[test]
    fn leaves_the_app_to_start_without_the_script_argument() {
        let args = vec!["tsuzuri".to_string()];
        assert_eq!(run_script_subcommand(&args, &mut Vec::new()), None);
    }

    #[test]
    fn refuses_a_script_call_missing_its_arguments() {
        assert_eq!(
            run_script_subcommand(&args(&["scan"]), &mut Vec::new()),
            Some(1)
        );
    }
}

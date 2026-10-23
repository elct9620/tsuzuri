//! User Scripts: Export Formats and Macros written in Ruby, run in mruby apart from the app.

use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::failure::Failure;
use crate::progress::{enter, Progress};
use crate::project::{CurrentProject, MacroTarget, ResourceHold};
use crate::steps::{run_step, Mode, ModeRun, Steps, WorkDir, SCRIPT_STEP};
use crate::timing::{Phase, Phases};
use registry::{ApiVersion, Registration, ScriptFailure};
use snapshot::{ExportInput, SnapshotSegment};
use subcommand::SCRIPT_ARGUMENT;

pub mod commands;
pub mod interpreter;
pub mod registry;
pub mod snapshot;
pub mod subcommand;

/// The directory under the app's settings that holds this machine's Scripts.
pub const SCRIPTS_DIR: &str = "scripts";
/// The extension a Script file has.
const SCRIPT_EXTENSION: &str = "rb";
/// How long loading a Script to read what it registers may take; it only registers, so a Script
/// taking longer hangs, and nobody is there to cancel a scan.
pub const SCAN_TIMEOUT: Duration = Duration::from_secs(1);

/// One Script found among this machine's, with what it registers or why it does not load.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct ScannedScript {
    /// Its file name, which names it in the menus and to the commands.
    pub name: String,
    pub registrations: Vec<Registration>,
    pub failure: Option<ScriptFailure>,
}

/// Which Export Format to run, by the Script file it is in and its id, with the Export menu's
/// choices of Speakers and blank lines.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, specta::Type)]
pub struct ExportFormatRequest {
    pub script: String,
    pub id: String,
    pub has_speakers: bool,
    pub has_blank_lines: bool,
}

/// What the last scan found, by Script file, with the hash of the source it was found in, so a
/// Script is loaded again only once it changes.
#[derive(Default)]
pub struct ScriptRegistry(Mutex<HashMap<PathBuf, (u64, ScannedScript)>>);

/// Where the Script `name` is among the Scripts in `dir`, refused when the name reaches outside.
pub fn script_path(dir: &Path, name: &str) -> Result<PathBuf, Failure> {
    let path = dir.join(name);
    let is_inside = path.parent() == Some(dir)
        && path
            .extension()
            .is_some_and(|extension| extension == SCRIPT_EXTENSION);
    if is_inside {
        Ok(path)
    } else {
        Err(Failure::Internal {
            detail: format!("{name} is not a Script in {}", dir.display()),
        })
    }
}

/// What each Script in `dir` registers, by file name, loading again only those changed since
/// `registry` last found them, or every one when `is_forced`. Each is loaded by `tsuzuri`, the
/// app's own executable, through `steps`, and a work file in `work`.
pub async fn scan(
    dir: &Path,
    registry: &ScriptRegistry,
    steps: &impl Steps,
    tsuzuri: &Path,
    work: &Path,
    is_forced: bool,
) -> Result<Vec<ScannedScript>, Failure> {
    let mut paths: Vec<PathBuf> = match std::fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(|entry| Some(entry.ok()?.path()))
            .filter(|path| {
                path.extension()
                    .is_some_and(|extension| extension == SCRIPT_EXTENSION)
            })
            .collect(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => vec![],
        Err(error) => return Err(error.into()),
    };
    paths.sort();
    let _work = WorkDir::try_new(work)?;
    let mut scanned = Vec::new();
    for path in paths {
        let source = std::fs::read_to_string(&path)?;
        let hash = source_hash(&source);
        let known = registry.0.lock().unwrap().get(&path).cloned();
        let script = match known {
            Some((known_hash, script)) if known_hash == hash && !is_forced => script,
            _ => scan_script(&path, &source, steps, tsuzuri, work).await,
        };
        registry
            .0
            .lock()
            .unwrap()
            .insert(path, (hash, script.clone()));
        scanned.push(script);
    }
    registry.0.lock().unwrap().retain(|path, _| path.exists());
    Ok(scanned)
}

fn source_hash(source: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    hasher.finish()
}

async fn scan_script(
    path: &Path,
    source: &str,
    steps: &impl Steps,
    tsuzuri: &Path,
    work: &Path,
) -> ScannedScript {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let output = work.join(format!("{name}.json"));
    let registrations = match ApiVersion::declared_in(source) {
        Err(failure) => Err(failure),
        Ok(declared) if !declared.is_loadable() => {
            Err(ScriptFailure::UnsupportedApiVersion { declared })
        }
        Ok(_) => {
            let args = [SCRIPT_ARGUMENT, "scan"]
                .map(String::from)
                .into_iter()
                .chain([path, output.as_path()].map(|arg| arg.to_string_lossy().into_owned()))
                .collect::<Vec<_>>();
            match tokio::time::timeout(
                SCAN_TIMEOUT,
                run_step(steps, SCRIPT_STEP, tsuzuri, &args, |_| {}, |_| {}),
            )
            .await
            {
                Err(_) => {
                    steps.stop_started();
                    Err(ScriptFailure::TimedOut)
                }
                Ok(Err(failure)) => Err(script_failure(failure)),
                Ok(Ok(())) => std::fs::read(&output)
                    .ok()
                    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                    .ok_or_else(|| ScriptFailure::Raised {
                        message: "the script step wrote no registrations".to_string(),
                    }),
            }
        }
    };
    match registrations {
        Ok(registrations) => ScannedScript {
            name,
            registrations,
            failure: None,
        },
        Err(failure) => ScannedScript {
            name,
            registrations: vec![],
            failure: Some(failure),
        },
    }
}

/// What the script Step failing tells: what the Script raised, as it wrote it to its error output.
fn script_failure(failure: Failure) -> ScriptFailure {
    match failure {
        Failure::StepFailed { detail, .. } => ScriptFailure::Raised { message: detail },
        other => ScriptFailure::Raised {
            message: format!("{other:?}"),
        },
    }
}

/// The arguments that start the script Step in `mode` on `script`.
fn step_args(mode: &str, script: &Path, id: &str, input: &Path, output: &Path) -> Vec<String> {
    [SCRIPT_ARGUMENT, mode]
        .map(String::from)
        .into_iter()
        .chain(std::iter::once(script.to_string_lossy().into_owned()))
        .chain(std::iter::once(id.to_string()))
        .chain([input, output].map(|arg| arg.to_string_lossy().into_owned()))
        .collect()
}

/// Runs the Macro `id` of `script` on the Current Resource, holding every subtitle of it, and
/// writes each edit it returns in turn, each as one step of the Undo History.
pub struct MacroMode<'a> {
    pub tsuzuri: &'a Path,
    pub script: &'a Path,
    pub id: &'a str,
    pub checked_segments: Vec<usize>,
    pub work: &'a Path,
}

impl Mode for MacroMode<'_> {
    const NAME: &'static str = "macro";
    type Target = MacroTarget;
    type Outcome = ();

    fn hold<'p>(
        &self,
        project: &'p CurrentProject,
    ) -> Result<(MacroTarget, ResourceHold<'p>), Failure> {
        project.hold_for_macro(self.checked_segments.clone())
    }

    async fn run<'a, P: Progress + Steps + Sync>(
        &self,
        run: &ModeRun<'a, P>,
        project: &'a CurrentProject,
        target: MacroTarget,
        mut phases: Phases,
    ) -> Result<(), Failure> {
        let ports = run.ports();
        run.keep(WorkDir::try_new(self.work)?);
        let input = self.work.join("snapshot.json");
        let output = self.work.join("edits.json");
        std::fs::write(
            &input,
            serde_json::to_vec(&target.snapshot).map_err(internal_failure)?,
        )?;
        enter(ports, &mut phases, Phase::Script);
        run_step(
            ports,
            SCRIPT_STEP,
            self.tsuzuri,
            &step_args("macro", self.script, self.id, &input, &output),
            |_| {},
            |_| {},
        )
        .await
        .map_err(|failure| Failure::from(script_failure(failure)))?;
        let edits: Vec<Vec<SnapshotSegment>> =
            serde_json::from_slice(&std::fs::read(&output)?).map_err(internal_failure)?;
        for segments in &edits {
            project.write_macro_edit(&target, segments)?;
        }
        ports.announce_project();
        Ok(())
    }
}

/// The text the Export Format `id` of `script` makes of `input`, run by `tsuzuri` through
/// `steps` with its files in `work`.
pub async fn make_export_text(
    steps: &impl Steps,
    tsuzuri: &Path,
    script: &Path,
    id: &str,
    input: &ExportInput,
    work: &Path,
) -> Result<String, Failure> {
    let _work = WorkDir::try_new(work)?;
    let input_path = work.join("input.json");
    let output = work.join("output.txt");
    std::fs::write(
        &input_path,
        serde_json::to_vec(input).map_err(internal_failure)?,
    )?;
    run_step(
        steps,
        SCRIPT_STEP,
        tsuzuri,
        &step_args("format", script, id, &input_path, &output),
        |_| {},
        |_| {},
    )
    .await
    .map_err(|failure| Failure::from(script_failure(failure)))?;
    Ok(std::fs::read_to_string(&output)?)
}

fn internal_failure(error: serde_json::Error) -> Failure {
    Failure::Internal {
        detail: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use tokio::sync::mpsc::{channel, Receiver, Sender};

    use super::*;
    use crate::project::RunningMode;
    use crate::segment_change::SegmentChange;
    use crate::steps::{ModeLock, StepEvent};
    use crate::test_support::{directory_of, project_in, TempDir};
    use crate::transcript::Transcript;

    /// Runs each script Step in this process, as the app's child would, so a test needs no
    /// built executable; one asked to hang never ends until stopped.
    #[derive(Default)]
    struct InProcessSteps {
        started: AtomicUsize,
        stopped: AtomicUsize,
        is_hanging: bool,
        hanging: Mutex<Vec<Sender<StepEvent>>>,
    }

    impl Steps for InProcessSteps {
        fn start(
            &self,
            _program: &Path,
            args: &[String],
        ) -> Result<(Receiver<StepEvent>, u32), String> {
            self.started.fetch_add(1, Ordering::SeqCst);
            let (events, receiver) = channel(16);
            if self.is_hanging {
                self.hanging.lock().unwrap().push(events);
                return Ok((receiver, 0));
            }
            let args: Vec<String> = std::iter::once("tsuzuri".to_string())
                .chain(args.iter().cloned())
                .collect();
            std::thread::spawn(move || {
                let mut stderr = Vec::new();
                let code = subcommand::run_script_subcommand(&args, &mut stderr);
                for line in String::from_utf8_lossy(&stderr).lines() {
                    let _ = events.blocking_send(StepEvent::Stderr(line.to_string()));
                }
                let _ = events.blocking_send(StepEvent::Exit(code));
            });
            Ok((receiver, 0))
        }

        fn stop(&self, _pid: u32) {}

        fn stop_started(&self) {
            self.stopped.fetch_add(1, Ordering::SeqCst);
        }
    }

    impl Progress for InProcessSteps {
        fn report(&self, _phase: Phase, _percent: Option<u8>) {}
        fn report_count(&self, _phase: Phase, _done_count: usize, _total: usize) {}
        fn announce_project(&self) {}
    }

    const MERGE_RUNS: &str = r#"
        Tsuzuri.macro :merge_runs do |context|
          context.edit do |snapshot|
            snapshot.segments.chunk_while { |a, b| a.speaker == b.speaker }.map do |run|
              run.first.with(
                end_ms: run.map(&:end_ms).max,
                texts: snapshot.languages.to_h { |lang| [lang, run.filter_map { |s| s.texts[lang] }.join("，")] }
              )
            end
          end
        end
        Tsuzuri.format :lines do |snapshot, options|
          snapshot.segments.map { |s| s.texts[snapshot.primary] }.join("\n")
        end
    "#;

    const TWO_CUES: &str = "1\n00:00:00,000 --> 00:00:01,000\nSpeaker 1: 你好\n\n\
        2\n00:00:01,000 --> 00:00:02,000\nSpeaker 1: 世界\n";

    async fn scan_dir(
        dir: &TempDir,
        registry: &ScriptRegistry,
        steps: &InProcessSteps,
    ) -> Vec<ScannedScript> {
        scan(
            &dir.path().join(SCRIPTS_DIR),
            registry,
            steps,
            Path::new("tsuzuri"),
            &dir.path().join("work"),
            false,
        )
        .await
        .unwrap()
    }

    fn scripts_in(name: &str, scripts: &[(&str, &str)]) -> TempDir {
        let dir = TempDir::new(name);
        let scripts_dir = dir.path().join(SCRIPTS_DIR);
        std::fs::create_dir_all(&scripts_dir).unwrap();
        for (file, source) in scripts {
            std::fs::write(scripts_dir.join(file), source).unwrap();
        }
        dir
    }

    // @behavior SR-025
    #[tokio::test]
    async fn lists_what_each_script_registers() {
        let dir = scripts_in(
            "sr-scan",
            &[
                ("a.rb", "Tsuzuri.macro(:merge_runs) {}"),
                ("b.rb", "raise 'boom'"),
            ],
        );

        let scripts = scan_dir(&dir, &ScriptRegistry::default(), &InProcessSteps::default()).await;

        assert_eq!(
            scripts,
            [
                ScannedScript {
                    name: "a.rb".to_string(),
                    registrations: vec![Registration::Macro {
                        id: "merge_runs".to_string(),
                        label: "merge_runs".to_string()
                    }],
                    failure: None,
                },
                ScannedScript {
                    name: "b.rb".to_string(),
                    registrations: vec![],
                    failure: Some(ScriptFailure::Raised {
                        message: "boom".to_string()
                    }),
                },
            ]
        );
    }

    // @behavior SR-026
    #[tokio::test]
    async fn loads_a_script_again_only_once_it_changes() {
        let dir = scripts_in("sr-scan-again", &[("a.rb", "Tsuzuri.macro(:a) {}")]);
        let (registry, steps) = (ScriptRegistry::default(), InProcessSteps::default());
        scan_dir(&dir, &registry, &steps).await;

        scan_dir(&dir, &registry, &steps).await;
        let unchanged = steps.started.load(Ordering::SeqCst);
        std::fs::write(
            dir.path().join(SCRIPTS_DIR).join("a.rb"),
            "Tsuzuri.macro(:b) {}",
        )
        .unwrap();
        scan_dir(&dir, &registry, &steps).await;

        assert_eq!((unchanged, steps.started.load(Ordering::SeqCst)), (1, 2));
    }

    // @behavior SR-027
    #[tokio::test]
    async fn leaves_a_script_for_a_newer_api_unrun() {
        let dir = scripts_in("sr-scan-newer", &[("a.rb", "# tsuzuri-api: 2.0\n")]);
        let steps = InProcessSteps::default();

        let scripts = scan_dir(&dir, &ScriptRegistry::default(), &steps).await;

        assert_eq!(
            (
                scripts[0].failure.clone(),
                steps.started.load(Ordering::SeqCst)
            ),
            (
                Some(ScriptFailure::UnsupportedApiVersion {
                    declared: ApiVersion { major: 2, minor: 0 }
                }),
                0
            )
        );
    }

    // @behavior SR-028
    #[tokio::test]
    async fn stops_a_script_that_takes_over_a_second_to_load() {
        let dir = scripts_in("sr-scan-hang", &[("a.rb", "loop {}")]);
        let steps = InProcessSteps {
            is_hanging: true,
            ..InProcessSteps::default()
        };

        let scripts = scan_dir(&dir, &ScriptRegistry::default(), &steps).await;

        assert_eq!(
            (
                scripts[0].failure.clone(),
                steps.stopped.load(Ordering::SeqCst)
            ),
            (Some(ScriptFailure::TimedOut), 1)
        );
    }

    fn macro_fixture(name: &str) -> (TempDir, CurrentProject, PathBuf) {
        let dir = directory_of(name, &[("ep01.srt", TWO_CUES)]);
        let current = project_in(&dir);
        let script = dir.path().join("interview.rb");
        std::fs::write(&script, MERGE_RUNS).unwrap();
        (dir, current, script)
    }

    // @behavior SR-029
    #[test]
    fn holds_every_subtitle_while_a_macro_runs() {
        let (_dir, current, _script) = macro_fixture("sr-macro-hold");
        let (_target, _hold) = current.hold_for_macro(vec![]).unwrap();

        let change = current.change_segments(SegmentChange::Merge { first: 0, last: 1 });

        assert_eq!(
            (change, current.view().unwrap().running_mode()),
            (Err(Failure::ModeRunning), Some(RunningMode::Macro))
        );
    }

    // @behavior SR-030
    #[tokio::test]
    async fn runs_a_macro_on_the_current_resource() {
        let (dir, current, script) = macro_fixture("sr-macro-run");
        let lock = ModeLock::default();
        let run = lock.begin(InProcessSteps::default()).await;
        let mode = MacroMode {
            tsuzuri: Path::new("tsuzuri"),
            script: &script,
            id: "merge_runs",
            checked_segments: vec![],
            work: &dir.path().join("work"),
        };

        crate::steps::run_mode(
            &mode,
            &run,
            &current,
            Phases::start("macro", Phase::Preparation),
        )
        .await
        .unwrap();

        let written =
            Transcript::from_srt(&std::fs::read_to_string(dir.path().join("ep01.srt")).unwrap())
                .unwrap();
        assert_eq!(
            written
                .segments
                .iter()
                .map(|segment| (segment.start_ms, segment.end_ms, segment.text.as_str()))
                .collect::<Vec<_>>(),
            [(0, 2_000, "你好，世界")]
        );
    }

    // @behavior SR-031
    #[tokio::test]
    async fn writes_the_text_of_an_export_format() {
        let (dir, current, script) = macro_fixture("sr-export-format");
        let input = current.export_input(true, true).unwrap();

        let text = make_export_text(
            &InProcessSteps::default(),
            Path::new("tsuzuri"),
            &script,
            "lines",
            &input,
            &dir.path().join("work"),
        )
        .await;

        assert_eq!(text, Ok("你好\n世界".to_string()));
    }

    /// An example Script as `examples/scripts/` keeps it.
    fn example(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../examples/scripts")
            .join(name)
    }

    /// The Segments `subtitle` holds, by times, Speaker and text.
    fn cues_of(subtitle: &Path) -> Vec<(u64, u64, Option<String>, String)> {
        Transcript::from_srt(&std::fs::read_to_string(subtitle).unwrap())
            .unwrap()
            .segments
            .into_iter()
            .map(|segment| {
                (
                    segment.start_ms,
                    segment.end_ms,
                    segment.speaker,
                    segment.text,
                )
            })
            .collect()
    }

    const THREE_TURNS: &str = "1\n00:00:00,000 --> 00:00:01,000\nSpeaker 1: 內容A\n\n\
        2\n00:00:01,000 --> 00:00:02,000\nSpeaker 1: 內容B\n\n\
        3\n00:00:02,000 --> 00:00:03,000\nSpeaker 2: 內容C\n";

    // @behavior SR-039
    #[tokio::test]
    async fn merges_a_speakers_runs_with_the_example_macro() {
        let dir = directory_of("sr-example-merge", &[("ep01.srt", THREE_TURNS)]);
        let current = project_in(&dir);
        let script = example("merge_runs.rb");
        let lock = ModeLock::default();
        let run = lock.begin(InProcessSteps::default()).await;
        let mode = MacroMode {
            tsuzuri: Path::new("tsuzuri"),
            script: &script,
            id: "merge_runs",
            checked_segments: vec![],
            work: &dir.path().join("work"),
        };

        crate::steps::run_mode(
            &mode,
            &run,
            &current,
            Phases::start("macro", Phase::Preparation),
        )
        .await
        .unwrap();

        let speaker = |name: &str| Some(name.to_string());
        assert_eq!(
            cues_of(&dir.path().join("ep01.srt")),
            [
                (0, 2_000, speaker("Speaker 1"), "內容A，內容B".to_string()),
                (2_000, 3_000, speaker("Speaker 2"), "內容C".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn merges_only_among_the_checked_segments_with_the_example_macro() {
        let dir = directory_of("sr-example-merge-checked", &[("ep01.srt", THREE_TURNS)]);
        let current = project_in(&dir);
        let script = example("merge_runs.rb");
        let lock = ModeLock::default();
        let run = lock.begin(InProcessSteps::default()).await;
        let mode = MacroMode {
            tsuzuri: Path::new("tsuzuri"),
            script: &script,
            id: "merge_runs",
            checked_segments: vec![0],
            work: &dir.path().join("work"),
        };

        crate::steps::run_mode(
            &mode,
            &run,
            &current,
            Phases::start("macro", Phase::Preparation),
        )
        .await
        .unwrap();

        assert_eq!(cues_of(&dir.path().join("ep01.srt")).len(), 3);
    }

    // @behavior SR-040
    #[tokio::test]
    async fn numbers_each_speakers_segments_with_the_example_export_format() {
        let turns = "1\n00:00:00,000 --> 00:00:01,000\nSpeaker 1: 內容A\n\n\
            2\n00:00:01,000 --> 00:00:02,000\nSpeaker 2: 內容B\n\n\
            3\n00:00:02,000 --> 00:00:03,000\nSpeaker 1: 內容C\n";
        let dir = directory_of("sr-example-tsv", &[("ep01.srt", turns)]);
        let current = project_in(&dir);
        let input = current.export_input(true, true).unwrap();

        let text = make_export_text(
            &InProcessSteps::default(),
            Path::new("tsuzuri"),
            &example("tsv_numbered.rb"),
            "tsv_numbered",
            &input,
            &dir.path().join("work"),
        )
        .await;

        assert_eq!(
            text,
            Ok(
                "#\tzh-TW\nSpeaker 1-001\t內容A\nSpeaker 2-001\t內容B\nSpeaker 1-002\t內容C\n"
                    .to_string()
            )
        );
    }

    // @behavior SR-032
    #[test]
    fn refuses_a_script_name_reaching_outside_the_folder() {
        let dir = Path::new("/settings/scripts");
        assert_eq!(
            [
                script_path(dir, "../settings.json").is_err(),
                script_path(dir, "a/b.rb").is_err(),
                script_path(dir, "interview.rb").is_ok(),
            ],
            [true, true, true]
        );
    }
}

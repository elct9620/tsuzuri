//! Speaker Diarization: who is heard when in a media file, given to the Segments of its Transcript.

pub mod commands;
pub mod features;
pub mod sortformer;
pub mod streaming;
pub mod subcommand;
pub mod turns;

use std::fmt;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::Serialize;

use crate::conversion;
use crate::failure::Failure;
use crate::progress::{enter, Progress};
use crate::project::CurrentProject;
use crate::steps::{run_step, ModeRun, Steps, WorkDir, CONVERSION_STEP, DIARIZATION_STEP};
use crate::timing::{Phase, PhaseTiming, Phases};
use crate::toolchain::{ModelSettings, ModelSlot};
use subcommand::DIARIZE_ARGUMENT;
use turns::{segment_speakers, SpeakerTurn};

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Diarization {
    #[specta(type = specta_typescript::Number)]
    audio_seconds: f64,
    #[specta(type = specta_typescript::Number)]
    diarize_seconds: f64,
    phases: Vec<PhaseTiming>,
}

/// The executables a diarization runs: ffmpeg, then the app itself as the diarize Step.
pub struct Tools {
    pub ffmpeg: PathBuf,
    pub diarizer: PathBuf,
}

/// Runs the Diarize Mode on the Current Resource: converts its whole media file, runs the diarize
/// Step and gives the Segments of its subtitle the Speakers heard.
pub async fn run_diarize<'a>(
    run: &ModeRun<'a, impl Progress + Steps>,
    project: &'a CurrentProject,
    tools: &Tools,
    models: &ModelSettings,
    work: &Path,
    mut phases: Phases,
) -> Result<Diarization, Failure> {
    let (job, hold) = project.hold_for_diarization()?;
    run.keep(hold);
    let ports = run.ports();
    let model = models.ready_path(ModelSlot::Diarization)?;
    run.keep(WorkDir::try_new(work)?);
    let wav = work.join("audio.wav");
    let turns_path = work.join("turns.json");

    enter(ports, &mut phases, Phase::Conversion);
    run_step(
        ports,
        CONVERSION_STEP,
        &tools.ffmpeg,
        &conversion::conversion_args(&job.media, &wav, None),
        |_| {},
        |_| {},
    )
    .await?;
    let audio_bytes = std::fs::metadata(&wav)?.len();

    enter(ports, &mut phases, Phase::Loading);
    let start = Instant::now();
    let args = [
        DIARIZE_ARGUMENT.as_ref(),
        model.as_path(),
        wav.as_path(),
        turns_path.as_path(),
    ]
    .map(|arg| arg.to_string_lossy().into_owned());
    run_step(
        ports,
        DIARIZATION_STEP,
        &tools.diarizer,
        &args,
        |line| {
            if let Some(percent) = subcommand::progress(line) {
                if percent == 0 {
                    enter(ports, &mut phases, Phase::Diarization);
                }
                ports.report(Phase::Diarization, Some(percent));
            }
        },
        |_| {},
    )
    .await?;
    let diarize_seconds = start.elapsed().as_secs_f64();

    let turns: Vec<SpeakerTurn> =
        serde_json::from_slice(&std::fs::read(&turns_path)?).map_err(|error| {
            Failure::Internal {
                detail: format!("unreadable Speaker Turns: {error}"),
            }
        })?;
    project.write_speakers(&job, |segments| segment_speakers(segments, &turns))?;
    ports.announce_project();
    Ok(Diarization {
        audio_seconds: conversion::audio_seconds(audio_bytes),
        diarize_seconds,
        phases: phases.finish(),
    })
}

#[derive(Debug, PartialEq, Eq)]
pub enum DiarizationError {
    /// The file is a GGUF of another model, named by its architecture and version.
    UnsupportedModel {
        architecture: String,
    },
    Engine(String),
}

impl fmt::Display for DiarizationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DiarizationError::UnsupportedModel { architecture } => write!(
                f,
                "not a Nemotron-3 Diarization model: its architecture is {architecture:?}"
            ),
            DiarizationError::Engine(detail) => write!(f, "{detail}"),
        }
    }
}

impl std::error::Error for DiarizationError {}

impl From<candle_core::Error> for DiarizationError {
    fn from(error: candle_core::Error) -> Self {
        DiarizationError::Engine(error.to_string())
    }
}

impl From<std::io::Error> for DiarizationError {
    fn from(error: std::io::Error) -> Self {
        DiarizationError::Engine(error.to_string())
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::sync::{Arc, Mutex};

    use tauri::test::{mock_builder, MockRuntime};
    use tauri::{Listener, Manager};
    use tauri_specta::Event;

    use super::*;
    use crate::language::Language;
    use crate::model_source::ModelSource;
    use crate::processes::{AppPorts, Processes};
    use crate::progress::{PipelineProgress, ProjectChanged};
    use crate::project::{Project, RunningMode};
    use crate::steps::ModeLock;
    use crate::test_support::{build_mock_app, write_executable, TempDir};
    use crate::transcript::{Segment, Transcript, WrittenText};

    const RECORDING_FFMPEG: &str = "#!/bin/sh\necho \"$@\" > \"$0.args\"\nfor last; do :; done\nhead -c 64044 /dev/zero > \"$last\"\n";

    /// A diarize Step hearing `Speaker 1` over 0-4 s and `Speaker 2` over 4-8 s.
    const DIARIZER: &str = "#!/bin/sh\n\
        echo 'diarize: progress = 0%' >&2\n\
        echo 'diarize: progress = 50%' >&2\n\
        echo 'diarize: progress = 100%' >&2\n\
        printf '[{\"start_ms\":0,\"end_ms\":4000,\"speaker\":0},{\"start_ms\":4000,\"end_ms\":8000,\"speaker\":1}]' > \"$4\"\n";

    struct Fixture {
        dir: TempDir,
        app: tauri::App<MockRuntime>,
        tools: Tools,
        settings: ModelSettings,
    }

    impl Fixture {
        /// `lecture.mp4` with `lecture.srt` holding 一 over 0-4 s and 二 over 4-8 s.
        fn new(name: &str) -> Fixture {
            let dir = TempDir::new(name);
            let tools = Tools {
                ffmpeg: script(&dir, "ffmpeg", RECORDING_FFMPEG),
                diarizer: script(&dir, "tsuzuri", DIARIZER),
            };
            let mut settings = ModelSettings::default();
            settings.choose(
                ModelSlot::Diarization,
                ModelSource::File {
                    path: dir.file("Nemotron-3-Diarization.q8_0.gguf"),
                },
            );
            let app = build_mock_app(
                mock_builder()
                    .plugin(tauri_plugin_shell::init())
                    .manage(CurrentProject::default()),
            );
            let fixture = Fixture {
                dir,
                app,
                tools,
                settings,
            };
            let project_dir = fixture.project_dir();
            std::fs::write(project_dir.join("lecture.mp4"), b"media").unwrap();
            std::fs::write(
                project_dir.join("lecture.srt"),
                Transcript {
                    segments: vec![segment(0, "一"), segment(4000, "二")],
                }
                .to_srt(WrittenText::Original),
            )
            .unwrap();
            fixture
        }

        fn project_dir(&self) -> PathBuf {
            let directory = self.dir.path().join("project");
            std::fs::create_dir_all(&directory).unwrap();
            directory
        }

        fn project(&self) -> tauri::State<'_, CurrentProject> {
            self.app.state::<CurrentProject>()
        }

        fn open(&self) {
            self.project()
                .replace(Project::open(self.project_dir(), Language::TraditionalChinese).unwrap());
        }

        async fn diarize(&self) -> Result<Diarization, Failure> {
            self.open();
            let processes = Processes::new(self.dir.path().join("processes.json"));
            let app = self.app.handle();
            run_diarize(
                &ModeLock::default()
                    .begin(AppPorts::new(app, &processes))
                    .await,
                app.state::<CurrentProject>().inner(),
                &self.tools,
                &self.settings,
                &self.dir.path().join("work"),
                Phases::start("diarize", Phase::Preparation),
            )
            .await
        }

        fn file_speakers(&self, file: &str) -> Vec<Option<String>> {
            let srt = std::fs::read_to_string(self.project_dir().join(file)).unwrap();
            Transcript::from_srt(&srt)
                .unwrap()
                .segments
                .into_iter()
                .map(|segment| segment.speaker)
                .collect()
        }
    }

    fn segment(start_ms: u64, text: &str) -> Segment {
        Segment {
            start_ms,
            end_ms: start_ms + 4000,
            speaker: None,
            text: text.to_string(),
            translation: None,
        }
    }

    fn script(dir: &TempDir, name: &str, body: &str) -> PathBuf {
        let path = dir.path().join(name);
        write_executable(&path, body);
        path
    }

    fn speakers(names: &[&str]) -> Vec<Option<String>> {
        names.iter().map(|name| Some(name.to_string())).collect()
    }

    // @behavior DZ-007
    #[tokio::test]
    async fn writes_the_speakers_a_diarization_finds() {
        let fixture = Fixture::new("dz-write");

        fixture.diarize().await.unwrap();

        assert_eq!(
            fixture.file_speakers("lecture.srt"),
            speakers(&["Speaker 1", "Speaker 2"])
        );
    }

    // @behavior DZ-008
    #[tokio::test]
    async fn backs_up_the_subtitle_a_diarization_writes() {
        let fixture = Fixture::new("dz-backup");
        let dir = fixture.project_dir();
        let before = std::fs::read_to_string(dir.join("lecture.srt")).unwrap();
        std::fs::write(
            dir.join("tsuzuri.config.json"),
            r#"{"is_overwrite_backed_up":true}"#,
        )
        .unwrap();

        fixture.diarize().await.unwrap();

        let backups = crate::test_support::overwrite_backups(&dir);
        assert_eq!(
            backups
                .iter()
                .map(|(_, content)| content.as_str())
                .collect::<Vec<_>>(),
            [before.as_str()]
        );
    }

    // @behavior DZ-009
    #[tokio::test]
    async fn gives_the_translations_the_speakers_diarized() {
        let fixture = Fixture::new("dz-translation");
        std::fs::write(
            fixture.project_dir().join("lecture.en.srt"),
            Transcript {
                segments: vec![segment(0, "One"), segment(4000, "Two")],
            }
            .to_srt(WrittenText::Original),
        )
        .unwrap();

        fixture.diarize().await.unwrap();

        assert_eq!(
            fixture.file_speakers("lecture.en.srt"),
            speakers(&["Speaker 1", "Speaker 2"])
        );
    }

    // @behavior DZ-010
    #[tokio::test]
    async fn reports_diarization_progress() {
        let fixture = Fixture::new("dz-progress");
        let progress_events = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&progress_events);
        fixture
            .app
            .listen_any(PipelineProgress::NAME, move |event| {
                sink.lock().unwrap().push(event.payload().to_string());
            });

        fixture.diarize().await.unwrap();

        let progress_events = progress_events.lock().unwrap();
        assert!(progress_events.contains(&r#"{"phase":"diarize","percent":50}"#.to_string()));
        assert!(progress_events.contains(&r#"{"phase":"diarize","percent":100}"#.to_string()));
    }

    // @behavior DZ-011
    #[tokio::test]
    async fn converts_the_whole_media_file_for_a_diarization() {
        let fixture = Fixture::new("dz-convert");

        fixture.diarize().await.unwrap();

        let args = std::fs::read_to_string(fixture.tools.ffmpeg.with_extension("args")).unwrap();
        assert!(!args.contains("-ss"));
        assert!(args.contains("-ar 16000 -ac 1 -c:a pcm_s16le"));
    }

    // @behavior DZ-012
    #[tokio::test]
    async fn holds_the_resource_while_it_is_diarized() {
        let fixture = Fixture::new("dz-hold");
        let modes = Arc::new(Mutex::new(Vec::new()));
        ProjectChanged::listen_any(&fixture.app, {
            let modes = Arc::clone(&modes);
            let handle = fixture.app.handle().clone();
            move |_| {
                let view = handle.state::<CurrentProject>().view().unwrap();
                modes.lock().unwrap().push(view.running_mode());
            }
        });

        fixture.diarize().await.unwrap();

        assert!(modes
            .lock()
            .unwrap()
            .contains(&Some(RunningMode::Diarization)));
    }

    // @behavior DZ-013
    #[tokio::test]
    async fn refuses_to_diarize_without_a_diarization_model() {
        let mut fixture = Fixture::new("dz-no-model");
        fixture.settings = ModelSettings::default();

        let result = fixture.diarize().await;

        assert!(matches!(result, Err(Failure::ModelNotChosen { .. })));
        assert!(!fixture.tools.ffmpeg.with_extension("args").exists());
    }

    // @behavior DZ-014
    #[tokio::test]
    async fn refuses_to_diarize_a_resource_without_a_subtitle() {
        let fixture = Fixture::new("dz-no-subtitle");
        std::fs::remove_file(fixture.project_dir().join("lecture.srt")).unwrap();

        let result = fixture.diarize().await;

        assert!(matches!(result, Err(Failure::NoSubtitle)));
        assert!(!fixture.tools.ffmpeg.with_extension("args").exists());
    }

    /// Runs the whole Mode as the app does, with real Components: `TSUZURI_E2E_FFMPEG`, the app
    /// built in release as `TSUZURI_E2E_APP`, the diarization Model as
    /// `TSUZURI_E2E_DIARIZATION_MODEL` and a recording of several Speakers as
    /// `TSUZURI_E2E_DIARIZATION_AUDIO`, cut into five-second Segments.
    #[tokio::test]
    #[ignore]
    async fn diarizes_a_real_recording_through_the_app() {
        let env = |name: &str| PathBuf::from(std::env::var(name).unwrap());
        let mut fixture = Fixture::new("dz-e2e");
        fixture.tools = Tools {
            ffmpeg: env("TSUZURI_E2E_FFMPEG"),
            diarizer: env("TSUZURI_E2E_APP"),
        };
        fixture.settings.choose(
            ModelSlot::Diarization,
            ModelSource::File {
                path: env("TSUZURI_E2E_DIARIZATION_MODEL"),
            },
        );
        let dir = fixture.project_dir();
        std::fs::copy(
            env("TSUZURI_E2E_DIARIZATION_AUDIO"),
            dir.join("lecture.mp4"),
        )
        .unwrap();
        let segments = (0..12).map(|i| segment(i * 5000, "…")).collect();
        std::fs::write(
            dir.join("lecture.srt"),
            Transcript { segments }.to_srt(WrittenText::Original),
        )
        .unwrap();

        fixture.diarize().await.unwrap();

        let speakers = fixture.file_speakers("lecture.srt");
        let named: std::collections::BTreeSet<_> = speakers.iter().flatten().collect();
        println!("{speakers:?}");
        assert!(named.len() >= 2, "heard only {named:?}");
    }

    #[tokio::test]
    async fn names_the_diarize_step_when_it_fails() {
        let fixture = Fixture::new("dz-step-fails");
        write_executable(
            &fixture.tools.diarizer,
            "#!/bin/sh\necho 'not a model' >&2\nexit 1\n",
        );

        let error = fixture.diarize().await.unwrap_err();

        assert!(matches!(error, Failure::StepFailed { step, .. } if step == "diarize"));
    }
}

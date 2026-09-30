use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::Serialize;

use crate::cleanup::clean_texts;
use crate::failure::Failure;
use crate::language::Language;
use crate::progress::{enter, Progress};
use crate::project::{CurrentProject, RunningMode, SegmentSpan, TranscriptionTarget};
use crate::steps::{run_step, ModeRun, Steps};
use crate::timing::Phase;
use crate::timing::{PhaseTiming, Phases};
use crate::toolchain::{ModelSettings, ModelSlot};
use crate::transcript::{Transcript, WrittenText};

pub mod commands;
pub mod settings;
mod whisper;

use settings::TranscriptionSettings;
use whisper::TranscriptionPlan;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Transcription {
    #[specta(type = specta_typescript::Number)]
    audio_seconds: f64,
    #[specta(type = specta_typescript::Number)]
    transcribe_seconds: f64,
    phases: Vec<PhaseTiming>,
    /// The positions of the Segments written within an Audio Window, none for the whole media file.
    written_span: Option<SegmentSpan>,
}

pub struct Tools {
    pub ffmpeg: PathBuf,
    pub whisper: PathBuf,
}

/// The directory a transcription writes its intermediate files to, removed with them once the
/// Mode's run ends, however it ends.
struct WorkDir(PathBuf);

impl Drop for WorkDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn run_transcribe<'a>(
    run: &ModeRun<'a, impl Progress + Steps>,
    project: &'a CurrentProject,
    tools: &Tools,
    models: &ModelSettings,
    settings: TranscriptionSettings,
    job: &TranscriptionTarget,
    work: &Path,
    mut phases: Phases,
) -> Result<Transcription, Failure> {
    run.keep(project.hold_resource(&job.directory, &job.name, RunningMode::Transcription));
    let ports = run.ports();
    let input = job.media.as_path();
    let models = models
        .clone()
        .with_project_model(ModelSlot::Transcription, job.model.clone());
    let settings = settings.with_overrides(job.overrides);
    let is_cleaned = settings.is_simplified_cleaned && job.language == Language::TraditionalChinese;
    let model = models.ready_path(ModelSlot::Transcription)?;
    let vad = settings
        .has_vad
        .then(|| models.ready_path(ModelSlot::Vad))
        .transpose()?;
    let plan = TranscriptionPlan {
        model: &model,
        vad: vad.as_deref(),
        language: job.language,
        settings,
    };
    run.keep(WorkDir(work.to_path_buf()));
    std::fs::create_dir_all(work)?;
    let wav = work.join("audio.wav");
    let srt_prefix = work.join("transcript");

    enter(ports, &mut phases, Phase::Conversion);
    run_step(
        ports,
        "convert",
        &tools.ffmpeg,
        &whisper::conversion_args(input, &wav, job.window),
        |_| {},
        |_| {},
    )
    .await?;
    let audio_bytes = std::fs::metadata(&wav)?.len();

    enter(ports, &mut phases, Phase::Loading);
    let start = Instant::now();
    project.show_transcript(project.kept_segments(job)?);
    ports.announce_project();
    run_step(
        ports,
        "transcribe",
        &tools.whisper,
        &whisper::transcription_args(&plan, &wav, &srt_prefix),
        |line| {
            if line.starts_with(whisper::START_MARK) {
                enter(ports, &mut phases, Phase::Transcription);
            } else if let Some(percent) = whisper::progress(line) {
                ports.report(Phase::Transcription, Some(percent));
            }
        },
        |line| {
            if let Some(mut segment) = whisper::segment(line) {
                if is_cleaned {
                    clean_texts(std::slice::from_mut(&mut segment));
                }
                project.push_segment(match job.window {
                    Some(window) => window.segment_in_media(segment),
                    None => segment,
                });
                ports.announce_project();
            }
        },
    )
    .await?;
    let transcribe_seconds = start.elapsed().as_secs_f64();

    let mut srt = std::fs::read_to_string(srt_prefix.with_extension("srt"))?;
    // What whisper-cli wrote must read as a Transcript before it replaces the subtitle.
    let mut transcript = Transcript::from_srt(&srt)?;
    if is_cleaned {
        clean_texts(&mut transcript.segments);
        srt = transcript.to_srt(WrittenText::Original);
    }
    let written_span = project.write_transcription(job, srt)?;
    ports.announce_project();
    Ok(Transcription {
        audio_seconds: whisper::audio_seconds(audio_bytes),
        transcribe_seconds,
        phases: phases.finish(),
        written_span,
    })
}

#[cfg(all(test, unix))]
mod tests {
    use std::sync::{Arc, Mutex};

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::Listener;

    use tauri::Manager;

    use super::*;
    use crate::language::Language;
    use crate::model_source::ModelSource;
    use crate::processes::{AppPorts, Processes};
    use crate::project::{
        Project, ProjectModels, ProjectOptions, TranscriptionOverrides, TranscriptionScope,
    };
    use crate::steps::ModeLock;
    use crate::test_support::{write_executable, TempDir};
    use crate::toolchain::{self, Resolver};
    use crate::transcript::{Segment, WrittenText};

    const TWO_SECOND_WAV: &str =
        "#!/bin/sh\nfor last; do :; done\nhead -c 64044 /dev/zero > \"$last\"\n";
    const RECORDING_FFMPEG: &str = "#!/bin/sh\necho \"$@\" > \"$0.args\"\nfor last; do :; done\nhead -c 64044 /dev/zero > \"$last\"\n";
    const FAILING_FFMPEG: &str =
        "#!/bin/sh\necho 'Invalid data found when processing input' >&2\nexit 1\n";

    fn whisper_script(started_marker: &Path) -> String {
        whisper_script_writing(started_marker, "大家好")
    }

    /// A whisper-cli writing `first_text` as its first cue, and 今天天氣很好 after it.
    fn whisper_script_writing(started_marker: &Path, first_text: &str) -> String {
        format!(
            "#!/bin/sh\ntouch '{0}'\necho \"$@\" > '{0}.args'\nwhile [ $# -gt 0 ]; do case \"$1\" in -of) of=\"$2\"; shift;; esac; shift; done\n\
             echo 'whisper_model_load: model size = 1 MB' >&2\n\
             echo \"main: processing '$of.wav' (32000 samples, 2.0 sec)\" >&2\n\
             echo '[00:00:00.000 --> 00:00:01.000]  {1}'\n\
             while [ -e '{0}.hold' ]; do sleep 0.02; done\n\
             echo 'whisper_print_progress_callback: progress = 50%' >&2\n\
             echo 'whisper_print_progress_callback: progress = 100%' >&2\n\
             printf '1\\n00:00:00,000 --> 00:00:01,000\\n{1}\\n\\n2\\n00:00:01,000 --> 00:00:02,000\\n今天天氣很好\\n' > \"$of.srt\"\n",
            started_marker.display(),
            first_text
        )
    }

    struct Fixture {
        dir: TempDir,
        app: tauri::App<MockRuntime>,
        tools: Tools,
        settings: ModelSettings,
        transcription: TranscriptionSettings,
        whisper_started: PathBuf,
    }

    impl Fixture {
        fn new(name: &str, ffmpeg: &str) -> Fixture {
            let dir = TempDir::new(name);
            let whisper_started = dir.path().join("whisper-started");
            let tools = Tools {
                ffmpeg: script(&dir, "ffmpeg", ffmpeg),
                whisper: script(&dir, "whisper-cli", &whisper_script(&whisper_started)),
            };
            let mut settings = ModelSettings::default();
            settings.choose(
                ModelSlot::Transcription,
                ModelSource::File {
                    path: dir.file("breeze.bin"),
                },
            );
            let app = mock_builder()
                .plugin(tauri_plugin_shell::init())
                .manage(CurrentProject::default())
                .build(mock_context(noop_assets()))
                .unwrap();
            Fixture {
                dir,
                app,
                tools,
                settings,
                transcription: TranscriptionSettings::default(),
                whisper_started,
            }
        }

        /// This fixture with whisper-cli writing `first_text` as its first cue.
        fn with_whisper_writing(self, first_text: &str) -> Fixture {
            write_executable(
                &self.tools.whisper,
                &whisper_script_writing(&self.whisper_started, first_text),
            );
            self
        }

        /// Transcribes in `zh-TW`, answering the Segments shown once whisper-cli writes its first.
        async fn segments_shown_while_transcribing(&self) -> Vec<(u64, String)> {
            let target = self.target_in(Language::TraditionalChinese);
            let hold = self.whisper_started.with_extension("hold");
            std::fs::write(&hold, b"").unwrap();
            let watch = async {
                for _ in 0..250 {
                    let shown = segment_starts(self.project().view().unwrap().segments());
                    if !shown.is_empty() {
                        std::fs::remove_file(&hold).unwrap();
                        return shown;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                }
                std::fs::remove_file(&hold).unwrap();
                Vec::new()
            };
            let (result, shown) = tokio::join!(self.run(&target), watch);
            result.unwrap();
            shown
        }

        fn project(&self) -> tauri::State<'_, CurrentProject> {
            self.app.state::<CurrentProject>()
        }

        /// Opens a Project of `lecture.mp4` in `language` and takes what transcribing it needs.
        fn target_in(&self, language: Language) -> TranscriptionTarget {
            self.open_in(language);
            self.project()
                .transcription_target(false, TranscriptionScope::Whole)
                .unwrap()
        }

        fn open_in(&self, language: Language) {
            let media = self.project_dir().join("lecture.mp4");
            std::fs::write(&media, b"media").unwrap();
            self.project()
                .replace(Project::open(self.project_dir(), language).unwrap());
        }

        fn subtitle_text(&self) -> String {
            std::fs::read_to_string(self.project_dir().join("lecture.srt")).unwrap()
        }

        fn project_dir(&self) -> PathBuf {
            let directory = self.dir.path().join("project");
            std::fs::create_dir_all(&directory).unwrap();
            directory
        }

        async fn transcribe(&self) -> Result<Transcription, Failure> {
            let target = self.target_in(Language::TraditionalChinese);
            self.run(&target).await
        }

        async fn run(&self, target: &TranscriptionTarget) -> Result<Transcription, Failure> {
            let processes = Processes::new(self.dir.path().join("processes.json"));
            let app = self.app.handle();
            run_transcribe(
                &ModeLock::default()
                    .begin(AppPorts::new(app, &processes))
                    .await,
                app.state::<CurrentProject>().inner(),
                &self.tools,
                &self.settings,
                self.transcription,
                target,
                &self.dir.path().join("work"),
                Phases::start("transcribe", Phase::Preparation),
            )
            .await
        }

        /// The arguments whisper-cli last ran with.
        fn whisper_args(&self) -> String {
            std::fs::read_to_string(self.whisper_started.with_extension("args")).unwrap()
        }

        /// Records `options` as the Project's, as the settings do, and takes what transcribing needs.
        fn target_with(&self, options: ProjectOptions) -> TranscriptionTarget {
            self.open_in(Language::TraditionalChinese);
            self.project().set_options(options).unwrap();
            self.project()
                .transcription_target(false, TranscriptionScope::Whole)
                .unwrap()
        }

        /// Opens a Project whose `lecture.srt` holds a Segment of 4 s starting at each of `starts`,
        /// named 一, 二, 三… in turn.
        fn open_with_segments(&self, starts: &[u64]) {
            let cues: Vec<Segment> = starts
                .iter()
                .zip(["一", "二", "三", "四"])
                .map(|(start_ms, text)| Segment {
                    start_ms: *start_ms,
                    end_ms: start_ms + 4_000,
                    speaker: None,
                    text: text.to_string(),
                    translation: None,
                })
                .collect();
            std::fs::write(
                self.project_dir().join("lecture.srt"),
                Transcript { segments: cues }.to_srt(WrittenText::Original),
            )
            .unwrap();
            self.open_in(Language::TraditionalChinese);
        }

        /// Each Segment `lecture.srt` holds, by its start and text.
        fn subtitle_segments(&self) -> Vec<(u64, String)> {
            segment_starts(
                &Transcript::from_srt(&self.subtitle_text())
                    .unwrap()
                    .segments,
            )
        }

        /// The arguments ffmpeg last ran with, when it records them.
        fn ffmpeg_args(&self) -> String {
            std::fs::read_to_string(self.tools.ffmpeg.with_extension("args")).unwrap()
        }

        fn progress_events(&self) -> Arc<Mutex<Vec<String>>> {
            let progress_events = Arc::new(Mutex::new(Vec::new()));
            let sink = Arc::clone(&progress_events);
            self.app.listen_any("pipeline-progress", move |event| {
                sink.lock().unwrap().push(event.payload().to_string());
            });
            progress_events
        }
    }

    fn segment_starts(segments: &[Segment]) -> Vec<(u64, String)> {
        segments
            .iter()
            .map(|segment| (segment.start_ms, segment.text.clone()))
            .collect()
    }

    fn script(dir: &TempDir, name: &str, body: &str) -> PathBuf {
        let path = dir.path().join(name);
        write_executable(&path, body);
        path
    }

    // @behavior TX-001
    #[tokio::test]
    async fn answers_the_segments_whisper_wrote() {
        let fixture = Fixture::new("tx-transcribe", TWO_SECOND_WAV);

        fixture.transcribe().await.unwrap();

        let texts: Vec<String> = fixture
            .project()
            .view()
            .unwrap()
            .segments()
            .iter()
            .map(|segment| segment.text.clone())
            .collect();
        assert_eq!(texts, vec!["大家好", "今天天氣很好"]);
    }

    // @behavior TX-015
    #[tokio::test]
    async fn transcribes_in_the_primary_language() {
        let fixture = Fixture::new("tx-language", TWO_SECOND_WAV);
        let target = fixture.target_in(Language::Japanese);

        fixture.run(&target).await.unwrap();

        let args = std::fs::read_to_string(fixture.whisper_started.with_extension("args")).unwrap();
        assert!(args.contains("-l ja "), "whisper-cli ran with {args}");
    }

    // @behavior TX-032
    #[tokio::test]
    async fn leaves_whisper_as_it_behaves_on_its_own_by_default() {
        let fixture = Fixture::new("tx-defaults", TWO_SECOND_WAV);

        fixture.transcribe().await.unwrap();

        let args = fixture.whisper_args();
        for flag in ["--vad", "-sns", "-mc"] {
            assert!(!args.contains(flag), "whisper-cli ran with {args}");
        }
    }

    // @behavior TX-033
    #[tokio::test]
    async fn transcribes_with_vad() {
        let mut fixture = Fixture::new("tx-vad", TWO_SECOND_WAV);
        let vad = fixture.dir.file("ggml-silero-v6.2.0.bin");
        fixture
            .settings
            .choose(ModelSlot::Vad, ModelSource::File { path: vad.clone() });
        fixture.transcription.has_vad = true;

        fixture.transcribe().await.unwrap();

        let args = fixture.whisper_args();
        assert!(
            args.contains(&format!("--vad -vm {} ", vad.display())),
            "whisper-cli ran with {args}"
        );
    }

    // @behavior TX-034
    #[tokio::test]
    async fn refuses_vad_without_its_model() {
        let mut fixture = Fixture::new("tx-vad-no-model", TWO_SECOND_WAV);
        fixture.transcription.has_vad = true;

        let result = fixture.transcribe().await;

        assert_eq!(
            result.err(),
            Some(Failure::ModelNotChosen {
                slot: ModelSlot::Vad
            })
        );
        assert!(!fixture.dir.path().join("work").join("audio.wav").exists());
    }

    // @behavior TX-035
    #[tokio::test]
    async fn suppresses_non_speech_tokens_and_carries_no_context() {
        let mut fixture = Fixture::new("tx-no-context", TWO_SECOND_WAV);
        fixture.transcription.is_non_speech_suppressed = true;
        fixture.transcription.is_context_carried = false;

        fixture.transcribe().await.unwrap();

        let args = fixture.whisper_args();
        assert!(
            args.contains(" -sns ") && args.contains(" -mc 0 "),
            "whisper-cli ran with {args}"
        );
    }

    // @behavior TX-036
    #[tokio::test]
    async fn takes_the_project_transcription_settings_over_the_general_ones() {
        let mut fixture = Fixture::new("tx-project-vad", TWO_SECOND_WAV);
        fixture.settings.choose(
            ModelSlot::Vad,
            ModelSource::File {
                path: fixture.dir.file("ggml-silero-v6.2.0.bin"),
            },
        );
        let target = fixture.target_with(ProjectOptions {
            transcription: TranscriptionOverrides {
                has_vad: Some(true),
                ..TranscriptionOverrides::default()
            },
            ..ProjectOptions::default()
        });

        fixture.run(&target).await.unwrap();

        let args = fixture.whisper_args();
        assert!(args.contains("--vad "), "whisper-cli ran with {args}");
    }

    // @behavior TX-037
    #[tokio::test]
    async fn transcribes_with_the_project_model() {
        let fixture = Fixture::new("tx-project-model", TWO_SECOND_WAV);
        let project_model = fixture.dir.file("kotoba.bin");
        let target = fixture.target_with(ProjectOptions {
            models: ProjectModels {
                transcription: Some(ModelSource::File {
                    path: project_model.clone(),
                }),
                ..ProjectModels::default()
            },
            ..ProjectOptions::default()
        });

        fixture.run(&target).await.unwrap();

        let args = fixture.whisper_args();
        assert!(
            args.starts_with(&format!("-m {} ", project_model.display())),
            "whisper-cli ran with {args}"
        );
    }

    // @behavior PJ-022
    #[tokio::test]
    async fn leaves_another_resource_untouched_by_a_late_transcription() {
        let fixture = Fixture::new("pj-late-transcription", TWO_SECOND_WAV);
        std::fs::write(
            fixture.project_dir().join("notes.srt"),
            "1\n00:00:00,000 --> 00:00:01,000\n另一份\n",
        )
        .unwrap();
        let target = fixture.target_in(Language::TraditionalChinese);
        fixture.project().select("notes").unwrap();

        fixture.run(&target).await.unwrap();

        let texts: Vec<String> = fixture
            .project()
            .view()
            .unwrap()
            .segments()
            .iter()
            .map(|segment| segment.text.clone())
            .collect();
        assert_eq!(texts, vec!["另一份"]);
    }

    const WHISPER_SRT: &str =
        "1\n00:00:00,000 --> 00:00:01,000\n大家好\n\n2\n00:00:01,000 --> 00:00:02,000\n今天天氣很好\n";

    // @behavior PJ-095
    #[tokio::test]
    async fn holds_the_resource_while_it_is_transcribed() {
        let fixture = Fixture::new("pj-hold-transcribing", TWO_SECOND_WAV);
        let modes = Arc::new(Mutex::new(Vec::new()));
        fixture.app.listen_any("project-changed", {
            let modes = Arc::clone(&modes);
            let handle = fixture.app.handle().clone();
            move |_| {
                let view = handle.state::<CurrentProject>().view().unwrap();
                modes.lock().unwrap().push(view.running_mode());
            }
        });

        fixture.transcribe().await.unwrap();

        assert!(modes
            .lock()
            .unwrap()
            .contains(&Some(RunningMode::Transcription)));
    }

    // @behavior TX-017
    #[tokio::test]
    async fn shows_each_segment_as_whisper_prints_it() {
        let fixture = Fixture::new("tx-stream", TWO_SECOND_WAV);
        let target = fixture.target_in(Language::TraditionalChinese);
        let hold = fixture.whisper_started.with_extension("hold");
        std::fs::write(&hold, b"").unwrap();
        let announced_counts = Arc::new(Mutex::new(Vec::new()));
        fixture.app.listen_any("project-changed", {
            let announced_counts = Arc::clone(&announced_counts);
            let handle = fixture.app.handle().clone();
            move |_| {
                let count = handle
                    .state::<CurrentProject>()
                    .view()
                    .unwrap()
                    .segments()
                    .len();
                announced_counts.lock().unwrap().push(count);
            }
        });
        let watch = async {
            for _ in 0..250 {
                let count = fixture.project().view().unwrap().segments().len();
                if count == 1 {
                    std::fs::remove_file(&hold).unwrap();
                    return true;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
            std::fs::remove_file(&hold).unwrap();
            false
        };

        let (result, saw_one_segment) = tokio::join!(fixture.run(&target), watch);

        result.unwrap();
        assert!(saw_one_segment, "no Segment arrived while whisper-cli ran");
        assert!(
            announced_counts.lock().unwrap().contains(&1),
            "the webview was not told when the first Segment arrived"
        );
    }

    // @behavior TX-018
    #[tokio::test]
    async fn writes_the_transcription_beside_its_media_file() {
        let fixture = Fixture::new("tx-write", TWO_SECOND_WAV);

        fixture.transcribe().await.unwrap();

        assert_eq!(fixture.subtitle_text(), WHISPER_SRT);
    }

    // @behavior PJ-053
    #[tokio::test]
    async fn saves_the_bilingual_srts_once_transcribed() {
        let fixture = Fixture::new("pj-bilingual-transcribed", TWO_SECOND_WAV);
        let dir = fixture.project_dir();
        std::fs::write(dir.join("lecture.en.srt"), "").unwrap();
        std::fs::write(
            dir.join("tsuzuri.config.json"),
            r#"{"is_bilingual_autosaved":true}"#,
        )
        .unwrap();

        fixture.transcribe().await.unwrap();

        assert_eq!(
            std::fs::read_to_string(dir.join("lecture.zh-TW.en.srt")).unwrap(),
            WHISPER_SRT
        );
    }

    // @behavior PJ-066
    #[tokio::test]
    async fn backs_up_the_original_before_a_transcription_overwrites_it() {
        let fixture = Fixture::new("pj-backup-transcribed", TWO_SECOND_WAV);
        let dir = fixture.project_dir();
        let old = "1\n00:00:00,000 --> 00:00:01,000\n舊的\n";
        std::fs::write(dir.join("lecture.srt"), old).unwrap();
        std::fs::write(
            dir.join("tsuzuri.config.json"),
            r#"{"is_overwrite_backed_up":true}"#,
        )
        .unwrap();
        fixture.open_in(Language::TraditionalChinese);
        let target = fixture
            .project()
            .transcription_target(true, TranscriptionScope::Whole)
            .unwrap();

        fixture.run(&target).await.unwrap();

        let backups = crate::test_support::overwrite_backups(&dir);
        assert_eq!(
            backups
                .iter()
                .map(|(_, content)| content.as_str())
                .collect::<Vec<_>>(),
            [old]
        );
    }

    // @behavior TX-019
    #[tokio::test]
    async fn refuses_to_overwrite_a_subtitle_unless_asked() {
        let fixture = Fixture::new("tx-refuse", TWO_SECOND_WAV);
        std::fs::write(fixture.project_dir().join("lecture.srt"), "").unwrap();
        fixture.open_in(Language::TraditionalChinese);

        let target = fixture
            .project()
            .transcription_target(false, TranscriptionScope::Whole);

        assert_eq!(
            target.map(|_| ()),
            Err(Failure::SubtitleExists {
                path: fixture.project_dir().join("lecture.srt")
            })
        );
    }

    // @behavior TX-020
    #[tokio::test]
    async fn overwrites_a_subtitle_when_asked() {
        let fixture = Fixture::new("tx-overwrite", TWO_SECOND_WAV);
        std::fs::write(fixture.project_dir().join("lecture.srt"), "").unwrap();
        fixture.open_in(Language::TraditionalChinese);
        let target = fixture
            .project()
            .transcription_target(true, TranscriptionScope::Whole)
            .unwrap();

        fixture.run(&target).await.unwrap();

        assert_eq!(fixture.subtitle_text(), WHISPER_SRT);
    }

    // @behavior TX-042
    #[tokio::test]
    async fn transcribes_from_a_segment_onward() {
        let fixture = Fixture::new("tx-rest", TWO_SECOND_WAV);
        fixture.open_with_segments(&[0, 5_000, 10_000]);
        let target = fixture
            .project()
            .transcription_target(true, TranscriptionScope::Rest { first: 1 })
            .unwrap();

        fixture.run(&target).await.unwrap();

        assert_eq!(
            fixture.subtitle_segments(),
            [
                (0, "一".to_string()),
                (5_000, "大家好".to_string()),
                (6_000, "今天天氣很好".to_string()),
            ]
        );
    }

    // @behavior TX-043
    #[tokio::test]
    async fn transcribes_a_span_of_segments() {
        let fixture = Fixture::new("tx-span", TWO_SECOND_WAV);
        fixture.open_with_segments(&[0, 5_000, 10_000, 15_000]);
        let target = fixture
            .project()
            .transcription_target(
                true,
                TranscriptionScope::Span(SegmentSpan { first: 1, last: 2 }),
            )
            .unwrap();

        fixture.run(&target).await.unwrap();

        assert_eq!(
            fixture.subtitle_segments(),
            [
                (0, "一".to_string()),
                (5_000, "大家好".to_string()),
                (6_000, "今天天氣很好".to_string()),
                (15_000, "四".to_string()),
            ]
        );
    }

    // @behavior TX-044
    #[tokio::test]
    async fn converts_only_the_audio_window() {
        let fixture = Fixture::new("tx-window-convert", RECORDING_FFMPEG);
        fixture.open_with_segments(&[5_000, 10_000]);
        let target = fixture
            .project()
            .transcription_target(
                true,
                TranscriptionScope::Span(SegmentSpan { first: 0, last: 1 }),
            )
            .unwrap();

        fixture.run(&target).await.unwrap();

        assert!(fixture
            .ffmpeg_args()
            .starts_with("-nostdin -y -ss 5.000 -t 9.000 -i "));
        assert!(!fixture.whisper_args().contains("-ot"));
    }

    // @behavior TX-045
    #[tokio::test]
    async fn shows_the_kept_segments_while_transcribing_a_span() {
        let fixture = Fixture::new("tx-window-stream", TWO_SECOND_WAV);
        fixture.open_with_segments(&[0, 5_000, 10_000]);
        let target = fixture
            .project()
            .transcription_target(
                true,
                TranscriptionScope::Span(SegmentSpan { first: 1, last: 1 }),
            )
            .unwrap();
        let hold = fixture.whisper_started.with_extension("hold");
        std::fs::write(&hold, b"").unwrap();
        let watch = async {
            for _ in 0..250 {
                let shown = segment_starts(fixture.project().view().unwrap().segments());
                if shown.iter().any(|(_, text)| text == "大家好") {
                    std::fs::remove_file(&hold).unwrap();
                    return shown;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
            std::fs::remove_file(&hold).unwrap();
            Vec::new()
        };

        let (result, shown) = tokio::join!(fixture.run(&target), watch);

        result.unwrap();
        assert_eq!(
            shown,
            [
                (0, "一".to_string()),
                (5_000, "大家好".to_string()),
                (10_000, "三".to_string()),
            ]
        );
    }

    // @behavior TX-057
    #[tokio::test]
    async fn cleans_simplified_chinese_out_of_a_transcription_in_traditional_chinese() {
        let fixture = Fixture::new("tx-clean", TWO_SECOND_WAV).with_whisper_writing("这是测试");

        let shown = fixture.segments_shown_while_transcribing().await;

        assert_eq!(shown, [(0, "這是測試".to_string())]);
        assert_eq!(fixture.subtitle_segments()[0], (0, "這是測試".to_string()));
    }

    // @behavior TX-058
    #[tokio::test]
    async fn leaves_a_transcription_as_whisper_wrote_it_with_the_cleanup_off() {
        let mut fixture =
            Fixture::new("tx-clean-off", TWO_SECOND_WAV).with_whisper_writing("这是测试");
        fixture.transcription.is_simplified_cleaned = false;

        fixture.transcribe().await.unwrap();

        assert_eq!(fixture.subtitle_segments()[0], (0, "这是测试".to_string()));
    }

    #[tokio::test]
    async fn leaves_a_transcription_in_another_language_as_whisper_wrote_it() {
        let fixture = Fixture::new("tx-clean-ja", TWO_SECOND_WAV).with_whisper_writing("这是测试");
        let target = fixture.target_in(Language::Japanese);

        fixture.run(&target).await.unwrap();

        assert_eq!(fixture.subtitle_segments()[0], (0, "这是测试".to_string()));
    }

    // @behavior TX-046
    #[tokio::test]
    async fn answers_the_segments_a_span_wrote() {
        let fixture = Fixture::new("tx-written-span", TWO_SECOND_WAV);
        fixture.open_with_segments(&[0, 5_000, 10_000]);
        let target = fixture
            .project()
            .transcription_target(true, TranscriptionScope::Rest { first: 1 })
            .unwrap();

        let transcription = fixture.run(&target).await.unwrap();

        assert_eq!(
            transcription.written_span,
            Some(SegmentSpan { first: 1, last: 2 })
        );
    }

    // @behavior TX-047
    #[tokio::test]
    async fn refuses_a_segment_the_current_resource_does_not_have() {
        let fixture = Fixture::new("tx-window-missing", TWO_SECOND_WAV);
        fixture.open_with_segments(&[0, 5_000, 10_000]);

        let target = fixture
            .project()
            .transcription_target(true, TranscriptionScope::Rest { first: 4 });

        assert!(matches!(target, Err(Failure::Internal { .. })));
        assert!(!fixture.whisper_started.exists());
    }

    // @behavior TX-002
    #[tokio::test]
    async fn reports_each_percentage_whisper_prints() {
        let fixture = Fixture::new("tx-progress", TWO_SECOND_WAV);
        let progress_events = fixture.progress_events();

        fixture.transcribe().await.unwrap();

        let progress_events = progress_events.lock().unwrap();
        assert!(progress_events.contains(&r#"{"phase":"transcribe","percent":50}"#.to_string()));
        assert!(progress_events.contains(&r#"{"phase":"transcribe","percent":100}"#.to_string()));
    }

    // @behavior TX-003
    #[tokio::test]
    async fn stops_at_a_failed_conversion() {
        let fixture = Fixture::new("tx-convert-fails", FAILING_FFMPEG);

        let error = fixture.transcribe().await.unwrap_err();

        assert!(matches!(error, Failure::StepFailed { step, .. } if step == "convert"));
        assert!(!fixture.whisper_started.exists());
    }

    // @behavior TX-056
    #[tokio::test]
    async fn leaves_no_intermediate_files_once_it_ends() {
        let finishing_fixture = Fixture::new("tx-work-finished", TWO_SECOND_WAV);
        let failing_fixture = Fixture::new("tx-work-failed", FAILING_FFMPEG);

        finishing_fixture.transcribe().await.unwrap();
        failing_fixture.transcribe().await.unwrap_err();

        assert!(!finishing_fixture.dir.path().join("work").exists());
        assert!(!failing_fixture.dir.path().join("work").exists());
    }

    // @behavior TX-004
    #[tokio::test]
    async fn refuses_without_a_transcription_model() {
        let mut fixture = Fixture::new("tx-no-model", TWO_SECOND_WAV);
        fixture.settings = ModelSettings::default();

        let result = fixture.transcribe().await;

        assert!(result.is_err());
        assert!(!fixture.dir.path().join("work").join("audio.wav").exists());
    }

    // @behavior TX-005
    #[tokio::test]
    async fn reports_the_audio_length_beside_the_transcription_time() {
        let fixture = Fixture::new("tx-rtf", TWO_SECOND_WAV);

        let transcription = fixture.transcribe().await.unwrap();

        assert_eq!(transcription.audio_seconds, 2.0);
        assert!(transcription.transcribe_seconds > 0.0);
    }

    // @behavior TX-008
    #[tokio::test]
    async fn reports_the_model_load_before_transcription_percentages() {
        let fixture = Fixture::new("tx-load", TWO_SECOND_WAV);
        let progress_events = fixture.progress_events();

        fixture.transcribe().await.unwrap();

        let progress_events = progress_events.lock().unwrap();
        let load = progress_events
            .iter()
            .position(|event| event == r#"{"phase":"load","percent":null}"#);
        let first_percentage = progress_events
            .iter()
            .position(|event| event.starts_with(r#"{"phase":"transcribe","percent":5"#));
        assert!(load.is_some());
        assert!(load < first_percentage);
    }

    // @behavior TX-009
    #[tokio::test]
    async fn answers_how_long_each_phase_took() {
        let fixture = Fixture::new("tx-phases", TWO_SECOND_WAV);

        let transcription = fixture.transcribe().await.unwrap();

        let phases: Vec<Phase> = transcription
            .phases
            .iter()
            .map(|timing| timing.phase)
            .collect();
        assert_eq!(
            phases,
            vec![
                Phase::Preparation,
                Phase::Conversion,
                Phase::Loading,
                Phase::Transcription
            ]
        );
    }

    /// Runs the real vendored whisper-cli and ffmpeg:
    /// `TSUZURI_E2E_MODEL=<ggml model> TSUZURI_E2E_MEDIA=<media file> cargo test -- --ignored`
    #[tokio::test]
    #[ignore = "needs scripts/vendor.sh, a Model and a media file"]
    async fn transcribes_real_media_with_vendored_components() {
        let model = PathBuf::from(std::env::var("TSUZURI_E2E_MODEL").unwrap());
        let media = PathBuf::from(std::env::var("TSUZURI_E2E_MEDIA").unwrap());
        // vendor/ is laid out as the installer lays out its Bundled Variants.
        let vendor = Resolver {
            bundled_dir: Path::new(env!("CARGO_MANIFEST_DIR")).join("../vendor"),
            choices: toolchain::Choices::default(),
            search_dirs: Vec::new(),
        };
        let [ffmpeg, whisper] =
            toolchain::find_ready_executables(vendor, [toolchain::FFMPEG, toolchain::WHISPER])
                .await
                .unwrap();
        let dir = TempDir::new("tx-e2e");
        let tools = Tools { ffmpeg, whisper };
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Transcription, ModelSource::File { path: model });
        let app = mock_builder()
            .plugin(tauri_plugin_shell::init())
            .manage(CurrentProject::default())
            .build(mock_context(noop_assets()))
            .unwrap();
        let processes = Processes::new(dir.path().join("processes.json"));
        let project = app.state::<CurrentProject>();
        let mut opened_project = Project::open(
            media.parent().unwrap().to_path_buf(),
            Language::TraditionalChinese,
        )
        .unwrap();
        opened_project
            .select(&media.file_stem().unwrap().to_string_lossy())
            .unwrap();
        project.replace(opened_project);
        let target = project
            .transcription_target(true, TranscriptionScope::Whole)
            .unwrap();

        let transcription = run_transcribe(
            &ModeLock::default()
                .begin(AppPorts::new(app.handle(), &processes))
                .await,
            &project,
            &tools,
            &settings,
            TranscriptionSettings::default(),
            &target,
            &dir.path().join("work"),
            Phases::start("transcribe", Phase::Preparation),
        )
        .await
        .unwrap();

        println!(
            "{} segments, audio {:.1}s, transcribe {:.1}s, RTF {:.2}, phases {:?}",
            project.view().unwrap().segments().len(),
            transcription.audio_seconds,
            transcription.transcribe_seconds,
            transcription.transcribe_seconds / transcription.audio_seconds,
            transcription.phases
        );
        assert!(!project.view().unwrap().segments().is_empty());
    }
}

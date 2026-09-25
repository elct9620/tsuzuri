use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;

use crate::components::{self, Resolver};
use crate::failure::Failure;
use crate::language::Language;
use crate::models::{self, ModelSettings, ModelSlot};
use crate::processes::Processes;
use crate::project::{self, CurrentProject, TranscriptionTarget};
use crate::timing::{PhaseTiming, Phases};
use crate::transcript::{parse_timestamp, Segment, Transcript};

/// 16-bit mono PCM at 16 kHz, the only input whisper-cli is given.
const WAV_BYTES_PER_SECOND: u64 = 16_000 * 2;
const WAV_HEADER_BYTES: u64 = 44;
const STDERR_TAIL_LINES: usize = 5;

/// Sent as each Phase starts and as its percentage changes; a Phase that cannot tell how far along it is has no percentage.
#[derive(Debug, Clone, Serialize)]
struct PipelineProgress {
    phase: &'static str,
    percent: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Transcription {
    audio_seconds: f64,
    transcribe_seconds: f64,
    phases: Vec<PhaseTiming>,
}

pub struct Tools {
    pub ffmpeg: PathBuf,
    pub whisper: PathBuf,
}

pub async fn run_transcribe<R: Runtime>(
    app: &AppHandle<R>,
    processes: &Processes,
    tools: &Tools,
    settings: &ModelSettings,
    job: &TranscriptionTarget,
    work: &Path,
    mut phases: Phases,
) -> Result<Transcription, Failure> {
    let input = job.media.as_path();
    let model = settings.ready_path(ModelSlot::Transcription)?;
    std::fs::create_dir_all(work)?;
    let wav = work.join("audio.wav");
    let srt_prefix = work.join("transcript");

    enter(app, &mut phases, "convert");
    run_step(
        app,
        processes,
        "convert",
        &tools.ffmpeg,
        &conversion_args(input, &wav),
        |_| {},
        |_| {},
    )
    .await?;
    let audio_bytes = std::fs::metadata(&wav)?.len();

    enter(app, &mut phases, "load");
    let started = Instant::now();
    let project = app.state::<CurrentProject>();
    project.write_transcript(job.generation, Transcript::default());
    project::announce(app);
    run_step(
        app,
        processes,
        "transcribe",
        &tools.whisper,
        &transcription_args(model, job.language, &wav, &srt_prefix),
        |line| {
            if line.starts_with(WHISPER_PROCESSING) {
                enter(app, &mut phases, "transcribe");
            } else if let Some(percent) = whisper_progress(line) {
                report(app, "transcribe", Some(percent));
            }
        },
        |line| {
            if let Some(segment) = whisper_segment(line) {
                project.push_segment(job.generation, segment);
                project::announce(app);
            }
        },
    )
    .await?;
    let transcribe_seconds = started.elapsed().as_secs_f64();

    let srt = std::fs::read_to_string(srt_prefix.with_extension("srt"))?;
    let transcript = Transcript::from_srt(&srt)?;
    std::fs::write(&job.subtitle, &srt)?;
    project.refresh_resources(&job.directory)?;
    project.write_bilingual_subtitles(&job.directory, &job.name, None)?;
    project.write_transcript(job.generation, transcript);
    project::announce(app);
    Ok(Transcription {
        audio_seconds: audio_bytes.saturating_sub(WAV_HEADER_BYTES) as f64
            / WAV_BYTES_PER_SECOND as f64,
        transcribe_seconds,
        phases: phases.finish(),
    })
}

fn conversion_args(input: &Path, wav: &Path) -> Vec<String> {
    let mut args: Vec<String> = ["-nostdin", "-y", "-i"].map(String::from).to_vec();
    args.push(input.to_string_lossy().into_owned());
    args.extend(["-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"].map(String::from));
    args.push(wav.to_string_lossy().into_owned());
    args
}

fn transcription_args(
    model: &Path,
    language: Language,
    wav: &Path,
    srt_prefix: &Path,
) -> Vec<String> {
    vec![
        "-m".to_string(),
        model.to_string_lossy().into_owned(),
        "-l".to_string(),
        language.whisper_code().to_string(),
        "-osrt".to_string(),
        "-pp".to_string(),
        "-f".to_string(),
        wav.to_string_lossy().into_owned(),
        "-of".to_string(),
        srt_prefix.to_string_lossy().into_owned(),
    ]
}

/// whisper-cli prints this on stderr once its Model is loaded and it starts on the audio.
const WHISPER_PROCESSING: &str = "main: processing";

/// whisper-cli prints each Segment on stdout as it is transcribed:
/// `[00:00:00.000 --> 00:00:02.000]  text`.
fn whisper_segment(line: &str) -> Option<Segment> {
    let (times, text) = line.trim().strip_prefix('[')?.split_once(']')?;
    let (start, end) = times.split_once("-->")?;
    Some(Segment {
        start_ms: parse_timestamp(start.trim())?,
        end_ms: parse_timestamp(end.trim())?,
        speaker: None,
        text: text.trim().to_string(),
        translation: None,
    })
}

/// whisper-cli `-pp` prints `whisper_print_progress_callback: progress = 42%` on stderr.
fn whisper_progress(line: &str) -> Option<u8> {
    line.split_once("progress =")?
        .1
        .trim()
        .strip_suffix('%')?
        .trim()
        .parse()
        .ok()
}

pub(crate) fn report<R: Runtime>(app: &AppHandle<R>, phase: &'static str, percent: Option<u8>) {
    let _ = app.emit("pipeline-progress", PipelineProgress { phase, percent });
}

/// Ends the current Phase and tells the webview the next one has started.
pub(crate) fn enter<R: Runtime>(app: &AppHandle<R>, phases: &mut Phases, phase: &'static str) {
    phases.enter(phase);
    report(app, phase, None);
}

/// Runs one Step to completion. A Step that exits non-zero fails with the last lines it wrote to stderr.
async fn run_step<R: Runtime>(
    app: &AppHandle<R>,
    processes: &Processes,
    step: &str,
    program: &Path,
    args: &[String],
    mut on_stderr_line: impl FnMut(&str),
    mut on_stdout_line: impl FnMut(&str),
) -> Result<(), Failure> {
    let failed = |detail: String| Failure::StepFailed {
        step: step.to_string(),
        detail,
    };
    let (mut events, _) = processes.spawn(app, program, args).map_err(failed)?;
    let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(STDERR_TAIL_LINES + 1);
    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                on_stderr_line(&line);
                stderr_tail.push_back(line);
                if stderr_tail.len() > STDERR_TAIL_LINES {
                    stderr_tail.pop_front();
                }
            }
            CommandEvent::Stdout(bytes) => {
                on_stdout_line(String::from_utf8_lossy(&bytes).trim_end())
            }
            CommandEvent::Error(error) => return Err(failed(error)),
            CommandEvent::Terminated(payload) if payload.code == Some(0) => return Ok(()),
            CommandEvent::Terminated(_) => return Err(failed(Vec::from(stderr_tail).join("\n"))),
            _ => {}
        }
    }
    Err(failed(
        "the process ended without an exit status".to_string(),
    ))
}

#[tauri::command]
pub async fn transcribe(app: AppHandle, overwrite: bool) -> Result<Transcription, Failure> {
    let job = app
        .state::<CurrentProject>()
        .transcription_target(overwrite)?;
    let phases = Phases::start("transcribe", "prepare");
    report(&app, "prepare", None);
    let [ffmpeg, whisper] =
        components::find_ready_executables(Resolver::from_app(&app)?, ["ffmpeg", "whisper"])
            .await?;
    let tools = Tools { ffmpeg, whisper };
    let settings = models::load_settings(&app)?;
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis());
    let work = app
        .path()
        .app_cache_dir()?
        .join("work")
        .join(started_at.to_string());
    let processes = app.state::<Processes>().inner().clone();

    let result = run_transcribe(&app, &processes, &tools, &settings, &job, &work, phases).await;
    let _ = std::fs::remove_dir_all(&work);
    result
}

#[cfg(all(test, unix))]
mod tests {
    use std::sync::{Arc, Mutex};

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::Listener;

    use super::*;
    use crate::project::Project;
    use crate::test_support::{write_executable, TempDir};

    const TWO_SECOND_WAV: &str =
        "#!/bin/sh\nfor last; do :; done\nhead -c 64044 /dev/zero > \"$last\"\n";
    const FAILING_FFMPEG: &str =
        "#!/bin/sh\necho 'Invalid data found when processing input' >&2\nexit 1\n";

    fn whisper_script(started_marker: &Path) -> String {
        format!(
            "#!/bin/sh\ntouch '{0}'\necho \"$@\" > '{0}.args'\nwhile [ $# -gt 0 ]; do case \"$1\" in -of) of=\"$2\"; shift;; esac; shift; done\n\
             echo 'whisper_model_load: model size = 1 MB' >&2\n\
             echo \"main: processing '$of.wav' (32000 samples, 2.0 sec)\" >&2\n\
             echo '[00:00:00.000 --> 00:00:01.000]  大家好'\n\
             while [ -e '{0}.hold' ]; do sleep 0.02; done\n\
             echo 'whisper_print_progress_callback: progress = 50%' >&2\n\
             echo 'whisper_print_progress_callback: progress = 100%' >&2\n\
             printf '1\\n00:00:00,000 --> 00:00:01,000\\n大家好\\n\\n2\\n00:00:01,000 --> 00:00:02,000\\n今天天氣很好\\n' > \"$of.srt\"\n",
            started_marker.display()
        )
    }

    struct Fixture {
        dir: TempDir,
        app: tauri::App<MockRuntime>,
        tools: Tools,
        settings: ModelSettings,
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
            settings.choose(ModelSlot::Transcription, dir.file("breeze.bin"));
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
                whisper_started,
            }
        }

        fn project(&self) -> tauri::State<'_, CurrentProject> {
            self.app.state::<CurrentProject>()
        }

        /// Opens a Project of `lecture.mp4` in `language` and takes what transcribing it needs.
        fn target_in(&self, language: Language) -> TranscriptionTarget {
            self.open_in(language);
            self.project().transcription_target(false).unwrap()
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
            run_transcribe(
                self.app.handle(),
                &processes,
                &self.tools,
                &self.settings,
                target,
                &self.dir.path().join("work"),
                Phases::start("transcribe", "prepare"),
            )
            .await
        }

        fn progress_events(&self) -> Arc<Mutex<Vec<String>>> {
            let received = Arc::new(Mutex::new(Vec::new()));
            let sink = Arc::clone(&received);
            self.app.listen_any("pipeline-progress", move |event| {
                sink.lock().unwrap().push(event.payload().to_string());
            });
            received
        }
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

    // @behavior TX-017
    #[tokio::test]
    async fn shows_each_segment_as_whisper_prints_it() {
        let fixture = Fixture::new("tx-stream", TWO_SECOND_WAV);
        let target = fixture.target_in(Language::TraditionalChinese);
        let hold = fixture.whisper_started.with_extension("hold");
        std::fs::write(&hold, b"").unwrap();
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

    // @behavior TX-019
    #[tokio::test]
    async fn refuses_to_overwrite_a_subtitle_unless_asked() {
        let fixture = Fixture::new("tx-refuse", TWO_SECOND_WAV);
        std::fs::write(fixture.project_dir().join("lecture.srt"), "").unwrap();
        fixture.open_in(Language::TraditionalChinese);

        let refused = fixture.project().transcription_target(false);

        assert_eq!(
            refused.map(|_| ()),
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
        let target = fixture.project().transcription_target(true).unwrap();

        fixture.run(&target).await.unwrap();

        assert_eq!(fixture.subtitle_text(), WHISPER_SRT);
    }

    // @behavior TX-002
    #[tokio::test]
    async fn reports_each_percentage_whisper_prints() {
        let fixture = Fixture::new("tx-progress", TWO_SECOND_WAV);
        let received = fixture.progress_events();

        fixture.transcribe().await.unwrap();

        let received = received.lock().unwrap();
        assert!(received.contains(&r#"{"phase":"transcribe","percent":50}"#.to_string()));
        assert!(received.contains(&r#"{"phase":"transcribe","percent":100}"#.to_string()));
    }

    // @behavior TX-003
    #[tokio::test]
    async fn stops_at_a_failed_conversion() {
        let fixture = Fixture::new("tx-convert-fails", FAILING_FFMPEG);

        let error = fixture.transcribe().await.unwrap_err();

        assert!(matches!(error, Failure::StepFailed { step, .. } if step == "convert"));
        assert!(!fixture.whisper_started.exists());
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
        let received = fixture.progress_events();

        fixture.transcribe().await.unwrap();

        let received = received.lock().unwrap();
        let load = received
            .iter()
            .position(|event| event == r#"{"phase":"load","percent":null}"#);
        let first_percentage = received
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

        let phases: Vec<&str> = transcription
            .phases
            .iter()
            .map(|timing| timing.phase)
            .collect();
        assert_eq!(phases, vec!["prepare", "convert", "load", "transcribe"]);
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
            bundled: Path::new(env!("CARGO_MANIFEST_DIR")).join("../vendor"),
            choices: components::Choices::default(),
            search_dirs: Vec::new(),
        };
        let [ffmpeg, whisper] = components::find_ready_executables(vendor, ["ffmpeg", "whisper"])
            .await
            .unwrap();
        let dir = TempDir::new("tx-e2e");
        let tools = Tools { ffmpeg, whisper };
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Transcription, model);
        let app = mock_builder()
            .plugin(tauri_plugin_shell::init())
            .manage(CurrentProject::default())
            .build(mock_context(noop_assets()))
            .unwrap();
        let processes = Processes::new(dir.path().join("processes.json"));
        let project = app.state::<CurrentProject>();
        let mut opened = Project::open(
            media.parent().unwrap().to_path_buf(),
            Language::TraditionalChinese,
        )
        .unwrap();
        opened
            .select(&media.file_stem().unwrap().to_string_lossy())
            .unwrap();
        project.replace(opened);
        let target = project.transcription_target(true).unwrap();

        let transcription = run_transcribe(
            app.handle(),
            &processes,
            &tools,
            &settings,
            &target,
            &dir.path().join("work"),
            Phases::start("transcribe", "prepare"),
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

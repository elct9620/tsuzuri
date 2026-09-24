use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;

use crate::components::{self, Resolver};
use crate::models::{self, ModelSettings, ModelSlot};
use crate::processes::Processes;
use crate::transcript::{Segment, Transcript};

/// 16-bit mono PCM at 16 kHz, the only input whisper-cli is given.
const WAV_BYTES_PER_SECOND: u64 = 16_000 * 2;
const WAV_HEADER_BYTES: u64 = 44;
const STDERR_TAIL_LINES: usize = 5;

#[derive(Debug, Clone, Serialize)]
struct PipelineProgress {
    step: &'static str,
    percent: u8,
}

#[derive(Debug, Clone, Serialize)]
pub struct Transcription {
    segments: Vec<Segment>,
    audio_seconds: f64,
    transcribe_seconds: f64,
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
    input: &Path,
    work: &Path,
) -> Result<Transcription, String> {
    let model = settings
        .require(ModelSlot::Transcription)
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(work).map_err(|error| error.to_string())?;
    let wav = work.join("audio.wav");
    let srt_prefix = work.join("transcript");

    report(app, "convert", 0);
    run_step(
        app,
        processes,
        "convert",
        &tools.ffmpeg,
        &convert_args(input, &wav),
        |_| {},
    )
    .await?;
    let audio_bytes = std::fs::metadata(&wav)
        .map_err(|error| error.to_string())?
        .len();

    report(app, "transcribe", 0);
    let started = Instant::now();
    run_step(
        app,
        processes,
        "transcribe",
        &tools.whisper,
        &transcribe_args(model, &wav, &srt_prefix),
        |line| {
            if let Some(percent) = whisper_progress(line) {
                report(app, "transcribe", percent);
            }
        },
    )
    .await?;
    let transcribe_seconds = started.elapsed().as_secs_f64();

    let srt = std::fs::read_to_string(srt_prefix.with_extension("srt"))
        .map_err(|error| error.to_string())?;
    let transcript = Transcript::from_srt(&srt).map_err(|error| error.to_string())?;
    Ok(Transcription {
        segments: transcript.segments,
        audio_seconds: audio_bytes.saturating_sub(WAV_HEADER_BYTES) as f64
            / WAV_BYTES_PER_SECOND as f64,
        transcribe_seconds,
    })
}

fn convert_args(input: &Path, wav: &Path) -> Vec<String> {
    let mut args: Vec<String> = ["-nostdin", "-y", "-i"].map(String::from).to_vec();
    args.push(input.to_string_lossy().into_owned());
    args.extend(["-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"].map(String::from));
    args.push(wav.to_string_lossy().into_owned());
    args
}

fn transcribe_args(model: &Path, wav: &Path, srt_prefix: &Path) -> Vec<String> {
    vec![
        "-m".to_string(),
        model.to_string_lossy().into_owned(),
        "-l".to_string(),
        "zh".to_string(),
        "-osrt".to_string(),
        "-pp".to_string(),
        "-f".to_string(),
        wav.to_string_lossy().into_owned(),
        "-of".to_string(),
        srt_prefix.to_string_lossy().into_owned(),
    ]
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

pub(crate) fn report<R: Runtime>(app: &AppHandle<R>, step: &'static str, percent: u8) {
    let _ = app.emit("pipeline-progress", PipelineProgress { step, percent });
}

/// Runs one Step to completion. A Step that exits non-zero fails with the last lines it wrote to stderr.
async fn run_step<R: Runtime>(
    app: &AppHandle<R>,
    processes: &Processes,
    step: &str,
    program: &Path,
    args: &[String],
    mut on_stderr_line: impl FnMut(&str),
) -> Result<(), String> {
    let (mut events, _) = processes.spawn(app, program, args)?;
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
            CommandEvent::Error(error) => return Err(format!("{step} failed: {error}")),
            CommandEvent::Terminated(payload) if payload.code == Some(0) => return Ok(()),
            CommandEvent::Terminated(_) => {
                return Err(format!(
                    "{step} failed: {}",
                    Vec::from(stderr_tail).join("\n")
                ))
            }
            _ => {}
        }
    }
    Err(format!(
        "{step} failed: the process ended without an exit status"
    ))
}

#[tauri::command]
pub async fn transcribe(app: AppHandle, path: PathBuf) -> Result<Transcription, String> {
    let resolver = Resolver::of(&app)?;
    let tools = Tools {
        ffmpeg: components::ready_executable("ffmpeg", &resolver)?,
        whisper: components::ready_executable("whisper", &resolver)?,
    };
    let settings = models::load_settings(&app)?;
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis());
    let work = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("work")
        .join(started_at.to_string());
    let processes = app.state::<Processes>().inner().clone();

    let result = run_transcribe(&app, &processes, &tools, &settings, &path, &work).await;
    let _ = std::fs::remove_dir_all(&work);
    result
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;
    use std::sync::{Arc, Mutex};

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::Listener;

    use super::*;
    use crate::test_support::TempDir;

    const TWO_SECOND_WAV: &str =
        "#!/bin/sh\nfor last; do :; done\nhead -c 64044 /dev/zero > \"$last\"\n";
    const FAILING_FFMPEG: &str =
        "#!/bin/sh\necho 'Invalid data found when processing input' >&2\nexit 1\n";

    fn whisper_script(started_marker: &Path) -> String {
        format!(
            "#!/bin/sh\ntouch '{}'\nwhile [ $# -gt 0 ]; do case \"$1\" in -of) of=\"$2\"; shift;; esac; shift; done\n\
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

        async fn transcribe(&self) -> Result<Transcription, String> {
            let processes = Processes::new(self.dir.path().join("processes.json"));
            let input = self.dir.file("lecture.mp4");
            run_transcribe(
                self.app.handle(),
                &processes,
                &self.tools,
                &self.settings,
                &input,
                &self.dir.path().join("work"),
            )
            .await
        }
    }

    fn script(dir: &TempDir, name: &str, body: &str) -> PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    // @behavior TX-001
    #[tokio::test]
    async fn answers_the_segments_whisper_wrote() {
        let fixture = Fixture::new("tx-transcribe", TWO_SECOND_WAV);

        let transcription = fixture.transcribe().await.unwrap();

        let texts: Vec<&str> = transcription
            .segments
            .iter()
            .map(|segment| segment.text.as_str())
            .collect();
        assert_eq!(texts, vec!["大家好", "今天天氣很好"]);
    }

    // @behavior TX-002
    #[tokio::test]
    async fn reports_each_percentage_whisper_prints() {
        let fixture = Fixture::new("tx-progress", TWO_SECOND_WAV);
        let received = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&received);
        fixture.app.listen_any("pipeline-progress", move |event| {
            sink.lock().unwrap().push(event.payload().to_string());
        });

        fixture.transcribe().await.unwrap();

        let received = received.lock().unwrap();
        assert!(received.contains(&r#"{"step":"transcribe","percent":50}"#.to_string()));
        assert!(received.contains(&r#"{"step":"transcribe","percent":100}"#.to_string()));
    }

    // @behavior TX-003
    #[tokio::test]
    async fn stops_at_a_failed_conversion() {
        let fixture = Fixture::new("tx-convert-fails", FAILING_FFMPEG);

        let error = fixture.transcribe().await.unwrap_err();

        assert!(error.starts_with("convert failed"));
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

    /// Runs the real vendored whisper-cli and ffmpeg:
    /// `TSUZURI_E2E_MODEL=<ggml model> TSUZURI_E2E_MEDIA=<media file> cargo test -- --ignored`
    #[tokio::test]
    #[ignore = "needs scripts/vendor.sh, a Model and a media file"]
    async fn transcribes_real_media_with_vendored_components() {
        let model = PathBuf::from(std::env::var("TSUZURI_E2E_MODEL").unwrap());
        let media = PathBuf::from(std::env::var("TSUZURI_E2E_MEDIA").unwrap());
        let vendor = Path::new(env!("CARGO_MANIFEST_DIR")).join("../vendor");
        let dir = TempDir::new("tx-e2e");
        let tools = Tools {
            ffmpeg: vendor.join("ffmpeg/bin/ffmpeg"),
            whisper: vendor.join("whisper/bin/whisper-cli"),
        };
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Transcription, model);
        let app = mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(mock_context(noop_assets()))
            .unwrap();
        let processes = Processes::new(dir.path().join("processes.json"));

        let transcription = run_transcribe(
            app.handle(),
            &processes,
            &tools,
            &settings,
            &media,
            &dir.path().join("work"),
        )
        .await
        .unwrap();

        println!(
            "{} segments, audio {:.1}s, transcribe {:.1}s, RTF {:.2}",
            transcription.segments.len(),
            transcription.audio_seconds,
            transcription.transcribe_seconds,
            transcription.transcribe_seconds / transcription.audio_seconds
        );
        assert!(!transcription.segments.is_empty());
    }
}

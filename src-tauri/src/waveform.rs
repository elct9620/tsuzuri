use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::failure::Failure;
use crate::project::CurrentProject;
use crate::steps::{run_step, Steps};

pub mod commands;

const SAMPLE_RATE: u32 = 8000;
const PEAKS_PER_SECOND: u32 = 100;
const SAMPLES_PER_PEAK: usize = (SAMPLE_RATE / PEAKS_PER_SECOND) as usize;

/// How loud a media file is over time, one Peak for each `1 / peaks_per_second` of it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Waveform {
    /// The media file it was taken from, so an answer for a Resource no longer current is told apart.
    pub media: PathBuf,
    pub peaks_per_second: u32,
    pub peaks: Vec<f32>,
}

/// Takes the Waveform of the Current Resource's media: ffmpeg converts it to PCM in `work`,
/// which is removed afterwards whether or not the conversion succeeded.
pub async fn extract(
    steps: &impl Steps,
    project: &CurrentProject,
    ffmpeg: &Path,
    work: &Path,
) -> Result<Waveform, Failure> {
    let media = project.current_media()?;
    std::fs::create_dir_all(work)?;
    let wav = work.join("waveform.wav");
    let conversion = run_step(
        steps,
        "waveform",
        ffmpeg,
        &conversion_args(&media, &wav),
        |_| {},
        |_| {},
    )
    .await;
    let wav_bytes = conversion.and_then(|()| Ok(std::fs::read(&wav)?));
    let _ = std::fs::remove_dir_all(work);
    Ok(Waveform {
        media,
        peaks_per_second: PEAKS_PER_SECOND,
        peaks: peaks(&pcm_samples(&wav_bytes?)),
    })
}

fn conversion_args(media: &Path, wav: &Path) -> Vec<String> {
    let mut args: Vec<String> = ["-nostdin", "-y", "-i"].map(String::from).to_vec();
    args.push(media.to_string_lossy().into_owned());
    args.extend(["-vn", "-ac", "1", "-ar"].map(String::from));
    args.push(SAMPLE_RATE.to_string());
    args.extend(["-c:a", "pcm_s16le"].map(String::from));
    args.push(wav.to_string_lossy().into_owned());
    args
}

/// The 16-bit little-endian samples of a WAV file's `data` chunk; none when it has no such chunk.
fn pcm_samples(wav: &[u8]) -> Vec<i16> {
    const RIFF_HEADER_LEN: usize = 12;
    let mut rest = wav.get(RIFF_HEADER_LEN..).unwrap_or_default();
    while rest.len() >= 8 {
        let (id, size) = (&rest[..4], &rest[4..8]);
        let size = u32::from_le_bytes([size[0], size[1], size[2], size[3]]) as usize;
        let body = &rest[8..];
        if id == b"data" {
            return body[..size.min(body.len())]
                .as_chunks::<2>()
                .0
                .iter()
                .map(|pair| i16::from_le_bytes(*pair))
                .collect();
        }
        rest = body.get(size + size % 2..).unwrap_or_default();
    }
    Vec::new()
}

/// The loudest sample of each slice as a fraction of full scale, to two decimals.
fn peaks(samples: &[i16]) -> Vec<f32> {
    samples
        .chunks(SAMPLES_PER_PEAK)
        .map(|slice| {
            let loudest = slice.iter().map(|sample| sample.unsigned_abs()).max();
            let fraction = f32::from(loudest.unwrap_or(0)) / 32768.0;
            (fraction * 100.0).round() / 100.0
        })
        .collect()
}

#[cfg(all(test, unix))]
mod tests {
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::Manager;

    use super::*;
    use crate::language::Language;
    use crate::processes::{AppPorts, Processes};
    use crate::project::Project;
    use crate::test_support::{write_executable, TempDir};

    const FAILING_FFMPEG: &str =
        "#!/bin/sh\necho 'Invalid data found when processing input' >&2\nexit 1\n";

    /// A mono 16-bit WAV of `samples`, with a `LIST` chunk before `data` as ffmpeg writes one.
    fn wav_file(samples: &[i16]) -> Vec<u8> {
        let data: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let mut wav = b"RIFF\0\0\0\0WAVE".to_vec();
        wav.extend(b"fmt \x10\0\0\0\x01\0\x01\0\x40\x1f\0\0\x80\x3e\0\0\x02\0\x10\0");
        wav.extend(b"LIST\x03\0\0\0abc\0");
        wav.extend(b"data");
        wav.extend((data.len() as u32).to_le_bytes());
        wav.extend(data);
        wav
    }

    struct Fixture {
        dir: TempDir,
        app: tauri::App<MockRuntime>,
    }

    impl Fixture {
        fn new(name: &str) -> Fixture {
            let app = mock_builder()
                .plugin(tauri_plugin_shell::init())
                .manage(CurrentProject::default())
                .build(mock_context(noop_assets()))
                .unwrap();
            Fixture {
                dir: TempDir::new(name),
                app,
            }
        }

        /// Opens a Project holding `files` in the fixture's directory.
        fn open_with(&self, files: &[&str]) {
            let directory = self.dir.path().join("project");
            std::fs::create_dir_all(&directory).unwrap();
            for file in files {
                std::fs::write(directory.join(file), "").unwrap();
            }
            self.app
                .state::<CurrentProject>()
                .replace(Project::open(directory, Language::TraditionalChinese).unwrap());
        }

        /// An ffmpeg that writes `samples` as the WAV it was asked for.
        fn write_ffmpeg_with_audio(&self, samples: &[i16]) -> PathBuf {
            let source = self.dir.path().join("source.wav");
            std::fs::write(&source, wav_file(samples)).unwrap();
            self.write_ffmpeg(&format!(
                "#!/bin/sh\nfor last; do :; done\ncp '{}' \"$last\"\n",
                source.display()
            ))
        }

        fn write_ffmpeg(&self, body: &str) -> PathBuf {
            let path = self.dir.path().join("ffmpeg");
            write_executable(&path, body);
            path
        }

        fn work(&self) -> PathBuf {
            self.dir.path().join("work")
        }

        async fn extract(&self, ffmpeg: &Path) -> Result<Waveform, Failure> {
            let processes = Processes::new(self.dir.path().join("processes.json"));
            let app = self.app.handle();
            let ports = AppPorts::new(app, &processes);
            extract(&ports, &app.state::<CurrentProject>(), ffmpeg, &self.work()).await
        }
    }

    // @behavior PV-004
    #[tokio::test]
    async fn answers_a_peak_for_every_ten_milliseconds() {
        let fixture = Fixture::new("pv-waveform");
        fixture.open_with(&["ep01.mp4"]);
        let mut samples = vec![0; SAMPLES_PER_PEAK * 2];
        samples[SAMPLES_PER_PEAK / 2] = i16::MIN;
        let ffmpeg = fixture.write_ffmpeg_with_audio(&samples);

        let waveform = fixture.extract(&ffmpeg).await.unwrap();

        assert_eq!(waveform.peaks, vec![1.0, 0.0]);
    }

    // @behavior PV-005
    #[tokio::test]
    async fn refuses_a_waveform_without_a_media_file() {
        let fixture = Fixture::new("pv-no-media");
        fixture.open_with(&["ep01.srt"]);
        let ffmpeg = fixture.write_ffmpeg_with_audio(&[]);

        let result = fixture.extract(&ffmpeg).await;

        assert_eq!(result, Err(Failure::NoMedia));
    }

    // @behavior PV-006
    #[tokio::test]
    async fn fails_with_what_ffmpeg_wrote() {
        let fixture = Fixture::new("pv-ffmpeg-fails");
        fixture.open_with(&["ep01.mp4"]);
        let ffmpeg = fixture.write_ffmpeg(FAILING_FFMPEG);

        let result = fixture.extract(&ffmpeg).await;

        assert_eq!(
            result,
            Err(Failure::StepFailed {
                step: "waveform".to_string(),
                detail: "Invalid data found when processing input".to_string(),
            })
        );
    }

    // @behavior PV-007
    #[tokio::test]
    async fn removes_the_converted_audio() {
        let fixture = Fixture::new("pv-cleanup");
        fixture.open_with(&["ep01.mp4"]);
        let ffmpeg = fixture.write_ffmpeg_with_audio(&[100; 10]);

        fixture.extract(&ffmpeg).await.unwrap();

        assert!(!fixture.work().exists());
    }

    #[test]
    fn reads_no_samples_from_a_file_without_a_data_chunk() {
        assert!(pcm_samples(b"RIFF\0\0\0\0WAVEfmt ").is_empty());
    }
}

//! ffmpeg's conversion of a media file to the 16 kHz mono 16-bit WAV whisper-cli and the
//! diarize Step both read.

use std::path::Path;

use crate::transcript::{AudioWindow, MS_PER_SECOND};

/// The sample rate the WAV is written at, the only one whisper-cli takes.
const SAMPLE_RATE: u64 = 16_000;
const WAV_BYTES_PER_SECOND: u64 = SAMPLE_RATE * 2;
const WAV_HEADER_BYTES: u64 = 44;

/// How long the audio is, from the size of the WAV ffmpeg wrote.
pub fn audio_seconds(wav_bytes: u64) -> f64 {
    wav_bytes.saturating_sub(WAV_HEADER_BYTES) as f64 / WAV_BYTES_PER_SECOND as f64
}

/// ffmpeg's arguments to convert `input` to `wav`, only the audio of `window` when there is one.
pub fn conversion_args(input: &Path, wav: &Path, window: Option<AudioWindow>) -> Vec<String> {
    let mut args: Vec<String> = ["-nostdin", "-y"].map(String::from).to_vec();
    if let Some(window) = window {
        args.extend(["-ss".to_string(), seconds_arg(window.start_ms)]);
        if let Some(duration_ms) = window.duration_ms() {
            args.extend(["-t".to_string(), seconds_arg(duration_ms)]);
        }
    }
    args.push("-i".to_string());
    args.push(input.to_string_lossy().into_owned());
    args.extend([
        "-vn".to_string(),
        "-ar".to_string(),
        SAMPLE_RATE.to_string(),
    ]);
    args.extend(["-ac", "1", "-c:a", "pcm_s16le"].map(String::from));
    args.push(wav.to_string_lossy().into_owned());
    args
}

/// `ms` as the seconds ffmpeg reads a time in.
fn seconds_arg(ms: u64) -> String {
    format!("{}.{:03}", ms / MS_PER_SECOND, ms % MS_PER_SECOND)
}

//! ffmpeg's conversion of a media file to a mono 16-bit WAV, and the reading of it: at 16 kHz
//! for whisper-cli and the diarize Step, slower for the Waveform.

use std::path::Path;

use crate::transcript::{AudioWindow, MS_PER_SECOND};

/// The sample rate speech is converted at, the only one whisper-cli takes and the one the
/// diarization Model was trained at.
pub const SPEECH_SAMPLE_RATE: u32 = 16_000;
const WAV_BYTES_PER_SECOND: u64 = SPEECH_SAMPLE_RATE as u64 * 2;
const WAV_HEADER_BYTES: u64 = 44;

/// How long the audio is, from the size of the speech WAV ffmpeg wrote.
pub fn audio_seconds(wav_bytes: u64) -> f64 {
    wav_bytes.saturating_sub(WAV_HEADER_BYTES) as f64 / WAV_BYTES_PER_SECOND as f64
}

/// ffmpeg's arguments to convert `input` to `wav` at `sample_rate`, only the audio of `window`
/// when there is one.
pub fn conversion_args(
    input: &Path,
    wav: &Path,
    sample_rate: u32,
    window: Option<AudioWindow>,
) -> Vec<String> {
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
        sample_rate.to_string(),
    ]);
    args.extend(["-ac", "1", "-c:a", "pcm_s16le"].map(String::from));
    args.push(wav.to_string_lossy().into_owned());
    args
}

/// `ms` as the seconds ffmpeg reads a time in.
fn seconds_arg(ms: u64) -> String {
    format!("{}.{:03}", ms / MS_PER_SECOND, ms % MS_PER_SECOND)
}

/// The chunks of a RIFF WAVE file in order, each as its id and body; none past one cut short.
pub fn wav_chunks(wav: &[u8]) -> impl Iterator<Item = (&[u8], &[u8])> {
    const RIFF_HEADER_LEN: usize = 12;
    let mut rest = match wav.get(..RIFF_HEADER_LEN) {
        Some([b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'A', b'V', b'E']) => {
            &wav[RIFF_HEADER_LEN..]
        }
        _ => &[][..],
    };
    std::iter::from_fn(move || {
        if rest.len() < 8 {
            return None;
        }
        let (id, size) = (&rest[..4], &rest[4..8]);
        let size = u32::from_le_bytes([size[0], size[1], size[2], size[3]]) as usize;
        let body = &rest[8..];
        let chunk = (id, &body[..size.min(body.len())]);
        rest = body.get(size + size % 2..).unwrap_or_default();
        Some(chunk)
    })
}

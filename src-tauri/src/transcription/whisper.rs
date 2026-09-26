use std::path::Path;

use super::settings::TranscriptionSettings;
use crate::language::Language;
use crate::transcript::{parse_timestamp, Segment};

/// 16-bit mono PCM at 16 kHz, the only input whisper-cli is given.
const WAV_BYTES_PER_SECOND: u64 = 16_000 * 2;
const WAV_HEADER_BYTES: u64 = 44;

/// How long the audio is, from the size of the WAV ffmpeg wrote.
pub fn audio_seconds(wav_bytes: u64) -> f64 {
    wav_bytes.saturating_sub(WAV_HEADER_BYTES) as f64 / WAV_BYTES_PER_SECOND as f64
}

pub fn conversion_args(input: &Path, wav: &Path) -> Vec<String> {
    let mut args: Vec<String> = ["-nostdin", "-y", "-i"].map(String::from).to_vec();
    args.push(input.to_string_lossy().into_owned());
    args.extend(["-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"].map(String::from));
    args.push(wav.to_string_lossy().into_owned());
    args
}

/// What whisper-cli transcribes with; `vad` is the VAD Model, given only when the settings turn VAD on.
pub struct TranscriptionPlan<'a> {
    pub model: &'a Path,
    pub vad: Option<&'a Path>,
    pub language: Language,
    pub settings: TranscriptionSettings,
}

pub fn transcription_args(plan: &TranscriptionPlan, wav: &Path, srt_prefix: &Path) -> Vec<String> {
    let mut args = vec![
        "-m".to_string(),
        plan.model.to_string_lossy().into_owned(),
        "-l".to_string(),
        plan.language.whisper_code().to_string(),
    ];
    if let Some(vad) = plan.vad {
        args.extend(["--vad".to_string(), "-vm".to_string()]);
        args.push(vad.to_string_lossy().into_owned());
    }
    if plan.settings.is_non_speech_suppressed {
        args.push("-sns".to_string());
    }
    if !plan.settings.is_context_carried {
        args.extend(["-mc".to_string(), "0".to_string()]);
    }
    args.extend([
        "-osrt".to_string(),
        "-pp".to_string(),
        "-f".to_string(),
        wav.to_string_lossy().into_owned(),
        "-of".to_string(),
        srt_prefix.to_string_lossy().into_owned(),
    ]);
    args
}

/// whisper-cli prints this on stderr once its Model is loaded and it starts on the audio.
pub const START_MARK: &str = "main: processing";

/// whisper-cli prints each Segment on stdout as it is transcribed:
/// `[00:00:00.000 --> 00:00:02.000]  text`.
pub fn segment(line: &str) -> Option<Segment> {
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
pub fn progress(line: &str) -> Option<u8> {
    line.split_once("progress =")?
        .1
        .trim()
        .strip_suffix('%')?
        .trim()
        .parse()
        .ok()
}

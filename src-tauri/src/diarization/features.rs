//! Log-mel features as NeMo computes them for Nemotron-3 Diarization.
//!
//! Adapted from parakeet-rs 0.3.8 (`src/audio.rs`, `src/sortformer.rs`), MIT License,
//! Copyright (c) 2025 Enes Altun.

use ndarray::{Array2, Array3, Axis};
use realfft::RealFftPlanner;

use super::DiarizationError;

const N_FFT: usize = 512;
const WIN_LENGTH: usize = 400;
const HOP_LENGTH: usize = 160;
pub const N_MELS: usize = 128;
const PREEMPH: f32 = 0.97;
const LOG_ZERO_GUARD: f32 = 5.960_464_5e-8;
pub const SAMPLE_RATE: usize = 16000;

/// Round to the nearest bfloat16 value. The checkpoint stores the STFT window and mel filterbank
/// in bf16 and NeMo runs with those values, so the features only match NeMo when ours do too.
fn to_bf16(x: f32) -> f32 {
    let bits = x.to_bits();
    f32::from_bits((bits + 0x7FFF + ((bits >> 16) & 1)) & 0xFFFF_0000)
}

/// The mel filterbank, built once and applied to every recording.
pub struct MelFeatures {
    basis: Array2<f32>,
}

/// The samples of a 16 kHz mono 16-bit PCM WAV, the format the conversion Step writes.
pub fn wav_samples(wav: &[u8]) -> Result<Vec<f32>, DiarizationError> {
    let unreadable = |detail: &str| DiarizationError::Engine(format!("unreadable WAV: {detail}"));
    if wav.len() < 12 || &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE" {
        return Err(unreadable("not RIFF WAVE"));
    }
    let mut at = 12;
    let mut is_format_read = false;
    while at + 8 <= wav.len() {
        let id = &wav[at..at + 4];
        let size = u32::from_le_bytes(wav[at + 4..at + 8].try_into().unwrap()) as usize;
        let body = &wav[at + 8..(at + 8 + size).min(wav.len())];
        match id {
            b"fmt " => {
                let field = |offset: usize| u16::from_le_bytes([body[offset], body[offset + 1]]);
                let is_pcm16_mono = body.len() >= 16
                    && field(0) == 1
                    && field(2) == 1
                    && u32::from_le_bytes(body[4..8].try_into().unwrap()) == SAMPLE_RATE as u32
                    && field(14) == 16;
                if !is_pcm16_mono {
                    return Err(unreadable("not 16 kHz mono 16-bit PCM"));
                }
                is_format_read = true;
            }
            b"data" if is_format_read => {
                return Ok(body
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|pair| i16::from_le_bytes(*pair) as f32 / 32768.0)
                    .collect());
            }
            _ => {}
        }
        at += 8 + size + size % 2;
    }
    Err(unreadable("no audio data"))
}

impl Default for MelFeatures {
    fn default() -> MelFeatures {
        MelFeatures {
            basis: create_mel_filterbank(N_FFT, N_MELS, SAMPLE_RATE).mapv(to_bf16),
        }
    }
}

impl MelFeatures {
    /// The log-mel frames of 16 kHz mono `audio`, shaped `(1, frames, N_MELS)`; NeMo's dither
    /// is left out so the same audio always gives the same features.
    pub fn log_mel(&self, audio: &[f32]) -> Result<Array3<f32>, DiarizationError> {
        let spectrogram = stft(&apply_preemphasis(audio, PREEMPH))?;
        let log_mel = self
            .basis
            .dot(&spectrogram)
            .mapv(|x| (x + LOG_ZERO_GUARD).ln());
        Ok(log_mel.t().to_owned().insert_axis(Axis(0)))
    }
}

fn apply_preemphasis(audio: &[f32], coef: f32) -> Vec<f32> {
    if audio.is_empty() {
        return Vec::new();
    }

    let mut result = Vec::with_capacity(audio.len());
    result.push(audio[0]);

    for i in 1..audio.len() {
        result.push(audio[i] - coef * audio[i - 1]);
    }

    result
}

fn hann_window(window_length: usize) -> Vec<f32> {
    // NeMo uses torch.hann_window(periodic=False): divide by N-1, not N
    let n = (window_length - 1) as f64;
    (0..window_length)
        .map(|i| to_bf16((0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / n).cos()) as f32))
        .collect()
}

fn stft(audio: &[f32]) -> Result<Array2<f32>, DiarizationError> {
    let mut planner = RealFftPlanner::<f32>::new();
    let r2c = planner.plan_fft_forward(N_FFT);

    // Create Hann window of length win_length, then zero-pad to n_fft (centered)
    // This is exactly what librosa does: util.pad_center(fft_window, size=n_fft)
    let hann = hann_window(WIN_LENGTH);
    let win_offset = (N_FFT - WIN_LENGTH) / 2;
    let mut fft_window = vec![0.0f32; N_FFT];
    fft_window[win_offset..(WIN_LENGTH + win_offset)].copy_from_slice(&hann[..WIN_LENGTH]);

    // Pad signal for center=True (like librosa/torch.stft)
    // Padding is n_fft // 2 on each side
    let pad_amount = N_FFT / 2;
    let mut padded_audio = vec![0.0; pad_amount];
    padded_audio.extend_from_slice(audio);
    padded_audio.extend(vec![0.0; pad_amount]);

    let num_frames = (padded_audio.len() - N_FFT) / HOP_LENGTH + 1;
    let freq_bins = N_FFT / 2 + 1;
    let mut spectrogram = Array2::<f32>::zeros((freq_bins, num_frames));

    let mut input = vec![0.0f32; N_FFT];
    let mut output = r2c.make_output_vec();
    let mut scratch = r2c.make_scratch_vec();

    for frame_idx in 0..num_frames {
        let start = frame_idx * HOP_LENGTH;

        // Extract n_fft samples and multiply by zero-padded window
        for i in 0..N_FFT {
            input[i] = if start + i < padded_audio.len() {
                padded_audio[start + i] * fft_window[i]
            } else {
                0.0
            };
        }

        r2c.process_with_scratch(&mut input, &mut output, &mut scratch)
            .map_err(|e| DiarizationError::Engine(format!("FFT failed: {e}")))?;

        for k in 0..freq_bins {
            // Power spectrum (magnitude^2) - NeMo uses mag_power=2.0
            spectrogram[[k, frame_idx]] = output[k].norm_sqr();
        }
    }

    Ok(spectrogram)
}

const F_SP: f64 = 200.0 / 3.0;
const MIN_LOG_HZ: f64 = 1000.0;
const MIN_LOG_MEL: f64 = MIN_LOG_HZ / F_SP;
const LOG_STEP: f64 = 0.06875177742094912;

fn hz_to_mel_slaney(hz: f64) -> f64 {
    if hz < MIN_LOG_HZ {
        hz / F_SP
    } else {
        MIN_LOG_MEL + (hz / MIN_LOG_HZ).ln() / LOG_STEP
    }
}

fn mel_to_hz_slaney(mel: f64) -> f64 {
    if mel < MIN_LOG_MEL {
        mel * F_SP
    } else {
        MIN_LOG_HZ * ((mel - MIN_LOG_MEL) * LOG_STEP).exp()
    }
}

fn create_mel_filterbank(n_fft: usize, n_mels: usize, sample_rate: usize) -> Array2<f32> {
    let freq_bins = n_fft / 2 + 1;
    let mut filterbank = Array2::<f32>::zeros((n_mels, freq_bins));

    let fmax = sample_rate as f64 / 2.0;
    let mel_min = hz_to_mel_slaney(0.0);
    let mel_max = hz_to_mel_slaney(fmax);

    // Mel cent freq
    let mel_points: Vec<f64> = (0..=n_mels + 1)
        .map(|i| mel_to_hz_slaney(mel_min + (mel_max - mel_min) * i as f64 / (n_mels + 1) as f64))
        .collect();

    // FFT bin freq
    let fft_freqs: Vec<f64> = (0..freq_bins)
        .map(|i| i as f64 * sample_rate as f64 / n_fft as f64)
        .collect();

    // librosa's ramp
    let fdiff: Vec<f64> = mel_points.windows(2).map(|w| w[1] - w[0]).collect();

    for i in 0..n_mels {
        for (k, &freq) in fft_freqs.iter().enumerate() {
            let lower = (freq - mel_points[i]) / fdiff[i];
            let upper = (mel_points[i + 2] - freq) / fdiff[i + 1];
            filterbank[[i, k]] = 0.0f64.max(lower.min(upper)) as f32;
        }
    }

    // Slaney norm
    for i in 0..n_mels {
        let enorm = 2.0 / (mel_points[i + 2] - mel_points[i]);
        for k in 0..freq_bins {
            filterbank[[i, k]] *= enorm as f32;
        }
    }

    filterbank
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(rate: u32, samples: &[i16]) -> Vec<u8> {
        let data: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let mut bytes = b"RIFF".to_vec();
        bytes.extend((36 + data.len() as u32).to_le_bytes());
        bytes.extend(b"WAVEfmt ");
        bytes.extend(16u32.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(rate.to_le_bytes());
        bytes.extend((rate * 2).to_le_bytes());
        bytes.extend(2u16.to_le_bytes());
        bytes.extend(16u16.to_le_bytes());
        bytes.extend(b"data");
        bytes.extend((data.len() as u32).to_le_bytes());
        bytes.extend(data);
        bytes
    }

    #[test]
    fn reads_the_samples_of_a_16_khz_mono_wav() {
        assert_eq!(
            wav_samples(&wav(16000, &[0, 16384, -32768])),
            Ok(vec![0.0, 0.5, -1.0])
        );
    }

    #[test]
    fn refuses_a_wav_whose_format_is_cut_short() {
        let mut bytes = wav(16000, &[0]);
        bytes[16..20].copy_from_slice(&2u32.to_le_bytes());

        assert!(wav_samples(&bytes).is_err());
    }

    #[test]
    fn refuses_a_wav_of_another_rate() {
        assert!(wav_samples(&wav(44100, &[0])).is_err());
    }
}

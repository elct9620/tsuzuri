//! Streaming Sortformer inference over a whole recording: chunks of mel frames run through the
//! network with a FIFO queue and an arrival-order speaker cache, the cache compressed to the
//! frames that tell speakers apart, and the 10 ms predictions binarized into Speaker Turns.
//!
//! Adapted from parakeet-rs 0.3.8 (`src/sortformer.rs`), MIT License, Copyright (c) 2025 Enes Altun.

use ndarray::{s, Array1, Array2, Array3, Axis};

use super::features::{MelFeatures, N_MELS};
use super::sortformer::{Sortformer, STACK, UPSAMPLE};
use super::turns::{SpeakerTurn, MAX_SPEAKERS};
use super::DiarizationError;

const NUM_SPEAKERS: usize = MAX_SPEAKERS;
const EMB_DIM: usize = 512;
/// One 10 ms prediction frame.
const FRAME_MS: u64 = 10;
/// Activity above which a Speaker is heard, NeMo's default for this model.
const ACTIVITY_THRESHOLD: f32 = 0.5;

// NVIDIA's offline streaming settings from the model card, in 80 ms frames.
const CHUNK_LEN: usize = 340;
const FIFO_LEN: usize = 40;
const SPKCACHE_LEN: usize = 264;
const RIGHT_CONTEXT: usize = 40;
const SPKCACHE_UPDATE_PERIOD: usize = 300;

// Cache compression parameters from NeMo.
const SPKCACHE_SIL_FRAMES_PER_SPK: usize = 1;
const PRED_SCORE_THRESHOLD: f32 = 0.25;
const STRONG_BOOST_RATE: f32 = 0.75;
const WEAK_BOOST_RATE: f32 = 1.5;
const MIN_POS_SCORES_RATE: f32 = 0.5;
const SCORES_BOOST_LATEST: f32 = 0.05;
const MAX_INDEX: usize = 99999;

/// Runs the diarization Model over one recording at a time.
pub struct Diarizer {
    network: Sortformer,
    features: MelFeatures,
    chunk_len: usize,
    fifo_len: usize,
    spkcache_len: usize,
    right_context: usize,
    spkcache_update_period: usize,
    sil_emb: Array1<f32>,
    spkcache: Array3<f32>,
    spkcache_preds: Option<Array3<f32>>,
    fifo: Array3<f32>,
    fifo_preds: Array3<f32>,
}

impl Diarizer {
    pub fn new(network: Sortformer) -> Diarizer {
        let sil_emb = Array1::from_vec(network.silence_embedding().to_vec());
        Diarizer {
            network,
            features: MelFeatures::default(),
            chunk_len: CHUNK_LEN,
            fifo_len: FIFO_LEN,
            spkcache_len: SPKCACHE_LEN,
            right_context: RIGHT_CONTEXT,
            spkcache_update_period: SPKCACHE_UPDATE_PERIOD,
            sil_emb,
            spkcache: Array3::zeros((1, 0, EMB_DIM)),
            spkcache_preds: None,
            fifo: Array3::zeros((1, 0, EMB_DIM)),
            fifo_preds: Array3::zeros((1, 0, NUM_SPEAKERS)),
        }
    }

    /// The Speaker Turns heard in 16 kHz mono `audio`, telling `progress` how many of its
    /// chunks are done out of how many.
    pub fn turns(
        &mut self,
        audio: &[f32],
        mut progress: impl FnMut(usize, usize),
    ) -> Result<Vec<SpeakerTurn>, DiarizationError> {
        self.spkcache = Array3::zeros((1, 0, EMB_DIM));
        self.spkcache_preds = None;
        self.fifo = Array3::zeros((1, 0, EMB_DIM));
        self.fifo_preds = Array3::zeros((1, 0, NUM_SPEAKERS));

        let features = self.features.log_mel(audio)?;
        let total_frames = features.shape()[1];
        let chunk_stride = self.chunk_len * STACK;
        let feed_size = (self.chunk_len + self.right_context) * STACK;
        let num_chunks = total_frames.div_ceil(chunk_stride);

        let mut chunk_predictions = Vec::with_capacity(num_chunks);
        for chunk_idx in 0..num_chunks {
            let start = chunk_idx * chunk_stride;
            let end = (start + feed_size).min(total_frames);
            let current_len = end - start;
            let chunk_feat = Self::pad_chunk(features.slice(s![.., start..end, ..]));
            chunk_predictions.push(self.streaming_update(&chunk_feat, current_len)?);
            progress(chunk_idx + 1, num_chunks);
        }

        let mut preds = Self::concat_predictions(&chunk_predictions);
        // The last chunk rounds up to whole 80 ms frames; trim to the audio's 10 ms frame count.
        if preds.nrows() > total_frames {
            preds = preds.slice(s![..total_frames, ..]).to_owned();
        }
        Ok(binarize(&preds))
    }

    /// Zero-pads a short last chunk to whole 80 ms frames, as NeMo's pre-encoder does; padding
    /// it further would change the predictions of its real frames.
    fn pad_chunk(chunk: ndarray::ArrayView3<f32>) -> Array3<f32> {
        let len = chunk.shape()[1];
        let target = len.next_multiple_of(STACK);
        if len == target {
            return chunk.to_owned();
        }
        let mut padded = Array3::zeros((1, target, N_MELS));
        padded.slice_mut(s![.., ..len, ..]).assign(&chunk);
        padded
    }

    /// NeMo's streaming_update with smart cache compression. The 80ms predictions update the
    /// FIFO and speaker cache; the chunk's 10ms predictions are returned.
    fn streaming_update(
        &mut self,
        chunk_feat: &Array3<f32>,
        current_len: usize,
    ) -> Result<Array2<f32>, DiarizationError> {
        let spkcache_len = self.spkcache.shape()[1];
        let fifo_len = self.fifo.shape()[1];

        let predictions = self
            .network
            .predictions(chunk_feat, &self.spkcache, &self.fifo)?;
        let (preds_diar, preds_hires, new_embs) = (
            predictions.coarse,
            predictions.fine,
            predictions.chunk_embeddings,
        );

        // Right-context frames only gave the chunk lookahead; their predictions are dropped.
        let valid_frames = current_len.div_ceil(STACK);
        let keep = self.chunk_len.min(valid_frames);

        let fifo_preds = if fifo_len > 0 {
            preds_diar
                .slice(s![0, spkcache_len..spkcache_len + fifo_len, ..])
                .to_owned()
        } else {
            Array2::zeros((0, NUM_SPEAKERS))
        };
        let chunk_preds = preds_diar
            .slice(s![
                0,
                spkcache_len + fifo_len..spkcache_len + fifo_len + keep,
                ..
            ])
            .to_owned();
        let chunk_embs = new_embs.slice(s![0, ..keep, ..]).to_owned();

        // The same chunk at 10ms: each 80ms frame covers UPSAMPLE output frames.
        let hires_start = (spkcache_len + fifo_len) * UPSAMPLE;
        let chunk_preds_hires = preds_hires
            .slice(s![0, hires_start..hires_start + keep * UPSAMPLE, ..])
            .to_owned();

        self.fifo = Self::concat_axis1(&self.fifo, &chunk_embs.insert_axis(Axis(0)));

        if fifo_len > 0 {
            let combined = Self::concat_axis0(&fifo_preds, &chunk_preds);
            self.fifo_preds = combined.insert_axis(Axis(0));
        } else {
            self.fifo_preds = chunk_preds.insert_axis(Axis(0));
        }

        let fifo_len_after = self.fifo.shape()[1];

        // Move from FIFO to cache when FIFO exceeds limit. The pop length comes from
        // spkcache_update_period and the chunk length without right context, as in NeMo.
        if fifo_len_after > self.fifo_len {
            let mut pop_out_len = self.spkcache_update_period;
            // NeMo pops chunk_len - self.fifo_len + fifo_len, subtracted last so a chunk shorter
            // than the FIFO never over-pops it.
            pop_out_len = pop_out_len.max((keep + fifo_len).saturating_sub(self.fifo_len));
            pop_out_len = pop_out_len.min(fifo_len_after);

            let pop_out_embs = self.fifo.slice(s![.., ..pop_out_len, ..]).to_owned();
            let pop_out_preds = self.fifo_preds.slice(s![.., ..pop_out_len, ..]).to_owned();

            self.fifo = self.fifo.slice(s![.., pop_out_len.., ..]).to_owned();
            self.fifo_preds = self.fifo_preds.slice(s![.., pop_out_len.., ..]).to_owned();

            self.spkcache = Self::concat_axis1(&self.spkcache, &pop_out_embs);

            if let Some(ref cache_preds) = self.spkcache_preds {
                self.spkcache_preds = Some(Self::concat_axis1(cache_preds, &pop_out_preds));
            }

            if self.spkcache.shape()[1] > self.spkcache_len {
                if self.spkcache_preds.is_none() {
                    let initial_cache_preds =
                        preds_diar.slice(s![.., ..spkcache_len, ..]).to_owned();
                    let combined = Self::concat_axis1(&initial_cache_preds, &pop_out_preds);
                    self.spkcache_preds = Some(combined);
                }

                self.compress_spkcache();
            }
        }

        Ok(chunk_preds_hires)
    }

    /// Keeps the cache frames that best tell the speakers apart, plus a silence frame each.
    fn compress_spkcache(&mut self) {
        let cache_preds = match &self.spkcache_preds {
            Some(p) => p.clone(),
            None => return,
        };

        let n_frames = self.spkcache.shape()[1];
        let per_spk = self.spkcache_len / NUM_SPEAKERS;
        if per_spk <= SPKCACHE_SIL_FRAMES_PER_SPK {
            self.spkcache = self
                .spkcache
                .slice(s![.., ..self.spkcache_len, ..])
                .to_owned();
            if let Some(ref p) = self.spkcache_preds {
                self.spkcache_preds = Some(p.slice(s![.., ..self.spkcache_len, ..]).to_owned());
            }
            return;
        }
        let spkcache_len_per_spk = per_spk - SPKCACHE_SIL_FRAMES_PER_SPK;
        let strong_boost_per_spk = (spkcache_len_per_spk as f32 * STRONG_BOOST_RATE) as usize;
        let weak_boost_per_spk = (spkcache_len_per_spk as f32 * WEAK_BOOST_RATE) as usize;
        let min_pos_scores_per_spk = (spkcache_len_per_spk as f32 * MIN_POS_SCORES_RATE) as usize;

        let preds_2d = cache_preds.slice(s![0, .., ..]).to_owned();
        let mut scores = self.log_pred_scores(&preds_2d);

        scores = self.disable_low_scores(&preds_2d, scores, min_pos_scores_per_spk);

        // Slightly favor frames appended since the last compression
        if SCORES_BOOST_LATEST > 0.0 {
            for t in self.spkcache_len.min(n_frames)..n_frames {
                for s in 0..NUM_SPEAKERS {
                    scores[[t, s]] += SCORES_BOOST_LATEST;
                }
            }
        }

        scores = self.boost_topk_scores(scores, strong_boost_per_spk, 2.0);
        scores = self.boost_topk_scores(scores, weak_boost_per_spk, 1.0);

        if SPKCACHE_SIL_FRAMES_PER_SPK > 0 {
            let mut padded = Array2::from_elem(
                (n_frames + SPKCACHE_SIL_FRAMES_PER_SPK, NUM_SPEAKERS),
                f32::NEG_INFINITY,
            );
            padded.slice_mut(s![..n_frames, ..]).assign(&scores);
            for i in n_frames..n_frames + SPKCACHE_SIL_FRAMES_PER_SPK {
                for j in 0..NUM_SPEAKERS {
                    padded[[i, j]] = f32::INFINITY;
                }
            }
            scores = padded;
        }

        let (topk_indices, is_disabled) = self.kept_frames(&scores, n_frames);

        let (new_embs, new_preds) = self.gather_spkcache(&topk_indices, &is_disabled);

        self.spkcache = new_embs;
        self.spkcache_preds = Some(new_preds);
    }

    /// How well each frame tells its speaker apart from the others, in log odds.
    fn log_pred_scores(&self, preds: &Array2<f32>) -> Array2<f32> {
        let mut scores = Array2::zeros(preds.dim());

        // As NeMo: log(clamp(p)) and log(clamp(1 - p)), each clamped separately on the raw p.
        for t in 0..preds.shape()[0] {
            let mut log_1_probs_sum = 0.0f32;
            for s in 0..NUM_SPEAKERS {
                log_1_probs_sum += (1.0 - preds[[t, s]]).max(PRED_SCORE_THRESHOLD).ln();
            }

            for s in 0..NUM_SPEAKERS {
                let log_p = preds[[t, s]].max(PRED_SCORE_THRESHOLD).ln();
                let log_1_p = (1.0 - preds[[t, s]]).max(PRED_SCORE_THRESHOLD).ln();
                scores[[t, s]] = log_p - log_1_p + log_1_probs_sum - 0.5f32.ln();
            }
        }

        scores
    }

    /// Drops non-speech and, for a speaker with enough clear frames, overlapped speech.
    fn disable_low_scores(
        &self,
        preds: &Array2<f32>,
        mut scores: Array2<f32>,
        min_pos_scores_per_spk: usize,
    ) -> Array2<f32> {
        let mut pos_count = [0usize; NUM_SPEAKERS];
        for t in 0..scores.shape()[0] {
            for s in 0..NUM_SPEAKERS {
                if scores[[t, s]] > 0.0 {
                    pos_count[s] += 1;
                }
            }
        }

        for t in 0..preds.shape()[0] {
            for s in 0..NUM_SPEAKERS {
                let non_speech = preds[[t, s]] <= 0.5;
                let low_overlap = scores[[t, s]] <= 0.0 && pos_count[s] >= min_pos_scores_per_spk;
                if non_speech || low_overlap {
                    scores[[t, s]] = f32::NEG_INFINITY;
                }
            }
        }

        scores
    }

    fn boost_topk_scores(
        &self,
        mut scores: Array2<f32>,
        n_boost_per_spk: usize,
        scale_factor: f32,
    ) -> Array2<f32> {
        for s in 0..NUM_SPEAKERS {
            let mut sorted: Vec<(usize, f32)> = (0..scores.shape()[0])
                .map(|t| (t, scores[[t, s]]))
                .collect();

            sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

            for &(t, _) in sorted.iter().take(n_boost_per_spk.min(sorted.len())) {
                if scores[[t, s]] != f32::NEG_INFINITY {
                    scores[[t, s]] -= scale_factor * 0.5f32.ln();
                }
            }
        }

        scores
    }

    /// The frames to keep, and which of the kept slots hold silence instead.
    fn kept_frames(
        &self,
        scores: &Array2<f32>,
        n_frames_no_sil: usize,
    ) -> (Vec<usize>, Vec<bool>) {
        let n_frames = scores.shape()[0];

        // Speaker-major flat index, speaker * n_frames + time, as NeMo flattens (S, T).
        let mut flat_scores: Vec<(usize, f32)> = Vec::with_capacity(n_frames * NUM_SPEAKERS);
        for s in 0..NUM_SPEAKERS {
            for t in 0..n_frames {
                let flat_idx = s * n_frames + t;
                flat_scores.push((flat_idx, scores[[t, s]]));
            }
        }

        flat_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Disabled scores become MAX_INDEX, which sorts after every real index.
        let mut topk_flat: Vec<usize> = flat_scores
            .iter()
            .take(self.spkcache_len)
            .map(|(idx, score)| {
                if *score == f32::NEG_INFINITY {
                    MAX_INDEX
                } else {
                    *idx
                }
            })
            .collect();

        topk_flat.sort();

        let mut is_disabled = vec![false; self.spkcache_len];
        let mut frame_indices = vec![0usize; self.spkcache_len];

        for (i, &flat_idx) in topk_flat.iter().enumerate() {
            if flat_idx == MAX_INDEX {
                is_disabled[i] = true;
            } else {
                let frame_idx = flat_idx % n_frames;

                if frame_idx >= n_frames_no_sil {
                    is_disabled[i] = true;
                } else {
                    frame_indices[i] = frame_idx;
                }
            }
        }

        (frame_indices, is_disabled)
    }

    fn gather_spkcache(
        &self,
        indices: &[usize],
        is_disabled: &[bool],
    ) -> (Array3<f32>, Array3<f32>) {
        let mut new_embs = Array3::zeros((1, self.spkcache_len, EMB_DIM));
        let mut new_preds = Array3::zeros((1, self.spkcache_len, NUM_SPEAKERS));

        let cache_preds = self.spkcache_preds.as_ref().unwrap();

        for (i, (&idx, &disabled)) in indices.iter().zip(is_disabled.iter()).enumerate() {
            if i >= self.spkcache_len {
                break;
            }

            if disabled {
                // Use silence embedding; predictions stay zero
                new_embs.slice_mut(s![0, i, ..]).assign(&self.sil_emb);
            } else if idx < self.spkcache.shape()[1] {
                new_embs
                    .slice_mut(s![0, i, ..])
                    .assign(&self.spkcache.slice(s![0, idx, ..]));
                new_preds
                    .slice_mut(s![0, i, ..])
                    .assign(&cache_preds.slice(s![0, idx, ..]));
            }
        }

        (new_embs, new_preds)
    }

    fn concat_axis1(a: &Array3<f32>, b: &Array3<f32>) -> Array3<f32> {
        if a.shape()[1] == 0 {
            return b.clone();
        }
        if b.shape()[1] == 0 {
            return a.clone();
        }
        ndarray::concatenate(Axis(1), &[a.view(), b.view()]).unwrap()
    }

    fn concat_axis0(a: &Array2<f32>, b: &Array2<f32>) -> Array2<f32> {
        if a.shape()[0] == 0 {
            return b.clone();
        }
        if b.shape()[0] == 0 {
            return a.clone();
        }
        ndarray::concatenate(Axis(0), &[a.view(), b.view()]).unwrap()
    }

    fn concat_predictions(preds: &[Array2<f32>]) -> Array2<f32> {
        if preds.is_empty() {
            return Array2::zeros((0, NUM_SPEAKERS));
        }
        if preds.len() == 1 {
            return preds[0].clone();
        }

        let views: Vec<_> = preds.iter().map(|p| p.view()).collect();
        ndarray::concatenate(Axis(0), &views).unwrap()
    }
}

/// The runs each Speaker is heard over, from 10 ms predictions; a frame exactly at the threshold
/// keeps the state of the frame before it, as NeMo's hysteresis does.
fn binarize(preds: &Array2<f32>) -> Vec<SpeakerTurn> {
    let mut turns = Vec::new();
    let frames = preds.nrows();
    for speaker in 0..NUM_SPEAKERS {
        let mut is_heard = false;
        let mut start = 0;
        for frame in 0..frames {
            let activity = preds[[frame, speaker]];
            let is_heard_now = if activity > ACTIVITY_THRESHOLD {
                true
            } else if activity < ACTIVITY_THRESHOLD {
                false
            } else {
                is_heard
            };
            if is_heard_now && !is_heard {
                start = frame;
            } else if !is_heard_now && is_heard {
                turns.push(turn(start, frame, speaker));
            }
            is_heard = is_heard_now;
        }
        if is_heard {
            turns.push(turn(start, frames, speaker));
        }
    }
    turns.sort_by_key(|turn| (turn.start_ms, turn.speaker));
    turns
}

fn turn(start_frame: usize, end_frame: usize, speaker: usize) -> SpeakerTurn {
    SpeakerTurn {
        start_ms: start_frame as u64 * FRAME_MS,
        end_ms: end_frame as u64 * FRAME_MS,
        speaker,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diarization::features::wav_samples;

    #[test]
    fn binarizes_the_frames_a_speaker_is_heard_over() {
        let mut preds = Array2::zeros((50, NUM_SPEAKERS));
        for frame in 10..30 {
            preds[[frame, 1]] = 0.9;
        }
        preds[[30, 1]] = ACTIVITY_THRESHOLD;

        assert_eq!(
            binarize(&preds),
            [SpeakerTurn {
                start_ms: 100,
                end_ms: 310,
                speaker: 1
            }]
        );
    }

    /// Needs the diarization Model and a recording of several Speakers, named by
    /// `TSUZURI_E2E_DIARIZATION_MODEL` and `TSUZURI_E2E_DIARIZATION_AUDIO` (16 kHz mono WAV);
    /// prints the turns as RTTM for scoring against the recording's reference.
    #[test]
    #[ignore]
    fn tells_apart_the_speakers_of_a_real_recording() {
        let model = std::env::var("TSUZURI_E2E_DIARIZATION_MODEL").unwrap();
        let audio = std::env::var("TSUZURI_E2E_DIARIZATION_AUDIO").unwrap();
        let samples = wav_samples(&std::fs::read(audio).unwrap()).unwrap();
        let mut diarizer = Diarizer::new(Sortformer::load(model.as_ref()).unwrap());

        let turns = diarizer.turns(&samples, |_, _| {}).unwrap();

        for turn in &turns {
            println!(
                "SPEAKER e2e 1 {:.3} {:.3} <NA> <NA> spk{} <NA> <NA>",
                turn.start_ms as f64 / 1000.0,
                (turn.end_ms - turn.start_ms) as f64 / 1000.0,
                turn.speaker
            );
        }
        let speakers: std::collections::BTreeSet<_> = turns.iter().map(|t| t.speaker).collect();
        assert!(speakers.len() >= 2, "heard only {speakers:?}");
    }
}

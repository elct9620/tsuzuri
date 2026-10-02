//! The Nemotron-3 Diarization network (Sortformer v3) on candle's CPU backend, read from the GGUF
//! NVIDIA publishes. The weights are widened to F32 when loaded, which runs faster on the CPU than
//! multiplying in q8_0 and matches the published model's predictions.
//!
//! Follows transformers' `modeling_nemotron3_diarization.py` and NeMo-Speech.cpp's v3 graph.

use std::path::Path;

use candle_core::quantized::gguf_file;
use candle_core::{DType, Device, Module, Tensor};
use candle_nn::{LayerNorm, Linear};
use ndarray::Array3;

use super::features::N_MELS;
use super::DiarizationError;

const ARCHITECTURE: &str = "sortformer";
const VERSION: &str = "v3";
const D_MODEL: usize = 512;
const N_HEADS: usize = 8;
const HEAD_DIM: usize = D_MODEL / N_HEADS;
/// Mel frames stacked into one encoder frame, 80 ms.
pub const STACK: usize = 8;
const HIDDEN: usize = 192;
/// Output frames each encoder frame is upsampled to, 10 ms each.
pub const UPSAMPLE: usize = 8;
const LN_EPS: f64 = 1e-5;

struct Layer {
    norm1: LayerNorm,
    qkv: Linear,
    out: Linear,
    norm2: LayerNorm,
    ff1: Linear,
    ff2: Linear,
}

/// The network's answer for one chunk: speaker activity at 80 ms and at 10 ms over the whole
/// `[speaker cache | FIFO | chunk]` window, and the chunk's embeddings before encoding.
pub struct ChunkPredictions {
    pub coarse: Array3<f32>,
    pub fine: Array3<f32>,
    pub chunk_embeddings: Array3<f32>,
}

pub struct Sortformer {
    device: Device,
    stack_proj: Linear,
    embed_norm: LayerNorm,
    layers: Vec<Layer>,
    final_norm: LayerNorm,
    encoder_proj: Linear,
    upsample_weight: Tensor,
    upsample_bias: Tensor,
    head_hidden: Linear,
    head_speakers: Linear,
    inv_freq: Vec<f32>,
    silence_embedding: Vec<f32>,
}

struct Weights {
    content: gguf_file::Content,
    file: std::fs::File,
    device: Device,
}

impl Weights {
    fn tensor(&mut self, name: &str) -> Result<Tensor, DiarizationError> {
        let quantized = self.content.tensor(&mut self.file, name, &self.device)?;
        Ok(quantized.dequantize(&self.device)?.to_dtype(DType::F32)?)
    }

    fn linear(&mut self, name: &str, has_bias: bool) -> Result<Linear, DiarizationError> {
        let weight = self.tensor(&format!("{name}.weight"))?;
        let bias = has_bias
            .then(|| self.tensor(&format!("{name}.bias")))
            .transpose()?;
        Ok(Linear::new(weight, bias))
    }

    fn norm(&mut self, name: &str) -> Result<LayerNorm, DiarizationError> {
        Ok(LayerNorm::new(
            self.tensor(&format!("{name}.weight"))?,
            self.tensor(&format!("{name}.bias"))?,
            LN_EPS,
        ))
    }

    fn text(&self, key: &str) -> Option<String> {
        self.content
            .metadata
            .get(key)
            .and_then(|value| value.to_string().ok())
            .cloned()
    }
}

impl Sortformer {
    /// Loads the diarization Model at `path`, refusing a GGUF of any other architecture.
    pub fn load(path: &Path) -> Result<Sortformer, DiarizationError> {
        let mut file = std::fs::File::open(path)?;
        let content = gguf_file::Content::read(&mut file)?;
        let device = Device::Cpu;
        let mut weights = Weights {
            content,
            file,
            device: device.clone(),
        };
        let architecture = weights.text("general.architecture").unwrap_or_default();
        let version = weights.text("sortformer.version").unwrap_or_default();
        if architecture != ARCHITECTURE || version != VERSION {
            return Err(DiarizationError::UnsupportedModel {
                architecture: format!("{architecture} {version}").trim().to_string(),
            });
        }
        let n_layers = weights.content.metadata["sortformer.encoder.n_layers"].to_u32()? as usize;
        let rope_base = weights.content.metadata["sortformer.encoder.rope_base"].to_f32()?;
        let layers = (0..n_layers)
            .map(|i| {
                let prefix = format!("encoder.layers.{i}");
                Ok(Layer {
                    norm1: weights.norm(&format!("{prefix}.norm1"))?,
                    qkv: weights.linear(&format!("{prefix}.attn.w_qkv"), false)?,
                    out: weights.linear(&format!("{prefix}.attn.out_proj"), true)?,
                    norm2: weights.norm(&format!("{prefix}.norm2"))?,
                    ff1: weights.linear(&format!("{prefix}.ffn.net.0"), true)?,
                    ff2: weights.linear(&format!("{prefix}.ffn.net.3"), true)?,
                })
            })
            .collect::<Result<Vec<_>, DiarizationError>>()?;
        let inv_freq = (0..HEAD_DIM / 2)
            .map(|i| 1.0 / rope_base.powf((2 * i) as f32 / HEAD_DIM as f32))
            .collect();
        Ok(Sortformer {
            stack_proj: weights.linear("encoder.pre_encode.proj", false)?,
            embed_norm: weights.norm("encoder.embed_norm")?,
            layers,
            final_norm: weights.norm("encoder.final_norm")?,
            encoder_proj: weights.linear("encoder_proj", true)?,
            upsample_weight: weights.tensor("subpixel_upsample.weight")?,
            upsample_bias: weights.tensor("subpixel_upsample.bias")?,
            head_hidden: weights.linear("head.first_hidden_to_hidden", true)?,
            head_speakers: weights.linear("head.single_hidden_to_spks", true)?,
            silence_embedding: weights.tensor("learnable_sil_emb")?.to_vec1()?,
            inv_freq,
            device,
        })
    }

    /// The learned embedding standing for silence in the speaker cache.
    pub fn silence_embedding(&self) -> &[f32] {
        &self.silence_embedding
    }

    /// Predicts speaker activity over `[spkcache | fifo | chunk]`, where `chunk` holds mel frames
    /// and the caches hold embeddings an earlier chunk answered.
    pub fn predictions(
        &self,
        chunk: &Array3<f32>,
        spkcache: &Array3<f32>,
        fifo: &Array3<f32>,
    ) -> Result<ChunkPredictions, DiarizationError> {
        let (coarse, fine, chunk_embeddings) = self.forward(chunk, spkcache, fifo)?;
        Ok(ChunkPredictions {
            coarse: to_array(&coarse)?,
            fine: to_array(&fine)?,
            chunk_embeddings: to_array(&chunk_embeddings)?,
        })
    }

    fn forward(
        &self,
        chunk: &Array3<f32>,
        spkcache: &Array3<f32>,
        fifo: &Array3<f32>,
    ) -> candle_core::Result<(Tensor, Tensor, Tensor)> {
        // Feature stacking: zero-pad to whole groups of mel frames, then project to D_MODEL.
        let mel = self.tensor(chunk)?;
        let mel_frames = mel.dim(1)?;
        let pad = (STACK - mel_frames % STACK) % STACK;
        let mel = if pad > 0 {
            mel.pad_with_zeros(1, 0, pad)?
        } else {
            mel
        };
        let coarse_frames = (mel_frames + pad) / STACK;
        let chunk_embeddings =
            self.stack_proj
                .forward(&mel.reshape((1, coarse_frames, N_MELS * STACK))?)?;

        let mut parts = Vec::new();
        for cache in [spkcache, fifo] {
            if cache.shape()[1] > 0 {
                parts.push(self.tensor(cache)?);
            }
        }
        parts.push(chunk_embeddings.clone());
        let x = Tensor::cat(&parts, 1)?;
        let frames = x.dim(1)?;

        let (cos, sin) = self.rope_tables(frames)?;
        let mut x = self.embed_norm.forward(&x)?;
        for layer in &self.layers {
            x = self.layer(layer, &x, &cos, &sin)?;
        }
        let x = self.encoder_proj.forward(&self.final_norm.forward(&x)?)?;

        // Sub-pixel upsampling: each encoder frame's channels unfold into UPSAMPLE output frames.
        let y = x
            .transpose(1, 2)?
            .contiguous()?
            .conv1d(&self.upsample_weight, 1, 1, 1, 1)?;
        let y = y.broadcast_add(&self.upsample_bias.reshape((1, HIDDEN * UPSAMPLE, 1))?)?;
        let upsampled = y
            .transpose(1, 2)?
            .contiguous()?
            .reshape((1, frames * UPSAMPLE, HIDDEN))?;

        let hidden = self.head_hidden.forward(&upsampled.relu()?)?;
        let logits = self.head_speakers.forward(&hidden.relu()?)?;
        let fine = candle_nn::ops::sigmoid(&logits)?;
        let speakers = fine.dim(2)?;
        let coarse = fine.reshape((1, frames, UPSAMPLE, speakers))?.mean(2)?;
        Ok((coarse, fine, chunk_embeddings))
    }

    fn tensor(&self, array: &Array3<f32>) -> candle_core::Result<Tensor> {
        let shape = array.shape();
        let values: Vec<f32> = array.iter().copied().collect();
        Tensor::from_vec(values, (shape[0], shape[1], shape[2]), &self.device)
    }

    fn rope_tables(&self, frames: usize) -> candle_core::Result<(Tensor, Tensor)> {
        let half = HEAD_DIM / 2;
        let mut cos = Vec::with_capacity(frames * half);
        let mut sin = Vec::with_capacity(frames * half);
        for position in 0..frames {
            for frequency in &self.inv_freq {
                let angle = position as f32 * frequency;
                cos.push(angle.cos());
                sin.push(angle.sin());
            }
        }
        Ok((
            Tensor::from_vec(cos, (frames, half), &self.device)?,
            Tensor::from_vec(sin, (frames, half), &self.device)?,
        ))
    }

    fn layer(
        &self,
        layer: &Layer,
        x: &Tensor,
        cos: &Tensor,
        sin: &Tensor,
    ) -> candle_core::Result<Tensor> {
        let (batch, frames, _) = x.dims3()?;
        let qkv = layer.qkv.forward(&layer.norm1.forward(x)?)?;
        let heads = |index: usize| -> candle_core::Result<Tensor> {
            qkv.narrow(2, index * D_MODEL, D_MODEL)?
                .reshape((batch, frames, N_HEADS, HEAD_DIM))?
                .transpose(1, 2)?
                .contiguous()
        };
        let q = candle_nn::rotary_emb::rope(&heads(0)?, cos, sin)?;
        let k = candle_nn::rotary_emb::rope(&heads(1)?, cos, sin)?;
        let v = heads(2)?;
        let scores = (q.matmul(&k.t()?)? * (HEAD_DIM as f64).powf(-0.5))?;
        let attention = candle_nn::ops::softmax_last_dim(&scores)?.matmul(&v)?;
        let attention = attention
            .transpose(1, 2)?
            .reshape((batch, frames, D_MODEL))?;
        let x = (x + layer.out.forward(&attention)?)?;
        let feed_forward = layer
            .ff2
            .forward(&layer.ff1.forward(&layer.norm2.forward(&x)?)?.gelu_erf()?)?;
        x + feed_forward
    }
}

fn to_array(tensor: &Tensor) -> Result<Array3<f32>, DiarizationError> {
    let shape = tensor.dims3()?;
    let values = tensor.flatten_all()?.to_vec1::<f32>()?;
    Array3::from_shape_vec(shape, values)
        .map_err(|error| DiarizationError::Engine(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;
    use candle_core::quantized::gguf_file::Value;

    // @behavior DZ-004
    #[test]
    fn refuses_a_model_that_is_not_nemotron_3_diarization() {
        let dir = TempDir::new("dz-architecture");
        let path = dir.path().join("qwen3.gguf");
        let mut file = std::fs::File::create(&path).unwrap();
        let architecture = Value::String("qwen3".to_string());
        gguf_file::write(&mut file, &[("general.architecture", &architecture)], &[]).unwrap();

        let error = Sortformer::load(&path).err();

        assert_eq!(
            error,
            Some(DiarizationError::UnsupportedModel {
                architecture: "qwen3".to_string()
            })
        );
    }
}

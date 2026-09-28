---
license: apache-2.0
language:
- zh
- en
base_model:
- MediaTek-Research/Breeze-ASR-25
base_model_relation: quantized
pipeline_tag: automatic-speech-recognition
library_name: whisper.cpp
tags:
- whisper.cpp
- ggml
- whisper
- traditional-chinese
- code-switching
---

# Breeze-ASR-25 ggml

ggml conversions of [MediaTek-Research/Breeze-ASR-25](https://huggingface.co/MediaTek-Research/Breeze-ASR-25) for [whisper.cpp](https://github.com/ggml-org/whisper.cpp), made with whisper.cpp v1.9.4.

Original model: https://huggingface.co/MediaTek-Research/Breeze-ASR-25 — its card covers the model's languages, training and evaluation.

## Files

| File | Type | Size | Description |
|---|---|---|---|
| `ggml-breeze-asr-25.bin` | f16 | 3.1 GB | Source precision |
| `ggml-breeze-asr-25-q8_0.bin` | q8_0 | 1.7 GB | 8-bit |
| `ggml-breeze-asr-25-q5_0.bin` | q5_0 | 1.1 GB | 5-bit, smallest |

## Download

```bash
hf download tsuzuri-app/Breeze-ASR-25-ggml ggml-breeze-asr-25-q5_0.bin --local-dir .
```

## Usage

```bash
whisper-cli -m ggml-breeze-asr-25-q5_0.bin -l zh -f audio.wav
```

[Tsuzuri](https://github.com/elct9620/tsuzuri), a subtitle editor, offers these files as the Breeze-ASR-25 preset under Settings → Models → Transcription.

## Reproduce

| Step | Tool |
|---|---|
| Source | `breeze-asr-25.pt` (fp16) at `cffe7cc` |
| Convert | whisper.cpp v1.9.4 `convert-pt-to-ggml.py` |
| Tokenizer | openai/whisper v20250625 assets |
| Quantize | whisper.cpp v1.9.4 `whisper-quantize` |

Every input is pinned by version and SHA256 in [`scripts/breeze.sh`](https://github.com/elct9620/tsuzuri/blob/main/scripts/breeze.sh); run `scripts/breeze.sh convert` to rebuild the same files. The weights are unchanged apart from the format conversion and, for q8_0 and q5_0, quantization.

## License

Apache-2.0, as the source model; see `LICENSE`.

## Citation

```bibtex
@article{chou2025selfrefiningframeworkenhancingasr,
  title={A Self-Refining Framework for Enhancing ASR Using TTS-Synthesized Data},
  author={Cheng Kang Chou and Chan-Jan Hsu and Ho-Lam Chung and Liang-Hsuan Tseng and Hsi-Chun Cheng and Yu-Kuan Fu and Kuan Po Huang and Hung-Yi Lee},
  journal={arXiv preprint arXiv:2506.11130},
  year={2025}
}
```

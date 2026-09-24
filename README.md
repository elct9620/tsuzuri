# Tsuzuri

Local transcription, subtitle editing and translation. Audio and text never leave the machine; the network is only used to download the engines and models.

## Development

Requires Rust, Node.js and pnpm.

```bash
pnpm install
pnpm tauri dev      # run the app
pnpm test           # frontend tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml
sumi verify         # check code against .spec/
```

Tsuzuri uses the executable chosen in the app, else one it finds installed (Homebrew, Nix, `PATH`), else downloads the upstream build pinned for the platform. Nothing prebuilt exists for whisper-cli and ffmpeg on macOS, nor for ffmpeg on Linux; for development, build them into `vendor/`, which debug builds look in first. It needs cmake and make:

```bash
scripts/vendor.sh
```

On Linux the prebuilt whisper.cpp and llama.cpp (Vulkan) load `libgomp1` and `libvulkan1` from the system.

The frontend is plain TypeScript with [Stimulus](https://stimulus.hotwired.dev/) controllers under `src/controllers/`.

Two ignored tests run the real engines end to end:

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<ggml whisper model> TSUZURI_E2E_MEDIA=<video or audio> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<gguf> \
  cargo test -- --ignored --nocapture
```

## License

Copyright 2026 ZhengXian Qiu. Licensed under the [Apache License 2.0](LICENSE).

Tsuzuri ships no third-party executable. It runs [FFmpeg](https://ffmpeg.org) (LGPLv2.1), [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT) and [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT) as separate programs, downloaded from their upstream releases at runtime or built into `vendor/` for development by `scripts/vendor.sh`. Rust dependencies are limited to the licenses allowed in `src-tauri/deny.toml`; CI generates their full license texts as `THIRD-PARTY-LICENSES.html` with cargo-about and ships it with every build.

# Tsuzuri

[繁體中文](README.zh-TW.md)

Transcribe video and audio into subtitles, translate them, and proofread the result — all on your own computer. Audio and text never leave the machine; the network is only used to set up the transcription and translation engines.

## Installation

Download the build for your platform. Until the first release is published, builds are available as artifacts of the latest successful [CI run](https://github.com/elct9620/tsuzuri/actions/workflows/ci.yml) on `main`.

| Platform | Download |
|---|---|
| Windows x64 | NSIS installer (`*-setup.exe`), MSI, or the bare `tsuzuri.exe` |
| macOS (Apple Silicon) | `.dmg` |
| Linux x64 | `.deb`, `.rpm` or `.AppImage` |

Tsuzuri is not code-signed, so each system warns the first time it opens.

### macOS

macOS reports the app as damaged because it is not notarized. After moving it to Applications, remove the quarantine flag once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/tsuzuri.app
```

### Windows

When SmartScreen shows "Windows protected your PC", choose **More info**, then **Run anyway**. If the app does not start, install the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (built into Windows 11).

### Linux

The transcription and translation engines need `libgomp1` and `libvulkan1`, and ffmpeg comes from your distribution:

```bash
sudo apt install libgomp1 libvulkan1 ffmpeg
```

## Models

Tsuzuri does not download models; point it at files you already have.

| Purpose | Format | Tested with |
|---|---|---|
| Transcription | whisper.cpp GGML (`.bin`) | Breeze-ASR-25 (Chinese) |
| Translation | GGUF | Qwen3-4B-Instruct-2507 |

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

The frontend is plain TypeScript with [Stimulus](https://stimulus.hotwired.dev/) controllers under `src/controllers/`. The design is in [docs/design.md](docs/design.md).

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

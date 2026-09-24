# Tsuzuri

[繁體中文](README.zh-TW.md)

Transcribe video and audio into subtitles, translate them, and proofread the result — all on your own computer. Audio and text never leave the machine, and the transcription and translation engines come with the app.

## Installation

Download the build for your platform. Until the first release is published, builds are available as artifacts of the latest successful [CI run](https://github.com/elct9620/tsuzuri/actions/workflows/ci.yml) on `main`.

| Platform | Download |
|---|---|
| Windows x64 | NSIS installer (`*-setup.exe`) or MSI |
| macOS (Apple Silicon) | `.dmg` |
| Linux x64 | `.deb`, `.rpm` or `.AppImage` |

The installer includes ffmpeg, whisper.cpp and llama.cpp, built for Vulkan on Windows and Linux and for Metal on macOS. Without a Vulkan-capable GPU driver, or to use another build such as CUDA, choose its executable in the app.

Tsuzuri is not code-signed, so each system warns the first time it opens.

### macOS

macOS reports the app as damaged because it is not notarized. After moving it to Applications, remove the quarantine flag once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/tsuzuri.app
```

### Windows

When SmartScreen shows "Windows protected your PC", choose **More info**, then **Run anyway**. If the app does not start, install the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (built into Windows 11).

### Linux

The bundled engines need `libgomp1` and `libvulkan1` from the system:

```bash
sudo apt install libgomp1 libvulkan1
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

Tsuzuri uses the executable chosen in the app, else one it finds installed (Homebrew, Nix, `PATH`), else the one bundled with the installer. Development builds bundle nothing; build the Components into `vendor/`, which debug builds look in first. `scripts/vendor.sh` builds whisper-cli, llama-server and ffmpeg from the source [`components.json`](components.json) pins, each as the first Variant it lists for the platform unless one is named. It needs cmake, make and jq; Linux OpenBLAS and Vulkan builds also need pkg-config, libopenblas-dev, libvulkan-dev, glslc and spirv-headers, and Windows builds run in MSYS2 UCRT64:

```bash
scripts/vendor.sh               # every Component
scripts/vendor.sh whisper cpu   # one Component, one Variant
```

CI builds every Variant the same way in `.github/workflows/components.yml`, caching each by its pin. Packaging merges `src-tauri/tauri.bundle.conf.json`, which bundles `vendor/` into the installer, so CI restores the first Variant listed for each platform before it runs `pnpm tauri build --config src-tauri/tauri.bundle.conf.json`.

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

The installers bundle [FFmpeg](https://ffmpeg.org) (LGPLv2.1), [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT) and [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT), built from their source by `scripts/vendor.sh` and run as separate programs, which an executable you choose can replace. Rust dependencies are limited to the licenses allowed in `src-tauri/deny.toml`; CI generates their full license texts as `THIRD-PARTY-LICENSES.html` with cargo-about and ships it with every build.

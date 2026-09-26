# Tsuzuri

[繁體中文](README.zh-TW.md)

Transcribe video and audio into subtitles, translate them, and proofread the result — all on your own computer. Audio and text never leave the machine, and the transcription and translation engines come with the app.

## Installation

Download the build for your platform. Until the first release is published, builds are available as artifacts of the latest successful [CI run](https://github.com/elct9620/tsuzuri/actions/workflows/ci.yml) on `main`.

| Platform | Download | Bundled whisper.cpp and llama.cpp |
|---|---|---|
| Windows x64 | NSIS installer (`*-setup.exe`) or MSI | Vulkan build |
| macOS (Apple Silicon) | `.dmg` | Metal build |
| Linux x64 | `.deb`, `.rpm` or `.AppImage` | Vulkan build |

The installer includes ffmpeg as well. Without a Vulkan-capable GPU driver, or to use another build such as CUDA, choose its executable in the app. Tsuzuri is not code-signed, so the system warns the first time it opens.

### macOS

macOS reports the app as damaged because it is not notarized. After moving it to Applications, remove the quarantine flag once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/tsuzuri.app
```

### Windows

| When | Do |
|---|---|
| SmartScreen shows "Windows protected your PC" | Choose **More info**, then **Run anyway** |
| The app does not start | Install the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (built into Windows 11) |

### Linux

The bundled engines need `libgomp1` and `libvulkan1` from the system:

```bash
sudo apt install libgomp1 libvulkan1
```

## Models

Tsuzuri does not download models; point it at files you already have. A project can choose its own transcription and translation models, such as a Japanese model for a Japanese project.

| Purpose | Format | Tested with |
|---|---|---|
| Transcription | whisper.cpp GGML (`.bin`) | Breeze-ASR-25 (Chinese) |
| VAD, when turned on | whisper.cpp GGML (`.bin`) | Silero v6.2.0 (`ggml-silero-v6.2.0.bin`) |
| Translation | GGUF | Qwen3-4B-Instruct-2507 |

## Development

Requires Rust, Node.js and pnpm. The architecture is in [docs/architecture.md](docs/architecture.md) and the design in [docs/design.md](docs/design.md).

```bash
pnpm install
pnpm tauri dev      # run the app
pnpm test           # frontend tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml
sumi verify         # check code against .spec/
```

### Components

```bash
scripts/vendor.sh               # every Component
scripts/vendor.sh whisper cpu   # one Component, one Variant
```

| Building on | Needs |
|---|---|
| Every platform | cmake, make and jq |
| Linux, OpenBLAS and Vulkan builds | pkg-config, libopenblas-dev, libvulkan-dev, glslc and spirv-headers |
| Windows | MSYS2 UCRT64 |

Tsuzuri uses the executable chosen in the app, else one it finds installed (Homebrew, Nix, `PATH`), else the bundled one. Development builds bundle nothing: `scripts/vendor.sh` builds from the source [`components.json`](components.json) pins into `vendor/<component>/<variant>/`, which debug builds look in first, taking the first Variant listed for the platform unless one is named.

### Packaging

```bash
pnpm tauri build --config src-tauri/tauri.bundle.conf.json
```

This configuration bundles `vendor/` into the installer, and the app takes the first bundled Variant that runs, in the order `components.json` lists them. CI builds the first Variant listed for each platform the same way, caching each by its pin.

### Tests that run the engines

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<ggml whisper model> TSUZURI_E2E_MEDIA=<video or audio> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<gguf> \
  cargo test -- --ignored --nocapture
```

These two tests are skipped by default and need Models and a media file.

## License

| Part | License |
|---|---|
| Tsuzuri | [Apache License 2.0](LICENSE), Copyright 2026 ZhengXian Qiu |
| [FFmpeg](https://ffmpeg.org) | LGPLv2.1 |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [llama.cpp](https://github.com/ggml-org/llama.cpp) | MIT |
| Rust dependencies | The licenses `src-tauri/deny.toml` allows |

The bundled engines are built from their source by `scripts/vendor.sh` and run as separate programs, which an executable you choose can replace. CI generates the full license texts as `THIRD-PARTY-LICENSES.html` with cargo-about, and those of the packages the interface bundles as `THIRD-PARTY-LICENSES-WEBVIEW.html`, and ships both with every build.

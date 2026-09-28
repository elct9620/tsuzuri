# Tsuzuri

[繁體中文](README.zh-TW.md)

Transcribe video and audio into subtitles, translate them, and proofread the result — all on your own computer. Audio and text never leave the machine, and the transcription and translation engines come with the app.

## Installation

Download the installer for your platform from [Releases](https://github.com/elct9620/tsuzuri/releases). Each release lists every file's checksum in `SHA256SUMS`; in the download folder, `shasum -a 256 -c SHA256SUMS --ignore-missing` checks what you downloaded on macOS and Linux, and on Windows `Get-FileHash <file>` in PowerShell prints the checksum to compare with the file's line.

| Platform | Download | Bundled whisper.cpp and llama.cpp |
|---|---|---|
| Windows x64 | NSIS installer (`*-setup.exe`) or MSI | Vulkan build |
| macOS (Apple Silicon) | `.dmg` | Metal build |
| Linux x64 | `.deb` or `.rpm` | Vulkan build |

The installer includes ffmpeg as well. Without a Vulkan-capable GPU driver, or to use another build such as CUDA, choose its executable in the app. Tsuzuri is not code-signed, so the system warns the first time it opens.

### macOS

macOS blocks the first launch because the app is not notarized. After moving it to Applications, remove the quarantine flag once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Tsuzuri.app
```

### Windows

| When | Do |
|---|---|
| SmartScreen shows "Windows protected your PC" | Choose **More info**, then **Run anyway** |
| The app does not start | Install the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (built into Windows 11) |

### Linux

The packages declare the libraries the bundled engines need, such as libgomp and libvulkan, so install them with the package manager to bring those along:

```bash
sudo apt install ./Tsuzuri_<version>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./Tsuzuri-<version>-1.x86_64.rpm   # Fedora
```

### Updates

| When | What happens |
|---|---|
| Tsuzuri opens | It checks tsuzuri.aotoki.me for a newer version on your update channel and, if there is one, offers **Update** in a notification |
| Any time | Settings → Version and updates → **Check for updates** |
| You choose **Update** | It downloads the same kind of installer you installed from, checks its signature, stops the engines, installs it and restarts |

Nothing is downloaded until you choose **Update**, and it is refused while a transcription or translation runs. Checking at launch can be turned off under Settings → Version and updates. On Linux, installing asks for your password as `apt` or `dnf` would.

| Update channel | Receives |
|---|---|
| Stable (default) | Released versions |
| Preview | A build of every change in development, and each release as it comes out |

Choose the channel under Settings → Version and updates. A preview is labelled with the release it builds on and when it was built. Moving from Preview back to Stable waits for the next release, or choose **Roll back to stable now** to reinstall the current release straight away. The rpm package offers only Stable.

## Reporting a Problem

| Include | Where |
|---|---|
| The version | Settings → Version and updates → **Copy** |
| The log file | Settings → **Open directory** |
| More detail | Turn on **Debug log** in Settings, restart, and repeat what went wrong |

The debug log adds how each engine was started and ended and what the translation model was asked and answered, which includes your subtitle text; it stays on your computer until you attach it.

## Models

Choose models in Settings. A preset below downloads from Hugging Face into the Hugging Face cache, shared with other Hugging Face tools, so a file already there is not downloaded again. You can also pick a file on disk, or any file a Hugging Face repository holds for the slot. A repository that needs a login uses the token `hf auth login` saved. A project can choose its own transcription and translation models, such as a Japanese model for a Japanese project.

| Purpose | Format | Presets |
|---|---|---|
| Transcription | whisper.cpp GGML (`.bin`) | [Breeze-ASR-25](https://huggingface.co/tsuzuri-app/Breeze-ASR-25-ggml) (Chinese), [Whisper large-v3-turbo and large-v3](https://huggingface.co/ggerganov/whisper.cpp) |
| VAD, when turned on | whisper.cpp GGML (`.bin`) | [Silero v6.2.0](https://huggingface.co/ggml-org/whisper-vad) |
| Translation | GGUF | [Qwen3-4B-Instruct-2507](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF) |

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
| [OpenCC](https://github.com/BYVoid/OpenCC) dictionaries | Apache License 2.0 |

The bundled engines are built from their source by `scripts/vendor.sh` and run as separate programs, which an executable you choose can replace. Every released build carries one license notice with the full texts of Tsuzuri and everything it ships: the engines and the libraries they carry, the Rust crates, and the packages the interface bundles. About in the settings opens it. The OpenCC dictionaries are compiled in as released, and `src-tauri/opencc/` records which release.

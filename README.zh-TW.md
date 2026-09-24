# Tsuzuri

[English](README.md)

在自己的電腦上把影片與音訊轉成字幕，並翻譯、校對。音訊與文字不會離開電腦；網路只用來準備轉錄與翻譯引擎。

## 安裝

下載對應平台的版本。在第一個正式版釋出前，請從 `main` 最近一次成功的 [CI 執行](https://github.com/elct9620/tsuzuri/actions/workflows/ci.yml)下載產物。

| 平台 | 下載 |
|---|---|
| Windows x64 | NSIS 安裝檔（`*-setup.exe`）、MSI，或單獨的 `tsuzuri.exe` |
| macOS（Apple Silicon） | `.dmg` |
| Linux x64 | `.deb`、`.rpm` 或 `.AppImage` |

Tsuzuri 沒有程式碼簽章，所以各系統第一次開啟時會出現警告。

### macOS

App 沒有經過 Apple 公證，macOS 會顯示「已損毀」。把 App 移到「應用程式」後，在終端機執行一次，移除隔離標記：

```bash
xattr -dr com.apple.quarantine /Applications/tsuzuri.app
```

### Windows

出現「Windows 已保護您的電腦」時，點「其他資訊」，再選「仍要執行」。如果 App 打不開，請安裝 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Windows 11 已內建）。

### Linux

轉錄與翻譯引擎需要系統提供 `libgomp1` 與 `libvulkan1`，ffmpeg 則使用發行版的套件：

```bash
sudo apt install libgomp1 libvulkan1 ffmpeg
```

## 模型

Tsuzuri 不會下載模型，請指定電腦上已有的模型檔。

| 用途 | 格式 | 已測試 |
|---|---|---|
| 轉錄 | whisper.cpp GGML（`.bin`） | Breeze-ASR-25（中文） |
| 翻譯 | GGUF | Qwen3-4B-Instruct-2507 |

## 開發

需要 Rust、Node.js 與 pnpm。

```bash
pnpm install
pnpm tauri dev      # 啟動 App
pnpm test           # 前端測試（Vitest）
cargo test --manifest-path src-tauri/Cargo.toml
sumi verify         # 對照 .spec/ 檢查程式碼
```

Tsuzuri 依序使用：在 App 指定的執行檔、偵測到的已安裝版本（Homebrew、Nix、`PATH`）、為該平台釘版的上游預編譯版。macOS 沒有 whisper-cli 與 ffmpeg 的預編譯版，Linux 沒有 ffmpeg 的預編譯版；開發時請先編譯到 `vendor/`，debug build 會優先使用。`scripts/vendor.sh` 依 [`components.json`](components.json) 釘住的原始程式碼編譯 whisper-cli、llama-server 與 ffmpeg，沒有指定變體時使用該平台列出的第一個。需要 cmake、make 與 jq；Linux 的 OpenBLAS、Vulkan 版還需要 pkg-config、libopenblas-dev、libvulkan-dev、glslc 與 spirv-headers，Windows 則在 MSYS2 UCRT64 裡編譯：

```bash
scripts/vendor.sh               # 全部元件
scripts/vendor.sh whisper cpu   # 單一元件、單一變體
```

CI 在 `.github/workflows/components.yml` 以同樣方式編譯全部變體，並依釘版分別快取。

前端是純 TypeScript，Stimulus controller 放在 `src/controllers/`。設計請見 [docs/design.md](docs/design.md)。

有兩個預設略過的測試會實際執行引擎：

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<whisper 的 GGML 模型> TSUZURI_E2E_MEDIA=<影片或音訊> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<GGUF 模型> \
  cargo test -- --ignored --nocapture
```

## 授權

Copyright 2026 ZhengXian Qiu。以 [Apache License 2.0](LICENSE) 授權。

Tsuzuri 不附帶任何第三方執行檔。[FFmpeg](https://ffmpeg.org)（LGPLv2.1）、[whisper.cpp](https://github.com/ggml-org/whisper.cpp)（MIT）與 [llama.cpp](https://github.com/ggml-org/llama.cpp)（MIT）都以獨立程式執行，執行時從上游下載，或在開發時由 `scripts/vendor.sh` 編譯到 `vendor/`。Rust 相依套件只允許 `src-tauri/deny.toml` 列出的授權；CI 以 cargo-about 產生完整授權文字 `THIRD-PARTY-LICENSES.html`，隨每次建置一起提供。

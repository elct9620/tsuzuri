# Tsuzuri

[English](README.md)

在自己的電腦上把影片與音訊轉成字幕，並翻譯、校對。音訊與文字不會離開電腦，轉錄與翻譯引擎也隨 App 內建。

## 安裝

下載對應平台的版本。在第一個正式版釋出前，請從 `main` 最近一次成功的 [CI 執行](https://github.com/elct9620/tsuzuri/actions/workflows/ci.yml)下載產物。

| 平台 | 下載 | 內建的 whisper.cpp、llama.cpp |
|---|---|---|
| Windows x64 | NSIS 安裝檔（`*-setup.exe`）或 MSI | Vulkan 版 |
| macOS（Apple Silicon） | `.dmg` | Metal 版 |
| Linux x64 | `.deb`、`.rpm` 或 `.AppImage` | Vulkan 版 |

安裝檔也內建 ffmpeg。顯示卡驅動程式不支援 Vulkan，或想改用 CUDA 等版本時，請在 App 裡指定執行檔。Tsuzuri 沒有程式碼簽章，第一次開啟時會出現警告。

### macOS

App 沒有經過 Apple 公證，macOS 會顯示「已損毀」。把 App 移到「應用程式」後，在終端機執行一次，移除隔離標記：

```bash
xattr -dr com.apple.quarantine /Applications/tsuzuri.app
```

### Windows

| 情況 | 做法 |
|---|---|
| 出現「Windows 已保護您的電腦」 | 點「其他資訊」，再選「仍要執行」 |
| App 打不開 | 安裝 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Windows 11 已內建） |

### Linux

內建的引擎需要系統提供 `libgomp1` 與 `libvulkan1`：

```bash
sudo apt install libgomp1 libvulkan1
```

## 模型

Tsuzuri 不會下載模型，請指定電腦上已有的模型檔。

| 用途 | 格式 | 已測試 |
|---|---|---|
| 轉錄 | whisper.cpp GGML（`.bin`） | Breeze-ASR-25（中文） |
| 翻譯 | GGUF | Qwen3-4B-Instruct-2507 |

## 開發

需要 Rust、Node.js 與 pnpm。架構見 [docs/architecture.md](docs/architecture.md)，設計見 [docs/design.md](docs/design.md)。

```bash
pnpm install
pnpm tauri dev      # 啟動 App
pnpm test           # 前端測試（Vitest）
cargo test --manifest-path src-tauri/Cargo.toml
sumi verify         # 對照 .spec/ 檢查程式碼
```

### 元件

```bash
scripts/vendor.sh               # 全部元件
scripts/vendor.sh whisper cpu   # 單一元件、單一變體
```

| 編譯環境 | 需要 |
|---|---|
| 全部 | cmake、make、jq |
| Linux 的 OpenBLAS、Vulkan 版 | pkg-config、libopenblas-dev、libvulkan-dev、glslc、spirv-headers |
| Windows | 在 MSYS2 UCRT64 裡編譯 |

App 依序使用：指定的執行檔、偵測到的已安裝版本（Homebrew、Nix、`PATH`）、內建版本。開發時的建置不內建元件，`scripts/vendor.sh` 依 [`components.json`](components.json) 釘住的原始程式碼編譯到 `vendor/<元件>/<變體>/`，debug build 會優先使用；沒有指定變體時用該平台列出的第一個。

### 打包

```bash
pnpm tauri build --config src-tauri/tauri.bundle.conf.json
```

這份設定把 `vendor/` 放進安裝檔，App 依 `components.json` 列出的順序，使用第一個能執行的內建變體。CI 以同樣方式編譯各平台列出的第一個變體，並依釘版分別快取。

### 實際執行引擎的測試

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<whisper 的 GGML 模型> TSUZURI_E2E_MEDIA=<影片或音訊> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<GGUF 模型> \
  cargo test -- --ignored --nocapture
```

這兩個測試預設略過，需要模型與媒體檔。

## 授權

| 範圍 | 授權 |
|---|---|
| Tsuzuri | [Apache License 2.0](LICENSE)，Copyright 2026 ZhengXian Qiu |
| [FFmpeg](https://ffmpeg.org) | LGPLv2.1 |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp)、[llama.cpp](https://github.com/ggml-org/llama.cpp) | MIT |
| Rust 相依套件 | `src-tauri/deny.toml` 允許的授權 |

內建引擎由 `scripts/vendor.sh` 從原始程式碼編譯，以獨立程式執行，也能改用你指定的執行檔。CI 以 cargo-about 產生完整授權文字 `THIRD-PARTY-LICENSES.html`，隨每次建置一起提供。

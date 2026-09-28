# Tsuzuri

[English](README.md)

在自己的電腦上把影片與音訊轉成字幕，並翻譯、校對。音訊與文字不會離開電腦，轉錄與翻譯引擎也隨 App 內建。

## 安裝

從 [Releases](https://github.com/elct9620/tsuzuri/releases) 下載對應平台的安裝檔。每個版本都附上 `SHA256SUMS`，列出每個檔案的校驗碼；macOS 與 Linux 在下載的資料夾執行 `shasum -a 256 -c SHA256SUMS --ignore-missing` 即可確認；Windows 在 PowerShell 執行 `Get-FileHash <檔案>`，再與該檔案那一行比對。

| 平台 | 下載 | 內建的 whisper.cpp、llama.cpp |
|---|---|---|
| Windows x64 | NSIS 安裝檔（`*-setup.exe`）或 MSI | Vulkan 版 |
| macOS（Apple Silicon） | `.dmg` | Metal 版 |
| Linux x64 | `.deb` 或 `.rpm` | Vulkan 版 |

安裝檔也內建 ffmpeg。顯示卡驅動程式不支援 Vulkan，或想改用 CUDA 等版本時，請在 App 裡指定執行檔。Tsuzuri 沒有程式碼簽章，第一次開啟時會出現警告。

### macOS

App 沒有經過 Apple 公證，macOS 會擋下第一次開啟。把 App 移到「應用程式」後，在終端機執行一次，移除隔離標記：

```bash
xattr -dr com.apple.quarantine /Applications/Tsuzuri.app
```

### Windows

| 情況 | 做法 |
|---|---|
| 出現「Windows 已保護您的電腦」 | 點「其他資訊」，再選「仍要執行」 |
| App 打不開 | 安裝 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Windows 11 已內建） |

### Linux

套件已宣告內建引擎需要的 libgomp、libvulkan 等函式庫，用套件管理員安裝就會一併裝好：

```bash
sudo apt install ./Tsuzuri_<version>_amd64.deb      # Debian、Ubuntu
sudo dnf install ./Tsuzuri-<version>-1.x86_64.rpm   # Fedora
```

### 更新

| 時機 | 會發生什麼 |
|---|---|
| 開啟 Tsuzuri | 到 tsuzuri.aotoki.me 檢查所選更新通道有沒有新版本，有的話以通知提供「更新」 |
| 任何時候 | 設定 →「版本與更新」→「檢查更新」 |
| 按下「更新」 | 下載與你安裝時同一種的安裝檔，驗證簽章、停止引擎、安裝並重新啟動 |

按下「更新」之前不會下載任何東西；轉錄或翻譯進行中時無法更新。啟動時的檢查可以在設定 →「版本與更新」關閉。Linux 安裝時會像 `apt`、`dnf` 一樣詢問密碼。

| 更新通道 | 會收到 |
|---|---|
| 穩定版（預設） | 正式發布的版本 |
| 預覽版 | 開發中每次變更的建置，以及每個正式版 |

在設定 →「版本與更新」切換通道。預覽版會標示以哪個正式版為基礎與建置時間。從預覽版切回穩定版後，會等下一個正式版再更新；也可以按「立即退回穩定版」馬上裝回目前的正式版。rpm 套件只有穩定版。

## 回報問題

| 附上 | 位置 |
|---|---|
| 版本 | 設定 →「版本與更新」→「複製」 |
| 記錄檔 | 設定 →「開啟目錄」 |
| 更多細節 | 在設定打開「除錯紀錄」，重新啟動後再重現一次 |

除錯紀錄會另外寫入各引擎如何啟動與結束，以及翻譯模型收到的請求與回答，其中包含字幕文字；在你附上之前，它只留在你的電腦裡。

## 模型

在設定選擇模型。下表的預設模型會從 Hugging Face 下載到 Hugging Face 快取，這個快取和其他 Hugging Face 工具共用，已經在裡面的檔案不會再下載。也可以指定電腦上的檔案，或 Hugging Face repository 裡這個用途能用的任一檔案。需要登入的 repository 會使用 `hf auth login` 存下的 token。每個專案可以另外指定自己的轉錄與翻譯模型，例如日文專案用日文模型。

| 用途 | 格式 | 預設模型 |
|---|---|---|
| 轉錄 | whisper.cpp GGML（`.bin`） | [Breeze-ASR-25](https://huggingface.co/tsuzuri-app/Breeze-ASR-25-ggml)（中文）、[Whisper large-v3-turbo 與 large-v3](https://huggingface.co/ggerganov/whisper.cpp) |
| VAD（開啟時） | whisper.cpp GGML（`.bin`） | [Silero v6.2.0](https://huggingface.co/ggml-org/whisper-vad) |
| 翻譯 | GGUF | [Qwen3-4B-Instruct-2507](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF) |

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
| [OpenCC](https://github.com/BYVoid/OpenCC) 字典 | Apache License 2.0 |

內建引擎由 `scripts/vendor.sh` 從原始程式碼編譯，以獨立程式執行，也能改用你指定的執行檔。每個版本都附上授權頁，收錄 Tsuzuri 與隨附一切的完整授權文字：引擎與它們帶著的函式庫、Rust 套件，以及介面打包的套件，可從設定的「關於」開啟。OpenCC 字典照原樣編譯進執行檔，版本記在 `src-tauri/opencc/`。

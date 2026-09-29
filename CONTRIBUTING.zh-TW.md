# 參與 Tsuzuri 開發

[English](CONTRIBUTING.md)

## 開發

需要 Rust、Node.js 與 pnpm。架構見 [docs/architecture.md](docs/architecture.md)，設計見 [docs/design.md](docs/design.md)。

```bash
pnpm install
pnpm tauri dev      # 啟動 App
pnpm test           # 前端測試（Vitest）
cargo test --manifest-path src-tauri/Cargo.toml
sumi verify         # 對照 .spec/ 檢查程式碼
```

## 元件

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

## 打包

```bash
pnpm tauri build --config src-tauri/tauri.bundle.conf.json
```

這份設定把 `vendor/` 放進安裝檔，App 依 `components.json` 列出的順序，使用第一個能執行的內建變體。CI 以同樣方式編譯各平台列出的第一個變體，並依釘版分別快取。

## 實際執行引擎的測試

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<whisper 的 GGML 模型> TSUZURI_E2E_MEDIA=<影片或音訊> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<GGUF 模型> \
  cargo test -- --ignored --nocapture
```

這兩個測試預設略過，需要模型與媒體檔。

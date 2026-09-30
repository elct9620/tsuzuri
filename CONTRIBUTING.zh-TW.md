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

webview 的 `src/backend/bindings.ts` 由 Rust 的指令、事件與常數生成：改動其中之一時，`cargo test` 會改寫它並失敗一次，改寫後的檔案和改動一起 commit。

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

## 釋出

```
Title: chore(stable): release Build 20260929+143

Releases Preview Build 20260929+143 (173c0ed).

## Verified
- <what testers checked>

## Known issues
- <or none>

## After merging
1. Approve and run the CI of the release PR release-please opens
2. Merge it; release-assets publishes the draft release
```

| 規則 | 原因 |
|---|---|
| 標題寫 Build | 測試者驗證的是它 |
| head 用 `main` | 主線開發，不開分支 |
| 合併前不 push `main` | head 維持是該 Build |
| 用 merge commit 合併 | `stable` 保留每個 commit |
| merge commit 用 PR 標題 | 第一行維持 conventional 格式 |

釋出 PR 把 `main` 合進 `stable`。版號要等合併後才由 release-please 算出，所以標題寫預覽版的 Build；合併前確認 PR 的 head 仍是該 Build 的 commit。

## 實際執行引擎的測試

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<whisper 的 GGML 模型> TSUZURI_E2E_MEDIA=<影片或音訊> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<GGUF 模型> \
  cargo test -- --ignored --nocapture
```

這兩個測試預設略過，需要模型與媒體檔。

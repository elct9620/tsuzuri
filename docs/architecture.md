# Tsuzuri 架構

這份文件記錄執行時各部分怎麼組合，其他內容各有所在，見下表。

| 要找 | 看 |
|---|---|
| 用詞 | `.spec/glossary.md` |
| 行為與介面 | `.spec/` |
| 命名 | `docs/convention.md` |
| 設計取捨 | `docs/design.md` |

## 1 總覽

### 1.1 分層

```
            Webview (src/)
                 │ invoke / listen, only through backend/
 ┌───────────────▼────────────────────────┐
 │ Interface: */commands.rs, window.rs    │  assembled in lib.rs
 └───────────────┬────────────────────────┘
                 │ calls use cases
 ┌───────────────▼────────────────────────┐      ┌──────────────────────────────┐
 │ Application: use cases, CurrentProject,│◄─────┤ Adapter: project/files,      │
 │ Ports (Progress, Steps)                │ impl │ processes, conversion,       │
 └───────────────┬────────────────────────┘ Port │ whisper, llama, diarization/ │
                 ▼                               │ {sortformer,streaming,       │
 ┌────────────────────────────────────────┐      │ features}, toolchain/        │
 │ Domain: transcript, project rules,     │◄─────┴──────────────────────────────┘
 │ translation rules, Version comparison, │
 │ Speaker Turns, Component order         │
 └────────────────────────────────────────┘
```

依賴一律往內：介面呼叫應用，應用與轉接都使用領域。所有運算都在元件的子行程裡，GPU 或記憶體出錯只會結束那個行程。說話者辨識沒有外部元件，由 App 以 `diarize` 參數啟動自己當子行程。

### 1.2 安裝檔內容

```
安裝檔
├─ Tsuzuri               Rust 執行檔，內含 webview 的 dist/
└─ components/           打包時由 vendor/ 複製而來
   └─ <元件>/<變體>/bin/  whisper-cli、llama-server、ffmpeg
```

| 來源 | 決定什麼 |
|---|---|
| `components.json` | 原始程式碼釘版、變體順序 |
| `src-tauri/tauri.bundle.conf.json` | 打包時把 `vendor/` 放進資源的 `components/` |
| `src-tauri/tauri.updater.conf.json` | CI 打包時寫出更新套件的簽章 |
| `scripts/signatures.ts` | 以公鑰與版號檢查簽章 |
| `scripts/manifest.ts` | 寫出 Release 的 `latest.json` |
| `scripts/preview_version.ts` | 算出並寫入預覽版號 |
| `scripts/site.ts` | 組出更新網站 |
| CI 的 cargo-about | 列出 Rust 套件的授權 |
| `scripts/licenses.ts` | 檢查授權並寫出授權頁 |
| `src-tauri/build.rs` | 把建置的 commit 寫進執行檔 |

App 依 `components.json` 列出的順序，使用第一個能執行的內建變體。

### 1.3 原始程式碼配置

```
.
├─ src/                   Webview (chapter 4)
│  ├─ main.ts             starts, assembled by assembly.ts (4.3)
│  ├─ page.ts             draws Page.svelte into <body> (4.3)
│  ├─ Page.svelte         composes the page's regions (4.1)
│  ├─ components/         Svelte Components and their tests (4.1)
│  ├─ backend/            the only way to Rust
│  ├─ controllers/        Stimulus controllers and their tests
│  ├─ editor/             editing core, depends on nothing outside (4.5)
│  ├─ ui/                 shared screen modules
│  └─ locales/            en, zh-Hant
├─ src-tauri/src/         Rust (chapter 3)
│  ├─ project/            the Project context
│  ├─ transcription/      transcription adapters and commands
│  ├─ diarization/        diarization Model, diarize Step and commands
│  ├─ translation/        translation rules, adapters and commands
│  ├─ toolchain/          Component and Model adapters and commands
│  ├─ steps/              Mode commands' skeleton and cancelling
│  └─ <module>/           commands of the other modules
├─ vendor/                built Components, not versioned
├─ scripts/vendor.sh      builds Components by components.json
├─ scripts/licenses.ts    license checks and page
├─ scripts/signatures.ts  checks update signatures
├─ scripts/manifest.ts    writes latest.json
├─ scripts/preview_version.ts  preview version number
├─ scripts/site.ts        update site layout
├─ site/                  update site pages
└─ .spec/                 glossary, behavior, contract
```

Rust 的目錄依情境分，目錄裡的檔案依層分：情境的主檔放規則與用例，`files`、`whisper`、`llama` 等子檔是轉接，`commands.rs` 是介面。

### 1.4 測試

| 範圍 | 執行 | 替身 |
|---|---|---|
| Rust 用例與規則 | `cargo test`，測試寫在程式旁的 `mod tests` | mock app、假元件、`fake_llama` |
| 真的元件 | `cargo test -- --ignored`，需要模型與媒體檔 | 無 |
| Webview | `pnpm test`（Vitest、happy-dom），測試在程式旁 | `mockIPC` 代替 Rust；`editor/` 以假的 port 測試 |
| 規格 | `sumi verify` | 測試以 `@behavior` 宣告實作的情境 |

用例測試使用真的 `Processes` 與 Tauri 的 mock runtime，元件行程與事件依實際的先後發生。mock app 建出 `AppPorts`，shell 腳本假裝元件，`fake_llama` 假裝 llama-server。

## 2 前後端分工

### 2.1 資料所有權

| Rust 擁有 | Webview 擁有 |
|---|---|
| 專案、目前資源、段落、譯文 | 畫面顯示的內容，每次向 Rust 取得 |
| 設定檔、備份、翻譯詞彙表 | modal、勾選、目前段落、Cursor |
| 元件行程、進度、失敗原因 | 介面語言、通知、tooltip |

字幕檔是事實來源，Rust 是唯一的寫入者（3.6）。Webview 不另外儲存工作資料的副本，所有變更都寫進 Rust，再依事件重讀。

### 2.2 指令（Webview ↔ Rust）

```
controller ─▶ backend/<情境>.ts ─▶ bindings.ts ─▶ <情境>/commands.rs ─▶ 用例／CurrentProject
    │    ▲                                                             │
    │    └─────────────── 回答，或 Failure ◀──────────────────────────┘
    └─▶ editor/ session ─▶ backend/editing.ts ─▶ bindings.ts        編輯只走這條
```

| backend 模組 | Rust 模組 | 指令 |
|---|---|---|
| `project.ts` | `project/commands.rs` | 專案、版本、詞彙表 |
| `editing.ts` | `project/commands.rs` | 編輯、搜尋、取代、清理、段落改動、復原 |
| `transcription.ts` | `transcription/commands.rs` | `transcribe` |
| `translation.ts` | `translation/commands.rs` | `translate`、`retranslate`、翻譯設定 |
| `diarization.ts` | `diarization/commands.rs` | `diarize` |
| `toolchain.ts` | `toolchain/commands.rs` | 元件、模型設定與下載 |
| `waveform.ts` | `waveform/commands.rs` | `extract_waveform` |
| `logs.ts` | `logs/commands.rs` | log 目錄、除錯紀錄 |
| `about.ts` | `about/commands.rs` | App Build、釋出與贊助頁面 |
| `updates.ts` | `updates/commands.rs` | 檢查、安裝、通道、退回 |
| `progress.ts` | `steps/commands.rs` | `cancel_task` |

指令名稱與參數以 `.spec/contract/commands.md` 為準。`bindings.ts` 由 Rust 的 `bindings::builder()` 生成，名稱、參數與型別都來自 Rust，測試確認它沒過期。視窗標籤這類兩邊共用的常數也由它帶出。

### 2.3 事件（Rust → Webview）

| 事件 | 送出者 | 接收者 |
|---|---|---|
| `project-changed` | 改變專案的指令 | `ProjectFeed` |
| `pipeline-progress` | 用例經 `Progress` | `progress` |
| `edit-command` | macOS 編輯選單 | `undo`、`segment-changes` |
| `changed-elsewhere-kept` | 重新載入 | `project` |
| `srt-requested` | 第二次啟動、macOS 開檔 | `project` |
| `video-window-closing` | 關閉影片視窗 | `preview` |
| `update-progress` | `install_update` | `updates` |
| `model-download-progress` | `download_model` | 設定頁 |

事件只說有變化或到哪一步，內容再用指令取得。每個事件是 Rust 的一個型別，名稱寫在型別上，`bindings.ts` 的 `events` 依此列出；`project-changed` 以外的七者由 `relayEvents` 轉成 window 的 `rust:` 事件。

### 2.4 錯誤與通知

```
領域的錯誤 ─┐  SrtError、SegmentChangeError、ReplacementError、ProjectError、GlossaryError、ModelError
函式庫的錯誤 ┼─From─▶ Failure { code, … } ──serde──▶ backend/failure.ts（型別）
             │        （failure.rs，應用層）                  │
             │                    ui/failure.ts（依 code 給訊息與種類）◀┘
             │                                                │
             │                        ui/notification.ts（toast）◀┘
```

`Failure` 只帶錯誤碼與資料，文字由 webview 依介面語言產生。各情境回傳自己的錯誤，由 `failure.rs` 以 `From` 收攏；reqwest 的錯誤由 `llama.rs`、hf-hub 的錯誤由 `hub.rs` 轉換。通知種類也依錯誤碼決定：拒絕是自動消失的 warning，出錯是留到關閉的 error。

### 2.5 媒體檔（asset protocol）

```
open_project／open_srt ─▶ asset_protocol_scope().allow_directory(專案目錄)
controller ─▶ backend/project.ts mediaUrl(media) ─▶ <video>／<audio> 直接讀檔
```

| 規則 | 做法 |
|---|---|
| 讀取者 | webview 的媒體元素 |
| 範圍 | 開啟過的專案目錄 |
| 子目錄 | 不含 |
| 路徑來源 | `ProjectView.media` |
| CORS | anonymous，供 Web Audio |
| 沒有媒體檔 | webview 產生靜音，不讀檔 |

影片要能拖動與串流，經由指令傳送整個檔案不可行，所以媒體檔是 webview 唯一直接讀取的資料。路徑仍由 Rust 給出，範圍只含開啟過的專案目錄。

## 3 Rust 端

### 3.1 分層與相依規則

| 層 | 可以依賴 | 不可以依賴 |
|---|---|---|
| 領域 | 標準函式庫、serde、regex、字幕核心 | `Failure`、Tauri、檔案系統、行程、HTTP |
| 應用 | 領域、Port | Tauri、`AppHandle` |
| 轉接 | 應用的 Port、領域 | 其他情境的轉接 |
| 介面 | 應用、轉接的設定讀取 | 直接操作專案目錄或行程 |

| 例外 | 原因 |
|---|---|
| 專案的用例直接呼叫 `project/files.rs` | 目錄是唯一的儲存 |
| 尋找元件直接呼叫 `toolchain/detection.rs` | 偵測就是執行元件；測試用 shell 腳本 |
| 翻譯用例直接使用 `llama.rs` 的 `TranslationModel` | 只有一個實作 |
| 轉錄與辨識自管暫存工作目錄 | 只放中間檔，不屬於專案 |
| `project/glossary.rs` 同時是規則與 csv 讀寫 | 詞彙表的格式就是它的規則 |
| `progress.rs` 與 `Progress` 放在同一檔的 `AppHandle` 實作 | 只發兩個事件，放一起最清楚 |
| `failure.rs` 把 `tauri::Error` 轉成 `Failure` | 統一轉換指令的錯誤 |
| 轉錄與辨識指令請常駐 llama-server 釋放模型 | 一次只載入一個模型（`docs/design.md` 6.4） |
| `system_opener` 直接執行系統程式 | 開啟目錄與網頁，不是元件 |
| 各情境的設定檔經 `json_settings` | 同一種讀寫 |
| 模型下載與清單的指令直接用 `hub` | 只有傳輸，沒有規則 |
| `current_project` 補上預設模型位置 | 專案不引用工具鏈 |
| 領域型別標上 specta 的 `Type` | 生成 webview 的型別 |
| 浮點欄位指定 TS 的 `Number` | specta 預設多一個 null |

第一張表由內而外，依賴一律往內；第二張表是刻意留下的例外與理由。

### 3.2 情境

```
   ┌──────────── 共用核心 ───────────┐
   │ transcript、segment_change、    │
   │ replacement、cleanup、language、│
   │ model_source                    │
   └───▲──────────▲───────────▲──────┘
       │          │           │
  ┌────┴───┐ ┌────┴─────┐ ┌───┴──────────┐
  │ 專案    │ │ 翻譯      │ │ 工具鏈        │
  │ project │ │translation│ │ toolchain     │
  └────────┘ └──────────┘ └──────────────┘
  轉錄（transcription）是「工具鏈 → 字幕」的用例，沒有自己的規則
  波形（waveform）是「工具鏈 → 預覽」的用例，只有取峰值的規則
  說話者辨識（diarization）是「工具鏈 → 字幕」的用例，只有指派說話者的規則
```

情境之間只經由共用核心的型別與 `CurrentProject` 往來，翻譯與轉錄都不直接讀寫專案目錄。

### 3.3 模組

| 目錄 | 模組 | 層 | 負責 |
|---|---|---|---|
| — | `lib` | 介面 | 組裝 |
| — | `bindings` | 介面 | 登記指令、事件與常數 |
| — | `edit_command` | 介面 | 編輯選單的指令 |
| — | `window` | 介面 | 視窗大小、影片視窗 |
| — | `menu` | 轉接 | macOS 復原與重做 |
| — | `logs` | 轉接 | log 目錄與層級 |
| — | `system_opener` | 轉接 | 交給系統開啟 |
| — | `about` | 介面 | App Build、釋出與贊助頁面 |
| — | `updates` | 應用、轉接 | 檢查與安裝更新 |
| — | `release_number` | 領域 | Release Name、是否預覽版 |
| — | `transcript` | 領域 | 段落與 SRT |
| — | `segment_change` | 領域 | 段落變更 |
| — | `replacement` | 領域 | 搜尋取代 |
| — | `cleanup` | 領域 | 簡體清理 |
| — | `language` | 領域 | 語言代碼 |
| — | `model_source` | 領域 | 模型來源 |
| — | `project` | 領域 | 專案聚合、寫回 |
| `project/` | `versions` | 領域 | 逐 cue 比較版本 |
| `project/` | `history` | 領域 | 資源的復原紀錄 |
| `project/` | `glossary` | 領域、轉接 | 詞彙表與 CSV |
| `project/` | `current` | 應用 | 專案的鎖、任務的 hold 與寫入 |
| `project/` | `opened_project` | 應用 | 開啟、編輯、重新載入 |
| `project/` | `mode_hold` | 應用 | 任務對資源的保留 |
| `project/` | `backups` | 領域 | 備份紀錄與時機 |
| `project/` | `files` | 轉接 | 檔名、配對、備份 |
| `project/` | `recent` | 應用、轉接 | 最近的專案與設定檔 |
| `project/` | `requested_srt` | 介面 | 系統要開的 SRT |
| — | `translation` | 應用 | 翻譯用例 |
| `translation/` | `batching` | 領域 | 分批 |
| `translation/` | `speaker_labels` | 領域 | 說話者標籤 |
| `translation/` | `prompt` | 領域 | 請求與回答格式 |
| `translation/` | `repair` | 應用 | 修復與自我檢查 |
| `translation/` | `llama` | 轉接 | llama-server |
| `translation/` | `settings` | 轉接 | 翻譯設定檔 |
| `translation/` | `resident` | 轉接 | 常駐 llama-server |
| — | `conversion` | 轉接 | ffmpeg 轉成 WAV、讀取 WAV |
| — | `transcription` | 應用 | 轉錄用例 |
| `transcription/` | `whisper` | 轉接 | whisper-cli 參數 |
| `transcription/` | `settings` | 轉接 | 轉錄設定檔 |
| — | `waveform` | 應用、領域 | 波形與峰值 |
| — | `diarization` | 應用 | 說話者辨識 |
| `diarization/` | `turns` | 領域 | Speaker Turn 與指派 |
| `diarization/` | `sortformer` | 轉接 | 辨識模型 |
| `diarization/` | `streaming` | 轉接 | 串流推論 |
| `diarization/` | `features` | 轉接 | mel 特徵 |
| `diarization/` | `subcommand` | 介面 | `diarize` 子行程的入口 |
| — | `toolchain` | 應用 | 尋找元件、模型設定 |
| `toolchain/` | `detection` | 轉接 | 偵測已安裝的元件 |
| `toolchain/` | `hub` | 轉接 | Hugging Face 快取與下載 |
| `toolchain/` | `presets` | 應用 | 預設模型清單與比對 |
| `toolchain/` | `settings` | 轉接 | 元件設定檔 |
| — | `progress` | 應用 | 回報進度的 Port |
| — | `steps` | 應用 | Step 與 `ModeRun` |
| — | `timing` | 應用 | Phase 計時 |
| — | `transfer_report` | 領域 | 傳輸進度的回報間隔 |
| — | `failure` | 應用 | 錯誤碼 |
| — | `processes` | 轉接 | 子行程與 `AppPorts` |
| — | `json_settings` | 轉接 | 設定檔的讀寫 |
| — | `preference` | 領域、轉接 | 偏好設定與設定檔 |

目錄以 `src-tauri/src/` 為根，表中的「—」是根目錄，模組省略 `.rs`。各目錄的 `commands` 是介面層的指令，不另列。波形以 ffmpeg 轉成 PCM，每 10 ms 取一個峰值。

### 3.4 Port 與轉接

| Port | 用例怎麼用 | Tauri 實作 | 測試 |
|---|---|---|---|
| `Progress` | 回報 Phase、百分比、專案已變更 | `AppHandle` 發出事件；`AppPorts` 轉交 | mock app 監聽事件 |
| `Steps` | 啟動元件、逐行讀輸出、停止 | `AppPorts` 經由 `Processes` 與 shell plugin | 以 shell 腳本假裝元件 |

介面以 `.spec/contract/ports.md` 為準。只有這兩個 trait，讓用例不依賴 Tauri；其餘協作直接呼叫函式，例外列在 3.1。`AppPorts` 記下它啟動的 PID，取消時只停這些。

### 3.5 生命週期

```
啟動
  │ single-instance    已有 Tsuzuri 時交出參數並結束
  │ RequestedSrt       setup 前就 manage，macOS 可能先送開檔
  │ mount_events       build 後、run 前登記事件，先送的開檔才送得出
  │ reap_strays        清掉上次留下的元件行程（processes.json）
  │ manage             Processes、CurrentProject；收下啟動參數的 SRT
  │ build_main_window  依設定建立主視窗，只准它開影片視窗
  │ size_first_window  第一次開啟佔螢幕 80%，之後由 window-state 還原
  ▼
視窗取得焦點 ─▶ reload_if_changed ─▶ 清單或字幕被外部修改就重新載入並送出 project-changed
系統要開 SRT ─▶ request_srt_argument ─▶ srt-requested ─▶ webview 取走後以 open_srt 開啟
  ▼
結束 ─▶ kill_all       結束仍在執行的元件行程
```

`run()` 是唯一的組裝點：`manage` 的物件由指令以 `State` 參數注入，沒有全域變數。系統要開的 SRT 由 webview 開啟，因為只有它知道介面語言。

### 3.6 目前專案

```
                        CurrentProject(Mutex<HeldProject>)
                     ┌───────────────────────────────────────┐
 指令 ─ 讀檔、改、寫檔 ─▶│ project：從檔案讀出的目前資源、復原紀錄 │─ 寫 ─▶ 字幕檔
 任務 ─ 進度 ─────────▶│ mode_hold：任務鎖住的字幕與它的進度     │       （基準）
 任務結束 ─ 一次寫完 ──▶│                                       │◀─ 讀 ─┘
 view() ◀─ 目前資源疊上進度 ─┤                                       │
                     └───────────────────────────────────────┘
```

| 保護 | 做法 |
|---|---|
| 事實來源 | 字幕檔，只由 Rust 寫 |
| 同時存取 | 一把 Mutex，不在鎖內等待 |
| 每次寫入 | 鎖內讀檔、改、寫、重讀 |
| 任務進度 | 放在 `mode_hold` |
| 任務收尾 | 一次取鎖寫完 |
| 外部修改 | 先留舊版，再拒絕並重讀 |
| 任務中重新載入 | 照常重讀，進度照疊 |
| 重新配對 | 檔案變了就清復原 |

記憶體裡的目前資源就是讀檔的結果，只在讀檔與寫檔後更新，所以記下的內容相同就代表兩者一致。任務進度疊在 `view()` 上，任務結束就丟掉，不會被當成字幕寫回。

### 3.7 寫入者

```
 user (commands)             Modes (ModeRun)               other programs
  edit, Speaker, replace,     transcribe ─▶ original       any subtitle
  cleanup, Segment change,    diarize ─▶ Speakers               │
  undo, redo, restore,        translate ─▶ a translation        │
  take back a cue             retranslate ─▶ chosen cues        │
       │ one command               │ progress in mode_hold      │
       │ written in the lock       │ written in one lock at end │
       ▼                           ▼                            ▼
 ┌──────────────────────── subtitle files (base) ──────────────────────┐
 └──── .tsuzuri/history/: versions replaced and not yet backed up ─────┘
```

| 寫入者 | 時機 | 寫入 |
|---|---|---|
| 編輯、說話者、取代、清理 | 使用者改動 | 那份字幕 |
| 段落變更 | 使用者改動 | 原文與每份譯文 |
| 復原、重做 | 使用者改動 | 資源的所有字幕 |
| 還原、逐句取回 | 使用者改動 | 那份字幕 |
| 轉錄 | 任務結束 | 原文與譯文的說話者 |
| 說話者辨識 | 任務結束 | 原文與譯文的說話者 |
| 翻譯 | 任務結束 | 整份譯文 |
| 重譯 | 任務結束 | 勾選段的譯文 |
| 外部程式 | 任何時候 | 任何字幕 |

雙語 SRT 由字幕產生，跟著寫入更新，不算寫入者。Rust 只在這些時機寫字幕；切換顯示的譯文、重新載入與任務進度都不寫字幕。

### 3.8 一次寫入

```
 取鎖 ─▶ 任務鎖住這份字幕？ ── 是 ─▶ mode-running
         │ 否
         ▼
       檔案和記下的內容不同？ ── 是 ─▶ 留下 Tsuzuri 的版本、重讀
         │ 否                          ─▶ changed-elsewhere
         ▼
       讀檔 ─▶ 改 ─▶ 這次開啟還沒備份它？ ── 是 ─▶ 留覆蓋前備份
                                    │
                                    ▼
       寫檔 ─▶ 記下復原與內容 ─▶ 重讀 ─▶ 放鎖 ─▶ project-changed
```

| 步驟 | 為了 |
|---|---|
| 先查任務的鎖 | 不寫任務要寫的字幕 |
| 比對記下的內容 | 不蓋掉外部修改 |
| 從檔案改起 | 畫面舊了也不寫錯 |
| 首次改動前備份 | 關閉後仍能找回 |
| 寫完就重讀 | 記憶體與檔案一致 |

任務收尾也在一次取鎖內寫完。外部改過就兩邊都留；覆蓋前備份照專案選項每次或每次開啟留一份，寫出後再留產出備份。

### 3.9 任務中的字幕

| 任務 | 拒絕的改動 |
|---|---|
| 轉錄 | 資源的所有改動 |
| 翻譯 | 那份譯文與段落 |
| 重譯 | 勾選段的譯文與段落 |
| 任一任務 | 切換顯示的譯文 |

`mode_hold` 記下任務寫的資源、語言與段落，拒絕的改動答 `mode-running`。改段落、說話者、復原與還原會重寫整份字幕，任務中一律拒絕。重譯結束時只把勾選段合併進當下的檔案。

### 3.10 留下的版本

| 情況 | 留在檔案 | 留成備份 |
|---|---|---|
| 使用者改動 | 改動後的內容 | 開啟後首次改動前 |
| 外部改過，切回視窗 | 外部版本 | Tsuzuri 的版本 |
| 外部改過，再改動 | 外部版本 | Tsuzuri 的版本 |
| 任務寫出 | 任務的結果 | 覆蓋前與產出 |
| 任務中外部改過 | 任務的結果 | 兩邊都留 |
| 任務取消或失敗 | 原本的檔案 | 不留 |
| 重譯中改其他段 | 兩者合併 | 首次改動前 |
| 復原、重做 | 復原的內容 | 不留 |

後寫的留在檔案，被取代而還沒有備份的版本先留進 `.tsuzuri/history/`，所以任何一方的內容都能從「版本」找回。復原與重做換回的內容已在復原紀錄與備份裡，不再多留。

### 3.11 任務

```
mode command: transcribe, diarize, translate, retranslate
  │ begin_mode    wait ModeLock ─▶ Phases start ─▶ prepare
  │ make room for the Model, find Components, work_directory
  ▼ run_until_cancelled(use case)
  │   hold_for_*  target + hold in one lock
  │   Steps       progress + project-changed
  │   write_*     one lock
  ▼ end_mode      drop ModeRun ─▶ project-changed
answer Phase timings
```

任務指令都走同一條骨架，等鎖的時間不算進任何 Phase。用例在取得執行權後才取目標，目標與 hold 在同一次取鎖內拿到。

| 任務 | 目標與 hold | Steps | 寫回 |
|---|---|---|---|
| 轉錄 | `hold_for_transcription` | ffmpeg、whisper-cli | `write_transcription` |
| 辨識 | `hold_for_diarization` | ffmpeg、`diarize` | `write_speakers` |
| 翻譯 | `hold_for_translation` | 常駐 router 載入 | `write_translations` |

轉錄與辨識先請常駐 llama-server 釋放模型。轉錄逐段 `push_segment`，翻譯分批 `show_translations` 並 `mark_pending_batch`，保留 N 秒後釋放模型。

### 3.12 任務的規則

| 規則 | 做法 |
|---|---|
| 一次一個 | `ModeLock::begin` |
| 取消 | `cancel_task` 經 `ModeLock` |
| 取消後 | 只結束它啟動的行程 |
| 取波形 | 不是任務，不取鎖 |
| 下載模型 | 不是任務，不取鎖 |
| 暫存目錄 | 隨 `ModeRun` 結束刪除 |
| 安裝更新 | `try_turn`，執行中拒絕 |

關掉常駐 llama-server 也先取得 `ModeLock`，後來的等前一個結束。取消時 `ModeRun` 丟下任務，只結束經它啟動的行程。每個 Phase 開始時經由 `Progress` 送出 `pipeline-progress`。

### 3.13 行程

| 時機 | `Processes` 做什麼 |
|---|---|
| 啟動元件 | 以絕對路徑啟動，PID 與名稱寫進 `processes.json` |
| 元件輸出 | 每行寫進 log，最後才送出結束 |
| 元件結束 | 從紀錄移除 |
| 常駐 router | 背景啟動，關掉常駐時停止 |
| App 結束 | `kill_all`，連同 router 開的模型行程 |
| 安裝更新 | 下載後、安裝前 `kill_all` |
| 下次啟動 | `reap_strays` 只結束 PID 與名稱都相符的行程 |
| PID 是 App 自己 | 不結束，辨識與 App 同名 |

元件一律經 shell plugin 啟動。介面以 `.spec/contract/processes.md` 為準。

### 3.14 元件解析

```
使用者指定（components.json 設定檔）
   └ 沒有 ─▶ 偵測：vendor/（debug）、PATH、套件管理器的目錄
               └ 沒有 ─▶ 內建變體，依 Build Manifest 的順序取第一個能執行的
                           └ 都不行 ─▶ 未就緒，附上安裝方式
```

偵測會執行元件的版本旗標，所以放在 tokio 的 blocking pool，視窗不會停住。每次找到都記錄來源與耗時。

### 3.15 模式

```
lib.rs run() ── manage ──▶ Processes · CurrentProject · ResidentLlama · ModeLock
                               │ commands take State<'_, T>
                               ▼
command ── begin_mode ──▶ ModeRun: turn, ports, keep   + Phases
                             │ &ModeRun
                             ▼
                          use case (sees only Ports) ── end_mode
```

| 模式 | 何時用 | 範例 |
|---|---|---|
| Composition Root | 組裝 app 範圍物件 | `lib.rs` |
| 注入 State | 指令取得依賴 | `project/commands.rs` |
| Mode Run | 任務範圍的狀態 | `transcription/commands.rs` |

任務範圍的東西（取消、它啟動的行程、資源的 hold）由 `ModeRun` 擁有，不寄放在 app 範圍的物件上。Phases 與 `ModeRun` 一起由 `begin_mode` 開始，任務的組合固定，不另寫狀態機。

## 4 Webview

### 4.1 分層

```
index.html, Page.svelte       data-controller, data-action
    |
components/, controllers/ --> ui/, backend/ (editing aside)
    |                         interface: DOM events to use cases, changes to the page
    v
editor/  session.ts           application: Cursor, Checked Segments, use cases, port
         cursor.ts, rules.ts   domain: state machines and rules
         field.ts, marks.ts    DOM: field offsets, drawing the Cursor
    ^
    | implements EditingPort
backend/editing.ts            gateway: the one caller of editing commands
```

依賴一律往內，和 Rust 端（3.1）同一套規則：介面呼叫應用，應用使用領域，閘道實作應用宣告的 port。`main.ts` 是組裝點（4.3）。

#### 4.1.1 頁面 markup

`index.html` 只留 `<body>` 與掛在上面的 controller，其餘 markup 由 Svelte 元件寫出。

| 選擇 | 原因 |
|---|---|
| markup 寫成 Svelte 元件 | 畫面能依區域拆開 |
| 不改成 custom element | 翻譯與圖示靠靜態掃描 |
| 多 controller 的外框留在 `Page.svelte` | target 必須是後代 |

`Page.svelte` 組合 `components/` 下各區域的 Svelte 元件。轉換過行為的 Svelte 元件自己保存畫面狀態，以 `t()` 寫出文字。其餘 markup 的 i18n 與 Lucide 圖示在寫入後掃描一次，所以不放進會重畫的區塊。轉換期間 Stimulus 照常接上 Svelte 寫出的元素。

### 4.2 相依規則

| 層 | 可以依賴 | 不可以依賴 |
|---|---|---|
| `editor/` | DOM | `editor/` 以外的模組 |
| `backend/` | Tauri、`editor/` 的 port | controller |
| controller | `editor/index.ts`、`ui/`、`backend/` | 編輯指令、其他 controller |
| `ui/` | i18n、`editor/` 與 `backend/` 的型別 | controller |
| `page.ts` | `Page.svelte`、i18n、`ui/` | controller |
| `components/` | 其他 Svelte 元件、i18n、`ui/`、`backend/` | controller |
| `main.ts` | 全部 | — |

Controller 之間只 import outlet 的型別，編輯一律經過 session。對應 Rust 的型別只定義在 `backend/`；`editor/` 有自己的型別，由 `backend/editing.ts` 換算，同名的型別在那裡以別名區分。

#### 4.2.1 事件的接法

事件交給框架接上與解除，所以不自己訂閱 Rust 或 window 的事件；只有影片視窗例外。下表是各處的接法。

| 誰 | 接法 | 解除 |
|---|---|---|
| controller | `data-action` | 隨元素，由 Stimulus |
| Svelte 元件 | `onclick` 等事件屬性 | 隨元件，由 Svelte |
| 影片視窗 | `preview` 自己綁定 | 例外，見 4.9 |

### 4.3 組裝

```
main.ts -> drawPage()                               page.ts
  +-- mount(Page) -> translatePage -> showIcons
main.ts -> assemble(application, controllers)      assembly.ts
  |-- feed = new ProjectFeed()        reads current_project on each change
  |-- session = new EditingSession(editingPort)
  |-- feed -> session.follow -> each controller -> session.announce
  |-- session.onChange -> window: editor:cursor, editor:choice, editor:checks
  |-- start() -> relayEvents: a Rust event -> window: rust:<event name>
  |-- start() -> light or dark theme -> window: system:color-scheme
  |-- start() -> the screen turns -> window: system:orientation
  +-- application.register(name, class extends X { session, feed })
```

| 模式 | 何時用 | 範例 |
|---|---|---|
| Composition Root | 組裝 app 範圍物件 | `assembly.ts` |
| 註冊時注入 | controller 取得依賴 | `class extends` |
| 專案訂閱 | 分送同一份專案 | `ProjectFeed` |

頁面先由 `drawPage` 寫好，controller 才連上。Svelte 元件直接 import `backend/`，在 `onMount` 讀取；要讀 feed 或 session 時，才由 `mount` 的 context 傳入。Stimulus 自己建立 controller，所以依賴放在註冊的子類別上。測試也呼叫 `assemble`，替身只換 IPC，組裝與 App 相同。沒有 controller 自己向 Rust 讀專案。

### 4.4 先後順序

| 步驟 | 內容 |
|---|---|
| 1 | 改段數的改動先記下待套用 |
| 2 | 讀到的專案比上一份舊就丟掉 |
| 3 | session 換算並套用待套用 |
| 4 | 各 controller 依專案重畫，出錯的不擋後面 |
| 5 | 送出 `editor:cursor`，移動焦點 |

`project-changed` 可能比指令的回答先到，所以待套用在送出前就記下，被拒絕時清掉。只有改變段數的改動會移動 Cursor，才記成待套用；段數不變的改動寫入後就清掉勾選。焦點與 Cursor 等列畫完才動，才不會落在即將被取代的舊列上；重畫出錯以 `reportError` 回報。

### 4.5 editor

| 檔案 | 層 | 內容 |
|---|---|---|
| `index.ts` | 對外 | 唯一可 import 的入口 |
| `segment.ts` | 領域 | 自己的段落與專案檢視型別 |
| `cursor.ts` | 領域 | Cursor 的狀態機 |
| `rules.ts` | 領域 | 合併、鎖定、分割的規則 |
| `session.ts` | 應用 | `EditingSession` 與 port |
| `field.ts` | DOM | 欄位內容、選取與文字欄位 |
| `marks.ts` | DOM | 畫出 Cursor |
| `highlight.ts` | DOM | CSS Custom Highlight |

`editor/` 是能抽成獨立套件的編輯核心：Current Segment、Cursor、Checked Segments 與改動段落的用例都在這裡。用例回傳結果而不發通知，controller 再轉成介面文字。

### 4.6 Controller

| Controller | 畫面區域 |
|---|---|
| `project`、`transcript`、`segment-changes`、`dialog` | 工具列、資源清單、字幕編輯、設定 |
| `project-settings` | 設定的專案頁 |
| `preferences` | 設定的偏好頁 |
| `recent-projects` | 起始畫面與開啟選單的最近專案 |
| `speakers` | 說話者選單與設定 modal |
| `replacement` | 搜尋取代 modal |
| `cleanup` | 清理簡體的選單、工具列與快速鍵 |
| `search` | 搜尋列與符合處標記 |
| `comparison` | 對照備份、參照譯文、單句還原 |
| `transcribe`、`translate`、`translation-options` | 任務 modal，含重做 |
| `diarize` | 辨識說話者的 modal |
| `resource-list` | 資源清單的固定與收起 |
| `preview` | 播放器、疊字、收起、影片視窗 |
| `timeline` | 波形、段落區段、縮放 |
| `progress` | 標題列的任務進度徽章 |
| `versions`、`glossary` | 版本與詞彙表 modal |
| `components`、`models`、`transcription-settings`、`translation-settings`、`logs` | 設定頁 |
| `model-slot`、`repository` | 模型來源的選單、下載與 Repository |
| `about`、`updates` | 版本與更新、安裝視窗 |
| `licenses` | 關於的授權頁 |
| `sponsorship` | 關於的贊助頁面 |
| `tooltip` | 全頁共用的 tooltip |
| `shortcuts` | 快速鍵一覽 |
| `notification` | 每則通知的倒數、暫停與按鈕 |
| `undo` | 全頁的復原與重做 |
| `field` | 每個編輯欄位接上 session |
| `time-field` | 時間欄覆寫輸入 |

畫面配置見 `docs/ui.md`。controller 不保存編輯狀態，互動與勾選都經過 session。`preview` 與 `timeline` 掛在同一個元素，共用 `<video>`，沒有媒體檔時由 `ui/silence.ts` 決定同一段靜音。追蹤播放鈕在預覽卡片，屬於捲動清單的 `transcript`。

| 事件或 outlet | 送出者 | 接收者與用途 |
|---|---|---|
| `progress:task` | `progress` | 字幕編輯顯示 skeleton |
| `project:select` | `project` | 字幕編輯顯示 skeleton |
| `project:select` | `project` | `resource-list` 收回蓋上的清單 |
| `transcript:shown` | 字幕編輯 | `comparison` 重新標記；`speakers` 取得名稱 |
| `transcript:shown` | 字幕編輯 | `segment-changes` 顯示入口 |
| `transcript:selection` | 字幕編輯 | 焦點欄位跟上選取 |
| `versions` outlet | `comparison` | 開啟版本 dialog |
| `versions:compare-with` | `versions` | `comparison` 換對照 |
| `editor:cursor` | session，經 `assembly.ts` | 標出 Current Segment 與 Cursor |
| `editor:choice` | session，經 `assembly.ts` | `timeline` 依來源移動媒體 |
| `editor:checks` | session，經 `assembly.ts` | 顯示勾選工具列 |
| `rust:pipeline-progress` | Rust，經 `relayEvents` | `progress` 顯示 Phase |
| `rust:edit-command` | Rust，經 `relayEvents` | `undo` 與 `segment-changes` |
| `rust:changed-elsewhere-kept` | Rust，經 `relayEvents` | `project` 顯示通知 |
| `rust:srt-requested` | Rust，經 `relayEvents` | `project` 開啟系統要開的 SRT |
| `rust:model-download-progress` | Rust，經 `relayEvents` | `model-slot` 顯示下載進度 |
| `system:color-scheme` | 系統，經 `assembly.ts` | `timeline` 重畫波形 |
| `system:orientation` | 系統，經 `assembly.ts` | `resource-list` 換成該方向的選擇 |
| `model-slot:choose` | `model-slot` | `models`、`project-settings` 記下來源 |
| `preferences:saved` | `preferences` | `timeline` 重讀換段的偏好 |
| `preview:playing` | `preview` | 字幕編輯標出播放中，追蹤時捲動 |
| `translation-options:overwrite` | `translation-options` | 翻譯 modal 改開始鈕文字 |
| `segment-changes:speakers` | `segment-changes` | `speakers` 為 Checked Segments 開設定 |
| `segment-changes:retranslate` | `segment-changes` | `translate` 開啟重新翻譯 |
| `segment-changes:retranscribe` | `segment-changes` | `transcribe` 開啟重新轉錄 |

### 4.7 backend

| 模組 | 內容 |
|---|---|
| `project.ts` | 專案、版本、詞彙表的指令與訂閱 |
| `editing.ts` | 實作 `editor/` 的 port |
| `transcription.ts`、`translation.ts`、`diarization.ts` | 任務與設定的指令、型別 |
| `toolchain.ts` | 元件與模型的指令與型別 |
| `logs.ts` | log 目錄、除錯紀錄的指令 |
| `preferences.ts` | 偏好設定的指令與預設值 |
| `about.ts` | App Build、開啟釋出與贊助頁面 |
| `waveform.ts` | 波形的指令與型別 |
| `progress.ts` | 取消任務，進度與 Phase 耗時的型別 |
| `bindings.ts` | 生成的指令、事件、型別與常數 |
| `events.ts` | 把 Rust 事件轉到 window |
| `failure.ts` | `Failure` 型別 |
| `dialog.ts`、`system.ts` | 系統對話方塊、語系與平台 |
| `video_window.ts` | 影片視窗的全螢幕與關閉 |
| `context_menu.ts` | 右鍵時的系統選單 |

`backend/` 是 webview 接觸 Tauri 的地方：指令、外掛與系統選單都經過它，controller 不直接呼叫 Tauri。

### 4.8 共用模組

| 模組 | 內容 |
|---|---|
| `ui/notification.ts` | 產生 toast 通知，互動交給 `notification` |
| `ui/save_mark.ts` | 標題列的存檔提示與計時 |
| `ui/failure.ts` | 錯誤碼的訊息與通知種類 |
| `ui/progress.ts` | 任務種類、進度文字、Phase 耗時 |
| `ui/time.ts`、`ui/menu.ts` | 時間格式與欄位綁定、關閉選單 |
| `ui/models.ts` | Model Source 的名稱與大小 |
| `ui/options.ts` | 選單的選項 |
| `ui/choices.ts` | 記在這台電腦的畫面選擇 |
| `ui/fold.ts` | 收起時點亮收起鈕 |
| `ui/volume.ts` | 音量曲線、增益與限幅 |
| `ui/video_window.ts` | 開啟影片視窗、轉交按鍵 |
| `ui/icons.ts` | 只打包列出的 Lucide 圖示 |
| `ui/timeline_spans.ts` | 時間軸區段與選段的落點 |
| `ui/file_name.ts` | 路徑的最後一段 |
| `ui/silence.ts` | 沒有媒體檔時播放的靜音 |
| `ui/shortcuts.ts` | 各平台的快速鍵、比對與寫法 |
| `ui/text_fields.ts` | 原文或譯文的選擇、選取的文字 |
| `i18n.ts`、`locales/` | 介面語言與翻譯字串 |

圖示要先在 `ui/icons.ts` 列出才會畫出來：markup 以 `data-lucide` 標出，程式以 `iconElement` 建立。快速鍵以 `ui/shortcuts.ts` 為準：controller 自己比對的鍵用 `isShortcut` 讀它，寫在 `data-action` 與 Rust 選單的鍵由測試雙向核對。

### 4.9 影片視窗

```
 主視窗（Stimulus、IPC）                     影片視窗（label video，沒有 capability）
  preview ─ window.open("about:blank") ─▶ on_new_window：只准一個空白頁
     │ 複製樣式表，把 screen（<video>、疊字）移過去 ─▶ 同一份 JS，同一個播放器
     │ ◀─ keydown 轉給主視窗的 window；雙擊、Esc 切換全螢幕
 關閉 ─▶ CloseRequested 被擋下 ─▶ video-window-closing ─▶ 移回預覽 ─▶ destroy
 主視窗關閉 ─▶ window.rs 一併 destroy 影片視窗
```

| 規則 | 做法 |
|---|---|
| 播放器 | 只有一個，移動不複製 |
| 移出去的元素 | connect 時留下參照 |
| 播放器的事件 | `preview` 自己綁在元素上 |
| 影片視窗的事件 | `preview` 開窗時綁定 |
| 每格畫面 | 用影片所在視窗的 rAF |
| 移動會暫停或重載 | 設回時間再播 |
| 呼叫 Rust | 只從主視窗 |
| 關閉 | 先移回，再 destroy |
| 再開 | 等上一個關完 |
| 位置與大小 | 建立時放回上次 |
| 視窗標籤 | Rust 定義，bindings 帶出 |

元素離開主視窗的 document 後，Stimulus 找不到 target，也解除 `data-action`，所以參照在 connect 時留下，播放器的事件由 `preview` 自己綁定。關閉前先移回，播放器才不隨影片視窗結束。

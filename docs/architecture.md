# Tsuzuri 架構

這份文件記錄執行時各部分怎麼組合。用詞見 `.spec/glossary.md`，行為與介面見 `.spec/`，命名見 `docs/convention.md`，設計取捨見 `docs/design.md`。

## 1 總覽

### 1.1 分層

```
            Webview（src/）
                 │ invoke／listen，只經過 backend/
 ┌───────────────▼────────────────────────┐
 │ 介面：*/commands.rs、window.rs          │  lib.rs 組裝
 └───────────────┬────────────────────────┘
                 │ 呼叫用例
 ┌───────────────▼────────────────────────┐      ┌─────────────────────────────┐
 │ 應用：用例、CurrentProject、           │◄─────┤ 轉接：project/files、        │
 │       Port（Progress、Steps）          │ 實作 │ processes、whisper、llama、  │
 └───────────────┬────────────────────────┘ Port │ toolchain/{detection,settings}│
                 ▼                               └──────────────┬──────────────┘
 ┌────────────────────────────────────────┐                     │
 │ 領域：字幕、專案規則、翻譯規則、        │◄────────────────────┘
 │       版本比較、元件尋找順序            │
 └────────────────────────────────────────┘
```

依賴一律往內：介面呼叫應用，應用與轉接都使用領域。所有運算都在元件的子行程裡，GPU 或記憶體出錯只會結束那個行程。

### 1.2 安裝檔內容

```
安裝檔
├─ Tsuzuri               Rust 執行檔，內含 webview 的 dist/
└─ components/           打包時由 vendor/ 複製而來
   └─ <元件>/<變體>/bin/  whisper-cli、llama-server、ffmpeg
```

| 來源 | 決定什麼 |
|---|---|
| `components.json` | 各元件的原始程式碼釘版，以及各平台變體的順序 |
| `src-tauri/tauri.bundle.conf.json` | 打包時把 `vendor/` 放進資源的 `components/` |
| CI 的 cargo-about | 產生 `THIRD-PARTY-LICENSES.html`，隨建置提供 |
| CI 的 `scripts/webview-licenses.ts` | 檢查 webview 打包的套件授權，產生 `THIRD-PARTY-LICENSES-WEBVIEW.html`，隨建置提供 |

App 依 `components.json` 列出的順序，使用第一個能執行的內建變體。

### 1.3 原始程式碼配置

```
.
├─ src/                   Webview（第 4 章）
│  ├─ backend/            Rust 的唯一入口
│  ├─ controllers/        Stimulus controller 與它們的測試
│  ├─ ui/                 共用的畫面模組
│  └─ locales/            en、zh-Hant
├─ src-tauri/src/         Rust（第 3 章）
│  ├─ project/            專案情境
│  ├─ transcription/      轉錄用例的轉接與指令
│  ├─ translation/        翻譯規則、轉接與指令
│  └─ toolchain/          元件與模型的轉接與指令
├─ vendor/                編譯好的元件，不進版控
├─ scripts/vendor.sh      依 components.json 編譯元件
├─ scripts/webview-licenses.ts  webview 套件的授權檢查與聲明
└─ .spec/                 glossary、behavior、contract
```

Rust 的目錄依情境分，目錄裡的檔案依層分：情境的主檔放規則與用例，`files`、`whisper`、`llama` 等子檔是轉接，`commands.rs` 是介面。

### 1.4 測試

| 範圍 | 執行 | 替身 |
|---|---|---|
| Rust 用例與規則 | `cargo test`，測試寫在程式旁的 `mod tests` | mock app 建出 `AppPorts`；shell 腳本假裝元件；`fake_llama` 假裝 llama-server |
| 真的元件 | `cargo test -- --ignored`，需要模型與媒體檔 | 無 |
| Webview | `pnpm test`（Vitest、happy-dom），測試放在 controller 旁 | `mockIPC` 代替 Rust |
| 規格 | `sumi verify` | 測試以 `@behavior` 宣告實作的情境 |

用例測試使用真的 `Processes` 與 Tauri 的 mock runtime，元件行程與事件依實際的先後發生。

## 2 前後端分工

### 2.1 資料所有權

| Rust 擁有 | Webview 擁有 |
|---|---|
| 專案、目前資源、段落、譯文 | 畫面上顯示的內容，每次都向 Rust 取得 |
| 設定檔、備份、翻譯詞彙表 | modal 開關、勾選的段落、目前段落、捲動位置、預覽收起 |
| 元件行程、進度、失敗原因 | 介面語言、通知、tooltip |

Rust 是唯一的事實來源。Webview 不另外儲存工作資料的副本，所有變更都寫進 Rust，再依事件重讀。

### 2.2 指令（Webview ↔ Rust）

```
controller ─▶ backend/<情境>.ts ─▶ invoke ─▶ <情境>/commands.rs ─▶ 用例／CurrentProject
    ▲                                                                  │
    └──────────────────── 回答，或 Failure ◀──────────────────────────┘
```

| backend 模組 | Rust 模組 | 指令 |
|---|---|---|
| `project.ts` | `project/commands.rs` | 開啟、選擇、編輯、段落變更、復原與重做、匯出、版本、詞彙表 |
| `transcription.ts` | `transcription/commands.rs` | `transcribe` |
| `translation.ts` | `translation/commands.rs` | `translate`、翻譯設定 |
| `toolchain.ts` | `toolchain/commands.rs` | 元件狀態與指定、模型設定 |
| `waveform.ts` | `waveform/commands.rs` | `extract_waveform` |

指令名稱與參數以 `.spec/contract/commands.md` 為準。

### 2.3 事件（Rust → Webview）

| 事件 | 送出者 | 接收者 |
|---|---|---|
| `project-changed` | 改變專案的指令與用例；webview 也會以 `refreshProject` 要求重讀 | `backend/project.ts` 的 `followProject`，再呼叫 `current_project` |
| `pipeline-progress` | 用例經由 `Progress` 回報 Phase 與百分比 | `backend/progress.ts` 的 `listenProgress` |
| `edit-command` | macOS 編輯選單的復原與重做（`menu.rs`） | `backend/project.ts` 的 `followEditCommands` |

事件只說「有變化」或「到哪一步」，不帶工作資料；畫面要顯示的內容一律再用指令向 Rust 取得。

### 2.4 錯誤與通知

```
領域的錯誤 ─┐  SrtError、SegmentChangeError、ProjectError、GlossaryError、ModelError
函式庫的錯誤 ┼─From─▶ Failure { code, … } ──serde──▶ backend/failure.ts（型別）
             │        （failure.rs，應用層）                  │
             │                        ui/failure.ts（依 code 產生訊息）◀┘
             │                                                │
             │                        ui/notification.ts（toast）◀┘
```

`Failure` 只帶錯誤碼與資料，文字由 webview 依介面語言產生。各情境回傳自己的錯誤，由 `failure.rs` 以 `From` 收攏；reqwest 的錯誤則由 `llama.rs` 轉換。

### 2.5 媒體檔（asset protocol）

```
open_project／open_srt ─▶ asset_protocol_scope().allow_directory(專案目錄)
controller ─▶ convertFileSrc(media) ─▶ <video>／<audio> 直接讀檔
```

| 規則 | 做法 |
|---|---|
| 讀取者 | webview 的媒體元素 |
| 範圍 | 開啟過的專案目錄 |
| 子目錄 | 不含 |
| 路徑來源 | `ProjectView.media` |

影片要能拖動與串流，透過指令傳送整個檔案不可行，所以媒體檔是 webview 唯一直接讀取的資料。路徑仍由 Rust 給出，範圍只含開啟過的專案目錄。

## 3 Rust 端

### 3.1 分層與相依規則

| 層 | 可以依賴 | 不可以依賴 |
|---|---|---|
| 領域 | 標準函式庫、serde、同情境與字幕核心的領域 | `Failure`、Tauri、檔案系統、行程、HTTP |
| 應用 | 領域、Port | Tauri、`AppHandle` |
| 轉接 | 應用的 Port、領域 | 其他情境的轉接 |
| 介面 | 應用、轉接的設定讀取 | 直接操作專案目錄或行程 |

| 例外 | 原因 |
|---|---|
| 專案的用例直接呼叫 `project/files.rs` | 目錄是事實來源，只有一種儲存方式；測試用暫存目錄 |
| 尋找元件直接呼叫 `toolchain/detection.rs` | 偵測就是執行元件；測試用 shell 腳本 |
| 翻譯用例直接使用 `llama.rs` 的 `TranslationModel` | 只有一個實作；測試讓真的用戶端連上 `fake_llama` |
| 轉錄用例自行處理暫存工作目錄 | 目錄裡只有元件的中間檔，不屬於專案 |
| `project/glossary.rs` 同時是規則與 csv 讀寫 | 詞彙表的格式就是它的規則 |
| `progress.rs` 與 `Progress` 放在同一檔的 `AppHandle` 實作 | 實作只有發出兩個事件，與 Port 一起讀最清楚 |
| `failure.rs` 把 `tauri::Error` 轉成 `Failure` | 指令取得路徑或狀態時的錯誤由它統一轉換 |
| 轉錄指令請常駐 llama-server 釋放模型 | 一次只載入一個模型（design 6.4） |

### 3.2 情境

```
   ┌──────── 字幕（共用核心）────────┐
   │ transcript、segment_change、    │
   │ language                        │
   └───▲──────────▲───────────▲──────┘
       │          │           │
  ┌────┴───┐ ┌────┴─────┐ ┌───┴──────────┐
  │ 專案    │ │ 翻譯      │ │ 工具鏈        │
  │ project │ │translation│ │ toolchain     │
  └────────┘ └──────────┘ └──────────────┘
  轉錄（transcription）是「工具鏈 → 字幕」的用例，沒有自己的規則
  波形（waveform）是「工具鏈 → 預覽」的用例，只有取峰值的規則
```

情境之間只經由字幕的型別與 `CurrentProject` 往來，翻譯與轉錄都不直接讀寫專案目錄。

### 3.3 模組

| 檔案 | 層 | 負責 |
|---|---|---|
| `menu.rs` | 轉接 | macOS 編輯選單：復原與重做改由 webview 決定交給誰 |
| `logs.rs` | 轉接 | log 寫入的目錄：軟體設定裡選的，或系統的 log 目錄；啟動時決定 |
| `transcript.rs`、`segment_change.rs`、`language.rs` | 領域 | Segment、Transcript、SRT、段落變更、語言 |
| `project.rs` | 領域 | Project 聚合、雙語順序、編輯要寫回哪些字幕 |
| `project/versions.rs` | 領域 | 逐 cue 比較兩個版本 |
| `project/history.rs` | 領域 | 每個資源的復原紀錄：改動前的字幕快照，最多 100 步 |
| `project/current.rs` | 應用 | `CurrentProject` 與開啟、編輯、寫回、還原 |
| `project/files.rs` | 轉接 | 檔名、配對、摘要、專案設定、備份、字幕快照的讀寫 |
| `translation.rs`、`translation/{batching,repair,speaker_labels}.rs` | 應用、領域 | 翻譯用例、分批、修復、說話者標籤 |
| `translation/prompt.rs` | 領域 | 請求內容與回答格式 |
| `translation/{llama,settings}.rs` | 轉接 | llama-server、翻譯設定檔 |
| `translation/resident.rs` | 轉接 | 常駐的 llama-server |
| `transcription.rs`、`transcription/whisper.rs` | 應用、轉接 | 轉錄用例；ffmpeg 與 whisper-cli 的參數與輸出 |
| `waveform.rs` | 應用、領域 | 波形用例：ffmpeg 轉成 PCM，每 10 ms 取一個峰值 |
| `toolchain.rs`、`toolchain/{detection,settings}.rs` | 應用、轉接 | 尋找元件、模型設定；偵測、設定檔 |
| `progress.rs`、`steps.rs`、`timing.rs`、`failure.rs` | 應用 | Port、執行一個 Step、`ModeLock` 與取消、Phase 計時、錯誤碼 |
| `steps/commands.rs` | 介面 | `cancel_task`、可取消地執行任務 |
| `processes.rs` | 轉接 | 子行程的啟動、紀錄與清理，以及 `AppPorts` |
| `*/commands.rs`、`window.rs`、`lib.rs` | 介面 | 指令、視窗大小、組裝 |

### 3.4 Port 與轉接

| Port | 用例怎麼用 | Tauri 實作 | 測試 |
|---|---|---|---|
| `Progress` | 回報 Phase、百分比、專案已變更 | `AppHandle` 發出事件；`AppPorts` 轉交 | mock app 監聽事件 |
| `Steps` | 啟動元件、逐行讀輸出、停止 | `AppPorts` 經由 `Processes` 與 shell plugin | 以 shell 腳本假裝元件 |

介面以 `.spec/contract/ports.md` 為準。只有這兩個 trait，讓用例不依賴 Tauri；其餘協作直接呼叫函式，例外列在 3.1。

### 3.5 生命週期

```
啟動
  │ reap_strays        清掉上次留下的元件行程（processes.json）
  │ manage             Processes、CurrentProject
  │ size_first_window  第一次開啟佔螢幕 80%，之後由 window-state 還原
  ▼
視窗取得焦點 ─▶ read_again_if_changed ─▶ 字幕被外部修改就重讀並送出 project-changed
  ▼
結束 ─▶ kill_all       結束仍在執行的元件行程
```

每個指令各自向 Tauri 取得 `CurrentProject` 或 `Processes`，沒有全域變數。

### 3.6 目前專案

```
CurrentProject(Mutex<HeldProject>)
  └─ HeldProject { generation, project: Option<Project>, mode_hold }
       replace／select 時 generation + 1
       用例結束時 write_if_current(generation)：資源已換就不寫入畫面
       Project.undo_histories：每個資源一份復原紀錄（project/history.rs）
```

| 保護 | 做法 |
|---|---|
| 同時存取 | 一把 Mutex，每次操作都很短，不在鎖內等待元件 |
| 任務跨越切換資源 | 用例記下 generation，寫回畫面前比對 |
| 外部修改 | 讀寫後記下字幕的摘要，編輯前比對，不同就拒絕並重讀，並清掉該資源的復原紀錄 |
| 任務寫入中 | 用例開始時以 `hold_resource` 記下 `mode_hold`，結束時放開；改動前比對，碰到任務寫入的字幕就拒絕為 `mode-running` |
| 復原 | 每次改動前記下資源所有字幕的內容，改動後有差才留下；復原與重做換回那份內容並重讀 |

### 3.7 任務

```
transcribe 指令                       translate 指令
  │ transcription_target               │ snapshot、讀取詞彙表
  │ 釋放常駐 llama-server 的模型        │ 常駐 router 載入模型（關掉常駐時啟動單一模型的行程）
  │ Steps：ffmpeg 轉成 WAV              │ 等待載入完成
  │ Steps：whisper-cli，段落逐行出現    │ 分批翻譯 ─▶ show_translations、mark_pending_batch ＋ project-changed
  │   └─ push_segment ＋ project-changed│ 保留 N 秒後釋放（或停止行程）
  │ write_transcription（備份、寫檔）   │
  ▼                                    ▼ write_translations（備份、寫檔）
回答各 Phase 耗時                      回答各 Phase 耗時
```

| 規則 | 做法 |
|---|---|
| 一次一個 | 先取得 `ModeLock` |
| 取消 | `cancel_task` 經 `ModeLock` |
| 取消後 | 結束任務啟動的行程 |
| 取波形 | 不是任務，不取鎖 |

轉錄、翻譯與關掉常駐 llama-server 都先取得 `ModeLock`，後來的等前一個結束。取消時 `run_cancellable` 丟下任務，常駐 llama-server 不受影響。每個 Phase 開始時經由 `Progress` 送出 `pipeline-progress`。

### 3.8 行程

| 時機 | `Processes` 做什麼 |
|---|---|
| 啟動元件 | 以絕對路徑經 shell plugin 啟動，把 PID 與名稱寫進 `processes.json` |
| 元件輸出 | 每行寫進 log，結束狀態排在所有輸出之後才送出 |
| 元件結束 | 從紀錄移除 |
| 常駐 router | App 啟動後在背景啟動，常駐關掉時停止；它開的模型行程由 router 管理 |
| App 結束 | `kill_all`，連同 router 開的模型行程 |
| 下次啟動 | `reap_strays` 只結束 PID 與名稱都相符的行程 |

介面以 `.spec/contract/processes.md` 為準。

### 3.9 元件解析

```
使用者指定（components.json 設定檔）
   └ 沒有 ─▶ 偵測：vendor/（debug）、PATH、套件管理器的目錄
               └ 沒有 ─▶ 內建變體，依 Build Manifest 的順序取第一個能執行的
                           └ 都不行 ─▶ 未就緒，附上安裝方式
```

偵測會執行元件的版本旗標，所以放在 tokio 的 blocking pool，視窗不會停住。每次找到都記錄來源與耗時。

## 4 Webview

### 4.1 分層

```
index.html（data-controller、data-action）
   │
controllers/  讀寫 DOM；彼此只經 outlet 與 Stimulus 事件協作
   │     ├──────────▶ ui/     通知、錯誤訊息、進度文字、時間、選單
   │     └──────────▶ editor/ 編輯欄位：值、游標位置、Highlight；不依賴框架
   ▼
backend/      唯一碰 Tauri API 的地方：指令、事件、系統對話方塊、系統語系
```

Controller 之間不 import 彼此的函式，只 import outlet 的型別。對應 Rust 的型別只定義在 `backend/`。

| 選擇 | 原因 |
|---|---|
| 畫面維持單一 `index.html` | 拆檔要加 plugin |
| 不改成 custom element | 翻譯與圖示靠靜態掃描 |

頁面 markup 都在 `index.html`，i18n 與 Lucide 圖示在啟動時掃描整頁。拆成片段或 custom element 會讓掃描改在執行期進行，目前的規模還不值得。

### 4.2 Controller

| Controller | 畫面區域 |
|---|---|
| `project`、`transcript`、`segment-changes`、`dialog` | 整頁：資源清單、字幕編輯、段落變更、設定 modal |
| `speakers` | 每段的說話者選單與設定說話者 modal：列出全部名稱、寫回、提議加入詞彙表 |
| `comparison` | 字幕編輯的對照：原文與譯文各自比較一份備份並標在各自欄位、插入已刪除的段落、疊上其他譯文、單句還原 |
| `transcribe`、`translate`、`translation-options` | 轉錄與翻譯的任務 modal |
| `preview` | 預覽：播放器、整段播放、疊字、收起 |
| `timeline` | 預覽的時間軸：波形、段落區段、縮放 |
| `progress` | 標題列的任務進度徽章 |
| `versions`、`glossary` | 版本與詞彙表 modal |
| `components`、`models`、`translation-settings`、`logs` | 設定頁 |
| `tooltip` | 全頁共用的 tooltip |
| `notification` | 每則通知的倒數、暫停與按鈕 |
| `undo` | 全頁的復原與重做：欄位裡交給欄位自己，其餘交給 Rust |
| `field` | 每個編輯欄位一個：接上 `editor/`，離開時以事件交出新的文字 |

畫面配置見 `docs/ui.md`。controller 之間以事件或 outlet 往來，目前段落只由 webview 持有。`preview` 與 `timeline` 掛在同一個元素，各以自己的 target 共用同一個 `<video>`。

| 事件或 outlet | 送出者 | 接收者與用途 |
|---|---|---|
| `progress:task` | `progress` | 字幕編輯顯示 skeleton |
| `project:select` | `project` | 字幕編輯顯示 skeleton |
| `transcript:shown` | 字幕編輯 | `comparison` 重新標記；`speakers` 取得名稱 |
| `versions` outlet | `comparison` | 開啟版本 dialog |
| `versions:compare-with` | `versions` | `comparison` 換對照 |
| `transcript:current` | 字幕編輯 | 時間軸標出目前段落 |
| `timeline:current` | 時間軸 | 字幕編輯標出目前段落 |
| `preview:playing` | `preview` | 字幕編輯標出播放中 |
| `translation-options:overwrite` | `translation-options` | 翻譯 modal 改開始鈕文字 |
| `segment-changes:speakers` | `segment-changes` | `speakers` 為選取的段落開設定說話者 |

### 4.3 backend

| 模組 | 內容 |
|---|---|
| `project.ts` | 專案、版本、詞彙表的指令與型別；`followProject`、`refreshProject` |
| `transcription.ts`、`translation.ts` | 任務指令、翻譯選項與設定的型別 |
| `toolchain.ts` | 元件與模型的指令與型別 |
| `logs.ts` | log 目錄的指令與型別 |
| `progress.ts` | `pipeline-progress` 與 Phase 耗時的型別 |
| `failure.ts` | `Failure` 型別 |
| `dialog.ts`、`system.ts` | 檔案與訊息的系統對話方塊、系統語系 |

### 4.4 共用模組

| 模組 | 內容 |
|---|---|
| `ui/notification.ts` | 產生 toast 通知，互動交給 `notification` |
| `ui/failure.ts` | 依錯誤碼產生介面語言的訊息 |
| `ui/progress.ts` | 進度文字與各 Phase 耗時的列 |
| `ui/time.ts`、`ui/menu.ts` | 時間格式、關閉工具列選單 |
| `ui/icons.ts` | 介面用到的 Lucide 圖示：只打包列出的幾個，markup 以 `data-lucide` 標出，程式以 `iconElement` 建立 |
| `i18n.ts`、`locales/` | 介面語言與翻譯字串 |
| `editor/` | 編輯欄位的基礎：純文字的值、游標位置、以 CSS Custom Highlight 標記範圍；不 import Stimulus 與 Tauri |

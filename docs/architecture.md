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
| `components.json` | 原始程式碼釘版、變體順序 |
| `src-tauri/tauri.bundle.conf.json` | 打包時把 `vendor/` 放進資源的 `components/` |
| CI 的 cargo-about | 產生 `THIRD-PARTY-LICENSES.html`，隨建置提供 |
| CI 的 `scripts/webview-licenses.ts` | 檢查 webview 套件授權並產生 `THIRD-PARTY-LICENSES-WEBVIEW.html` |

App 依 `components.json` 列出的順序，使用第一個能執行的內建變體。

### 1.3 原始程式碼配置

```
.
├─ src/                   Webview（第 4 章）
│  ├─ main.ts             啟動，呼叫 assembly.ts 組裝（4.3）
│  ├─ backend/            Rust 的唯一入口
│  ├─ controllers/        Stimulus controller 與它們的測試
│  ├─ editor/             編輯核心，不依賴 editor/ 以外（4.5）
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
| Rust 用例與規則 | `cargo test`，測試寫在程式旁的 `mod tests` | mock app、假元件、`fake_llama` |
| 真的元件 | `cargo test -- --ignored`，需要模型與媒體檔 | 無 |
| Webview | `pnpm test`（Vitest、happy-dom），測試放在 controller 與 `editor/` 的程式旁 | `mockIPC` 代替 Rust；`editor/` 以假的 port 測試 |
| 規格 | `sumi verify` | 測試以 `@behavior` 宣告實作的情境 |

用例測試使用真的 `Processes` 與 Tauri 的 mock runtime，元件行程與事件依實際的先後發生。mock app 建出 `AppPorts`，shell 腳本假裝元件，`fake_llama` 假裝 llama-server。

## 2 前後端分工

### 2.1 資料所有權

| Rust 擁有 | Webview 擁有 |
|---|---|
| 專案、目前資源、段落、譯文 | 畫面上顯示的內容，每次都向 Rust 取得 |
| 設定檔、備份、翻譯詞彙表 | modal、勾選、目前段落、Cursor |
| 元件行程、進度、失敗原因 | 介面語言、通知、tooltip |

字幕檔是事實來源，Rust 是唯一的寫入者（3.6）。Webview 不另外儲存工作資料的副本，所有變更都寫進 Rust，再依事件重讀。

### 2.2 指令（Webview ↔ Rust）

```
controller ─▶ backend/<情境>.ts ─▶ invoke ─▶ <情境>/commands.rs ─▶ 用例／CurrentProject
    │    ▲                                                             │
    │    └─────────────── 回答，或 Failure ◀──────────────────────────┘
    └─▶ editor/ session ─▶ backend/editing.ts ─▶ invoke             編輯只走這條
```

| backend 模組 | Rust 模組 | 指令 |
|---|---|---|
| `project.ts` | `project/commands.rs` | 專案、版本、詞彙表 |
| `editing.ts` | `project/commands.rs` | 編輯、取代、段落改動、復原 |
| `transcription.ts` | `transcription/commands.rs` | `transcribe` |
| `translation.ts` | `translation/commands.rs` | `translate`、`retranslate`、翻譯設定 |
| `toolchain.ts` | `toolchain/commands.rs` | 元件狀態與指定、模型設定 |
| `waveform.ts` | `waveform/commands.rs` | `extract_waveform` |

指令名稱與參數以 `.spec/contract/commands.md` 為準。

### 2.3 事件（Rust → Webview）

| 事件 | 送出者 | 接收者 |
|---|---|---|
| `project-changed` | 改變專案的指令 | `ProjectFeed` |
| 進度 | 用例經 `Progress` | `listenProgress` |
| 復原、重做、全選 | macOS 編輯選單 | 復原與勾選的處理 |
| 外部修改已留存 | 重新載入 | 專案的通知 |

事件只說有變化或到哪一步，不帶資料，內容再用指令取得。進度事件是 `pipeline-progress`；復原、重做與全選是 `menu.rs` 送出的 `edit-command`，給 `followEditCommands`；外部修改已留存是 `changed-elsewhere-kept`。

### 2.4 錯誤與通知

```
領域的錯誤 ─┐  SrtError、SegmentChangeError、ReplacementError、ProjectError、GlossaryError、ModelError
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
| 領域 | 標準函式庫、serde、regex、字幕核心 | `Failure`、Tauri、檔案系統、行程、HTTP |
| 應用 | 領域、Port | Tauri、`AppHandle` |
| 轉接 | 應用的 Port、領域 | 其他情境的轉接 |
| 介面 | 應用、轉接的設定讀取 | 直接操作專案目錄或行程 |

| 例外 | 原因 |
|---|---|
| 專案的用例直接呼叫 `project/files.rs` | 目錄是唯一的儲存 |
| 尋找元件直接呼叫 `toolchain/detection.rs` | 偵測就是執行元件；測試用 shell 腳本 |
| 翻譯用例直接使用 `llama.rs` 的 `TranslationModel` | 只有一個實作 |
| 轉錄用例自行處理暫存工作目錄 | 只放中間檔，不屬於專案 |
| `project/glossary.rs` 同時是規則與 csv 讀寫 | 詞彙表的格式就是它的規則 |
| `progress.rs` 與 `Progress` 放在同一檔的 `AppHandle` 實作 | 只發兩個事件，放一起最清楚 |
| `failure.rs` 把 `tauri::Error` 轉成 `Failure` | 統一轉換指令的錯誤 |
| 轉錄指令請常駐 llama-server 釋放模型 | 一次只載入一個模型（design 6.4） |

### 3.2 情境

```
   ┌──────── 字幕（共用核心）────────┐
   │ transcript、segment_change、    │
   │ replacement、language           │
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

| 目錄 | 模組 | 層 | 負責 |
|---|---|---|---|
| — | `lib` | 介面 | 組裝 |
| — | `window` | 介面 | 視窗大小 |
| — | `menu` | 轉接 | macOS 復原與重做 |
| — | `logs` | 轉接 | 決定 log 目錄 |
| — | `transcript` | 領域 | 段落與 SRT |
| — | `segment_change` | 領域 | 段落變更 |
| — | `replacement` | 領域 | 搜尋取代 |
| — | `language` | 領域 | 語言代碼 |
| — | `project` | 領域 | 專案聚合、寫回 |
| `project/` | `versions` | 領域 | 逐 cue 比較版本 |
| `project/` | `history` | 領域 | 資源的復原紀錄 |
| `project/` | `glossary` | 領域、轉接 | 詞彙表與 CSV |
| `project/` | `current` | 應用 | 開啟、編輯、重新載入 |
| `project/` | `files` | 轉接 | 檔名、配對、備份 |
| — | `translation` | 應用 | 翻譯用例 |
| `translation/` | `batching` | 領域 | 分批 |
| `translation/` | `speaker_labels` | 領域 | 說話者標籤 |
| `translation/` | `prompt` | 領域 | 請求與回答格式 |
| `translation/` | `repair` | 應用 | 修復與自我檢查 |
| `translation/` | `llama` | 轉接 | llama-server |
| `translation/` | `settings` | 轉接 | 翻譯設定檔 |
| `translation/` | `resident` | 轉接 | 常駐 llama-server |
| — | `transcription` | 應用 | 轉錄用例 |
| `transcription/` | `whisper` | 轉接 | whisper-cli 參數 |
| `transcription/` | `settings` | 轉接 | 轉錄設定檔 |
| — | `waveform` | 應用、領域 | 波形與峰值 |
| — | `toolchain` | 應用 | 尋找元件 |
| `toolchain/` | `detection` | 轉接 | 偵測已安裝的元件 |
| `toolchain/` | `settings` | 轉接 | 元件設定檔 |
| — | `progress` | 應用 | 回報進度的 Port |
| — | `steps` | 應用 | Step 與 `ModeRun` |
| — | `timing` | 應用 | Phase 計時 |
| — | `failure` | 應用 | 錯誤碼 |
| — | `processes` | 轉接 | 子行程與 `AppPorts` |

目錄以 `src-tauri/src/` 為根，— 是根目錄，模組省略 `.rs`。各目錄的 `commands` 是介面層的指令，不另列。波形以 ffmpeg 轉成 PCM，每 10 ms 取一個峰值。

### 3.4 Port 與轉接

| Port | 用例怎麼用 | Tauri 實作 | 測試 |
|---|---|---|---|
| `Progress` | 回報 Phase、百分比、專案已變更 | `AppHandle` 發出事件；`AppPorts` 轉交 | mock app 監聽事件 |
| `Steps` | 啟動元件、逐行讀輸出、停止 | `AppPorts` 經由 `Processes` 與 shell plugin | 以 shell 腳本假裝元件 |

介面以 `.spec/contract/ports.md` 為準。只有這兩個 trait，讓用例不依賴 Tauri；其餘協作直接呼叫函式，例外列在 3.1。`AppPorts` 記下它啟動的 PID，取消時只停這些。

### 3.5 生命週期

```
啟動
  │ reap_strays        清掉上次留下的元件行程（processes.json）
  │ manage             Processes、CurrentProject
  │ size_first_window  第一次開啟佔螢幕 80%，之後由 window-state 還原
  ▼
視窗取得焦點 ─▶ reload_if_changed ─▶ 清單或字幕被外部修改就重新載入並送出 project-changed
  ▼
結束 ─▶ kill_all       結束仍在執行的元件行程
```

`run()` 是唯一的組裝點：`manage` 的物件由指令以 `State` 參數注入，沒有全域變數。

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

記憶體裡的目前資源只是檔案讀出的樣子，只在讀檔與寫檔後更新，所以記下的內容相同就代表兩者一致。任務進度疊在 `view()` 上，任務結束就丟掉，不會被當成字幕寫回。

### 3.7 寫入者

```
 使用者（指令）              任務（ModeRun）              外部程式
  編輯、說話者、取代           轉錄 ─▶ 原文                  任何字幕
  段落變更、復原、重做         翻譯 ─▶ 那份譯文                 │
  還原、逐句取回               重譯 ─▶ 選中段的譯文             │
       │ 每次一個指令              │ 進度只進 mode_hold           │
       │ 鎖內寫完                  │ 結束時一次取鎖寫完           │
       ▼                           ▼                              ▼
 ┌──────────────────────── 字幕檔（基準）─────────────────────────┐
 └────── .tsuzuri/history/：被取代而還沒有備份的版本 ─────────────┘
```

| 寫入者 | 時機 | 寫入 |
|---|---|---|
| 編輯、說話者、取代 | 使用者改動 | 那份字幕 |
| 段落變更 | 使用者改動 | 原文與每份譯文 |
| 復原、重做 | 使用者改動 | 資源的所有字幕 |
| 還原、逐句取回 | 使用者改動 | 那份字幕 |
| 轉錄 | 任務結束 | 原文與譯文的說話者 |
| 翻譯 | 任務結束 | 整份譯文 |
| 重譯 | 任務結束 | 選中段的譯文 |
| 外部程式 | 任何時候 | 任何字幕 |

雙語 SRT 由字幕產生，跟著寫入更新，不算寫入者。Rust 只在這些時機寫字幕；切換顯示的譯文、重新載入與任務進度都只讀。

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

任務收尾也在一次取鎖內寫完：外部改過就兩邊都留，覆蓋前備份照專案選項每次或每次開啟留一份，寫出後再留產出備份。

### 3.9 任務中的字幕

| 任務 | 拒絕的改動 |
|---|---|
| 轉錄 | 資源的所有改動 |
| 翻譯 | 那份譯文與段落 |
| 重譯 | 選中段的譯文與段落 |
| 任一任務 | 切換顯示的譯文 |

`mode_hold` 記下任務寫的資源、語言與段落，拒絕的改動答 `mode-running`。改段落、說話者、復原與還原會重寫整份字幕，任務中一律拒絕。重譯結束時只把選中段合併進當下的檔案。

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
transcribe 指令                       translate 指令
  │ transcription_target               │ snapshot、讀取詞彙表
  │ 釋放常駐 llama-server 的模型        │ 常駐 router 載入模型（關掉常駐時啟動單一模型的行程）
  │ Steps：ffmpeg 轉成 WAV              │ 等待載入完成
  │ Steps：whisper-cli，段落逐行出現    │ 分批翻譯 ─▶ show_translations、mark_pending_batch ＋ project-changed
  │   └─ push_segment ＋ project-changed│ 保留 N 秒後釋放（或停止行程）
  │ write_transcription（一次取鎖寫完） │
  ▼                                    ▼ write_translations（一次取鎖寫完）
ModeRun 結束：放開 hold、丟掉進度 ＋ project-changed
回答各 Phase 耗時                      回答各 Phase 耗時
```

| 規則 | 做法 |
|---|---|
| 一次一個 | `ModeLock::begin` |
| 取消 | `cancel_task` 經 `ModeLock` |
| 取消後 | 只結束它啟動的行程 |
| 取波形 | 不是任務，不取鎖 |

轉錄與翻譯以 `ModeLock::begin` 開始一個 `ModeRun`，關掉常駐 llama-server 也先取得 `ModeLock`，後來的等前一個結束。取消時 `ModeRun` 丟下任務，只結束經它啟動的行程。每個 Phase 開始時經由 `Progress` 送出 `pipeline-progress`。

### 3.12 行程

| 時機 | `Processes` 做什麼 |
|---|---|
| 啟動元件 | 以絕對路徑啟動，PID 與名稱寫進 `processes.json` |
| 元件輸出 | 每行寫進 log，最後才送出結束 |
| 元件結束 | 從紀錄移除 |
| 常駐 router | 背景啟動，關掉常駐時停止 |
| App 結束 | `kill_all`，連同 router 開的模型行程 |
| 下次啟動 | `reap_strays` 只結束 PID 與名稱都相符的行程 |

元件一律經 shell plugin 啟動。介面以 `.spec/contract/processes.md` 為準。

### 3.13 元件解析

```
使用者指定（components.json 設定檔）
   └ 沒有 ─▶ 偵測：vendor/（debug）、PATH、套件管理器的目錄
               └ 沒有 ─▶ 內建變體，依 Build Manifest 的順序取第一個能執行的
                           └ 都不行 ─▶ 未就緒，附上安裝方式
```

偵測會執行元件的版本旗標，所以放在 tokio 的 blocking pool，視窗不會停住。每次找到都記錄來源與耗時。

### 3.14 模式

```
lib.rs run() ── manage ──▶ Processes · CurrentProject · ResidentLlama · ModeLock
                               │ 指令以 State<'_, T> 注入
                               ▼
command ── ModeLock::begin(AppPorts::new(..)) ──▶ ModeRun：執行權、ports、keep
                                                     │ &ModeRun
                                                     ▼
                                                  用例（只看得到 Port）
```

| 模式 | 何時用 | 範例 |
|---|---|---|
| Composition Root | 組裝 app 範圍物件 | `lib.rs` |
| 注入 State | 指令取得依賴 | `project/commands.rs` |
| Mode Run | 任務範圍的狀態 | `transcription/commands.rs` |

任務範圍的東西（取消、它啟動的行程、資源的 hold）由 `ModeRun` 擁有，不寄放在 app 範圍的物件上。design 6.4 的狀態機動工時重新檢討：Phases 與狀態應一起收進 `ModeRun`。

## 4 Webview

### 4.1 分層

```
index.html                    data-controller、data-action
    |
controllers/ ---------------> ui/、backend/（編輯以外）
    |                         介面：DOM 事件轉成用例，變化轉成畫面
    v
editor/  session.ts           應用：Cursor、Checked Segments、用例、port
         cursor.ts, rules.ts   領域：狀態機與規則
         field.ts, marks.ts    DOM：欄位換算、畫出 Cursor
    ^
    | 實作 EditingPort
backend/editing.ts            閘道：唯一呼叫編輯指令的地方
```

依賴一律往內，和 Rust 端（3.1）同一套規則：介面呼叫應用，應用使用領域，閘道實作應用宣告的 port。`main.ts` 是組裝點（4.3）。

| 選擇 | 原因 |
|---|---|
| 畫面維持單一 `index.html` | 拆檔要加 plugin |
| 不改成 custom element | 翻譯與圖示靠靜態掃描 |

頁面 markup 都在 `index.html`，i18n 與 Lucide 圖示在啟動時掃描整頁。拆成片段或 custom element 會讓掃描改在執行期進行，目前的規模還不值得。

### 4.2 相依規則

| 層 | 可以依賴 | 不可以依賴 |
|---|---|---|
| `editor/` | DOM | `editor/` 以外的模組 |
| `backend/` | Tauri、`editor/` 的 port | controller |
| controller | `editor/index.ts`、`ui/`、`backend/` | 編輯指令、其他 controller |
| `ui/` | i18n、`editor/` 與 `backend/` 的型別 | controller |
| `main.ts` | 全部 | — |

Controller 之間只 import outlet 的型別，編輯一律經過 session。對應 Rust 的型別只定義在 `backend/`；`editor/` 有自己的型別，由 `backend/editing.ts` 換算，同名的型別在那裡以別名區分。

### 4.3 組裝

```
main.ts -> assemble(application, controllers)      assembly.ts
  |-- feed = new ProjectFeed()        每次變更讀一次 current_project
  |-- session = new EditingSession(editingPort)
  |-- feed -> session.follow -> 各 controller -> session.announce
  |-- session.onChange -> window 的 editor:cursor、editor:choice、editor:checks
  +-- application.register(名稱, class extends X { session, feed })
```

| 模式 | 何時用 | 範例 |
|---|---|---|
| Composition Root | 組裝 app 範圍物件 | `assembly.ts` |
| 註冊時注入 | controller 取得依賴 | `class extends` |
| 專案訂閱 | 分送同一份專案 | `ProjectFeed` |

Stimulus 自己建立 controller，所以依賴放在註冊的子類別上。測試也呼叫 `assemble`，替身只換 IPC，組裝與 App 相同。沒有 controller 自己向 Rust 讀專案。

### 4.4 先後順序

| 步驟 | 內容 |
|---|---|
| 1 | 送出改動前先記下待套用 |
| 2 | 讀到的專案比上一份舊就丟掉 |
| 3 | session 換算並套用待套用 |
| 4 | 各 controller 依專案重畫 |
| 5 | 送出 `editor:cursor`，移動焦點 |

`project-changed` 可能比指令的回答先到，所以待套用在送出前就記下，被拒絕時清掉。焦點與 Cursor 等列畫完才動，才不會落在即將被取代的舊列上。

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
| `project`、`transcript`、`segment-changes`、`dialog` | 資源清單、字幕編輯、設定 |
| `speakers` | 說話者選單與設定 modal |
| `replacement` | 搜尋取代 modal |
| `retranslation` | 重新翻譯一段或 Checked Segments |
| `comparison` | 對照備份、參照譯文、單句還原 |
| `transcribe`、`translate`、`translation-options` | 轉錄與翻譯的任務 modal |
| `preview` | 播放器、疊字、收起 |
| `timeline` | 波形、段落區段、縮放 |
| `progress` | 標題列的任務進度徽章 |
| `versions`、`glossary` | 版本與詞彙表 modal |
| `components`、`models`、`translation-settings`、`logs` | 設定頁 |
| `tooltip` | 全頁共用的 tooltip |
| `notification` | 每則通知的倒數、暫停與按鈕 |
| `undo` | 全頁的復原與重做 |
| `field` | 每個編輯欄位接上 session |

畫面配置見 `docs/ui.md`。controller 不保存編輯狀態，互動與勾選都經過 session。`preview` 與 `timeline` 掛在同一個元素，共用 `<video>`；跟隨播放鈕在預覽卡片，屬於捲動清單的 `transcript`。

| 事件或 outlet | 送出者 | 接收者與用途 |
|---|---|---|
| `progress:task` | `progress` | 字幕編輯顯示 skeleton |
| `project:select` | `project` | 字幕編輯顯示 skeleton |
| `transcript:shown` | 字幕編輯 | `comparison` 重新標記；`speakers` 取得名稱 |
| `versions` outlet | `comparison` | 開啟版本 dialog |
| `versions:compare-with` | `versions` | `comparison` 換對照 |
| `editor:cursor` | session，經 `assembly.ts` | 標出 Current Segment 與 Cursor |
| `editor:choice` | session，經 `assembly.ts` | `timeline` 暫停在選的段落 |
| `editor:checks` | session，經 `assembly.ts` | 顯示勾選工具列 |
| `preview:playing` | `preview` | 字幕編輯標出播放中，跟隨時捲動 |
| `translation-options:overwrite` | `translation-options` | 翻譯 modal 改開始鈕文字 |
| `segment-changes:speakers` | `segment-changes` | `speakers` 為 Checked Segments 開設定 |
| `segment-changes:retranslate` | `segment-changes` | `retranslation` 重新翻譯 Checked Segments |

### 4.7 backend

| 模組 | 內容 |
|---|---|
| `project.ts` | 專案、版本、詞彙表的指令與訂閱 |
| `editing.ts` | 實作 `editor/` 的 port |
| `transcription.ts`、`translation.ts` | 任務與設定的指令、型別 |
| `toolchain.ts` | 元件與模型的指令與型別 |
| `logs.ts` | log 目錄的指令與型別 |
| `progress.ts` | `pipeline-progress` 與 Phase 耗時的型別 |
| `failure.ts` | `Failure` 型別 |
| `dialog.ts`、`system.ts` | 系統對話方塊、語系與平台 |

### 4.8 共用模組

| 模組 | 內容 |
|---|---|
| `ui/notification.ts` | 產生 toast 通知，互動交給 `notification` |
| `ui/failure.ts` | 依錯誤碼產生介面語言的訊息 |
| `ui/progress.ts` | 任務種類、進度文字、Phase 耗時 |
| `ui/time.ts`、`ui/menu.ts` | 時間格式、關閉工具列選單 |
| `ui/models.ts` | 各 Model Slot 的副檔名 |
| `ui/choices.ts` | 記在這台電腦的畫面選擇 |
| `ui/icons.ts` | 只打包列出的 Lucide 圖示 |
| `i18n.ts`、`locales/` | 介面語言與翻譯字串 |

圖示要先在 `ui/icons.ts` 列出才會畫出來：markup 以 `data-lucide` 標出，程式以 `iconElement` 建立。

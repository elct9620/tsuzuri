# Tsuzuri 專案慣例

這份文件記錄程式碼與文件共同遵守的慣例，慣例改變時先改這份文件。下表是動手之前該讀的章。

| 要做的事 | 先讀 |
|---|---|
| 寫程式碼、改名 | 第 1 章 命名 |
| 寫或改文件 | 第 2 章 文件 |

## 1 命名

名稱的詞性告訴讀者它是什麼角色。依角色選詞性，不依函式內部做了什麼工作。

```
  它是什麼？ ──► 選詞性 ──► 依語言套用寫法
  （角色）       （1.2）      （1.1）
```

### 1.1 兩種語言的寫法

Rust 與 TypeScript 用同一套詞性規則，只有字的接法不同。下表是兩者的對照。

| 項目 | Rust | TypeScript |
|---|---|---|
| 函式、變數、欄位 | `snake_case` | `camelCase` |
| 型別、介面 | `UpperCamelCase` | `UpperCamelCase` |
| 檔名 | `snake_case.rs` | `kebab-case.ts` |
| 依鍵尋找 | `path_by_name` | `statusByName` |
| 問句 | `is_file`、`is_empty` | `isRunning`、`hasTranslation` |
| 問號結尾 | 不用 | 不用 |

### 1.2 依角色選詞性

執行外部程式算動作，即使只是讀取結果；僅讀取檔案或記憶體的算查詢。產生給人看的文字是訊息，改變同一個值的表示法是轉換，以 `new`、`try_new`、`with_*`、`from_*`、`into_*`、`to_*`、`as_*` 開頭。

| 角色 | 名稱形式 | Rust 例 | TypeScript 例 |
|---|---|---|---|
| 模組或型別 | 名詞 | `Transcript`、`Resolver` | `ProjectView` |
| 型別的一種（子型別、enum 成員） | 形容詞＋名詞，或名詞 | `RunningProcess`、`Origin::BundledVariant` | `SegmentField` |
| 回答一件事、不改變任何東西 | 該事物的名詞，不加 `get` | `view()`、`ready_path(slot)`、`conversion_args(...)` | `bar()`、`label(phase)` |
| 依鍵尋找 | 名詞＋`by`＋鍵 | `path_by_name` | `statusByName` |
| 問句 | `is`／`has`＋形容詞或名詞 | `is_file` | `isHidden`、`isFailure` |
| 新值或轉換 | 建構或轉換的字首，或動詞＋名詞 | `from_srt`、`to_srt`、`parse_timestamp` | `formatTime` |
| 動作（有副作用） | 動詞開頭，後面可接狀態 | `write_translations`、`probe`、`kill_all` | `notifyFailure`、`drawPage` |
| 建構錯誤或訊息 | 所建構之物的名詞 | — | `failureMessage`、`phasesSummary` |
| 畫面元素（target） | 元素的名詞，不用動作 | — | `startButton`、`emptyHint` |
| 標記元素的 data 屬性 | 狀態用問句，身分用名詞 | — | `data-is-playing`、`data-ghost` |

### 1.3 分詞與 -ing

單獨的分詞藏起了角色，讀者分不出它是查詢、尋找、問句還是動作，區域變數也一樣。接在名詞前後或動詞後的分詞只描述狀態，可以用。測試的 `expected` 與實際值成對，訊息的鍵有命名空間，都不會被誤讀。

| 情況 | 錯誤的名稱 | 角色 | 修正後 |
|---|---|---|---|
| 過去分詞單獨使用 | `translated(...)` | 動作 | `write_translations` |
| 過去分詞單獨使用 | `Held`、`Recorded` | 型別 | `HeldProject`、`RecordedProcess` |
| 現在分詞單獨使用 | `running` | 問句 | `isRunning` |
| 分詞單獨當變數 | `received`、`recorded` | 值 | `progress_events`、`records` |
| 字典列為名詞的 -ing | `setting`、`heading` | 名詞 | 保留 |
| 動詞後的分詞 | `release_queued` | 動作＋狀態 | 保留 |
| 名詞後的分詞，說出該事物的狀態 | `StepFailed`、`ModelNotChosen` | 型別的一種 | 保留 |
| 名詞前的分詞 | `running_router`、`keptSpans` | 值 | 保留 |
| 測試的預期值 | `expected` | 值 | 保留 |
| 訊息的鍵 | `transcribe.failed` | 訊息 | 保留 |

### 1.4 外來名稱

名稱由框架、語言或契約決定時照原樣保留，不套用 1.2。TypeScript 型別若對應某個 Rust 型別，就用同一個名稱。

| 來源 | 名稱 |
|---|---|
| Svelte | Svelte 元件以 `UpperCamelCase` 命名，例如 `Page.svelte` |
| BCP 47 | 語言檔以語言標籤命名，例如 `zh-Hant.ts` |
| Rust trait | `fmt`、`from`、`drop`、`enabled`、`log`、`flush` |
| i18next、Vitest | `t`、`describe`、`it` |
| DOM、Rust 標準函式庫 | `Event` 的 `composed`、`PoisonError` 的 `poisoned` |
| `.spec/contract/commands.md` | Tauri 指令名稱，例如 `component_statuses` |
| serde 序列化的欄位 | TypeScript 介面照 Rust 欄位名，例如 `start_ms` |
| 外部程式的 JSON | 照原樣，例如 llama-server 的 `failed` |
| 對應的 Rust 型別 | `ComponentStatus`、`ProjectView`、`SegmentField` |
| Tauri Specta 的 bindings | `commands.componentStatuses`、`ProjectView_Serialize` |
| 測試 | 描述行為的句子，Rust 與 `it()` 皆同 |

### 1.5 加入名稱之前

先照同模組同類名稱遵守的規則取名，規則不一致就先修正模組。兩個東西同名，只在同一個檔案相遇時才區分。

| 情境 | 做法 |
|---|---|
| 加入新名稱 | 照同模組的同類名稱 |
| 規則不一致 | 先統一模組 |
| 兩個東西同名 | 同檔才區分，否則依角色 |

### 1.6 依據

這些規則以 Rust 與 JavaScript 標準函式庫的慣例為依據。Google TypeScript Style Guide 允許 `getFoo`，本專案不採用，以免查詢與 Rust 那一側的寫法不同；它的 `snake_case` 檔名也不採用，TS 檔名跟著 Svelte。

| 來源 | 佐證的規則 |
|---|---|
| Rust API Guidelines C-GETTER | 查詢是名詞，不加 `get_` |
| Rust API Guidelines C-CONV、C-CTOR | `as_`／`to_`／`into_`；建構用 `new`／`with_`／`from_` |
| JavaScript 標準函式庫 | 查詢用名詞 `Map.prototype.size` |
| JavaScript 標準函式庫 | 問句用 `Array.isArray`、`Number.isNaN` |
| JavaScript 標準函式庫 | 轉換用 `Array.from`、`toISOString` |
| Godot API | 依鍵尋找用 `_by_`，不用 `_named` |
| Svelte 原始碼 | TS 檔名用 `media-query.js` 的 kebab-case |

## 2 文件

規則來自 concise-docs 技能，以它附的 lint 檢查到零錯誤；下表是各類文件要守的小節。

| 文件 | 要守 |
|---|---|
| `docs/` | 2.1～2.4 |
| README、CONTRIBUTING | 2.1～2.4，慣例段落除外 |
| `.spec/` | 2.3、2.4，結構依 sumi |

README 與 CONTRIBUTING 照一般專案的慣例：前言與純指引的段落免表或圖，授權指向 LICENSE，並各有互相連結的英文與正體中文兩份。`.spec/` 的情境與詞彙條目由 sumi 規定格式。

### 2.1 結構

| 規則 | 限制 |
|---|---|
| 章節順序 | 依相依、由大到小、由淺到深 |
| 每節 | 至少一個表、圖或程式碼區塊 |
| 3 步以上的編號清單 | 也算一個圖表 |
| 只有子標題的標題 | 免表或圖 |
| 圖 | ASCII，標籤用英文 |
| 表格 | 至多 4 欄，每格 15 字內 |
| 每節內文 | 100 中文字或 150 英文字內 |

表格用來快速掃過，細節寫進內文；超過上限就依主題拆成小節，不刪事實。中文是雙倍寬，圖裡的中文會對不齊，所以圖用英文標籤，對應的中文寫在圖旁的內文。

### 2.2 寫法

| 規則 | 做法 |
|---|---|
| 敘述 | 正面直述，不先講問題再翻轉 |
| 句子 | 50 中文字或 25 英文詞內 |
| 用詞 | 一個概念一個名稱 |
| 步驟 | 編號清單，一步一個動作 |
| 「詞：說明」清單 | 改寫成兩欄表 |
| 表或圖 | 至少一句說明為何要看 |
| 標題 | 2～3 詞的名詞，不用問句 |
| 粗體 | 約佔內文 5% |

讀者先看標題、再看表或圖、最後看內文，所以標題說出這節是什麼，內文只補表或圖給不了的理由與取捨。長句在理由、條件或例外開始處拆開；步驟的條件寫在動作之前。換一個詞，讀者會以為是另一件事。

### 2.3 算字數

| 內容 | 怎麼算 |
|---|---|
| 中文字 | 各算一個字 |
| 英文單字 | 算一個字 |
| 行內程式碼 | 整段算一個字 |
| 清單項目 | 算進內文 |
| 標點、空格、按鍵組合 | 不算 |

英文單字算一個字，中英文夾雜的段落長度才相近。標點、空格與 `⌘/Ctrl+L` 這類按鍵組合只是寫法，不算字。

### 2.4 用字

| 範圍 | 限制 |
|---|---|
| 內文與介面文字 | `zhtw-mcp lint` 零結果 |
| 表格的翻譯腔警告 | 誤報，不算 |

linter 把整列表格讀成一句，表格的翻譯腔警告因此不算；其他警告仍照改。

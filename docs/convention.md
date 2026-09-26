# Tsuzuri 專案慣例

這份文件記錄程式碼與文件共同遵守的慣例。寫新程式碼或改名之前先讀這裡，慣例改變時先改這份文件。

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
| 動作（有副作用） | 動詞開頭，後面可接狀態 | `write_translations`、`probe`、`kill_all` | `notifyFailure`、`translatePage` |
| 建構錯誤或訊息 | 所建構之物的名詞 | — | `failureMessage`、`phasesSummary` |
| 畫面元素（target） | 元素的名詞，不用動作 | — | `startButton`、`emptyHint` |
| 標記元素的 data 屬性 | 狀態用問句，身分用名詞 | — | `data-is-playing`、`data-ghost` |

### 1.3 分詞與 -ing

單獨的分詞藏起了角色，讀者分不出它是查詢、尋找、問句還是動作。接在動詞或名詞後面的分詞只描述狀態，可以用。

| 情況 | 錯誤的名稱 | 角色 | 修正後 |
|---|---|---|---|
| 過去分詞單獨使用 | `translated(...)` | 動作 | `write_translations` |
| 過去分詞單獨使用 | `Held`、`Recorded` | 型別 | `HeldProject`、`RecordedProcess` |
| 現在分詞單獨使用 | `running` | 問句 | `isRunning` |
| 字典列為名詞的 -ing | `setting`、`heading` | 名詞 | 保留 |
| 動詞後的分詞 | `release_queued` | 動作＋狀態 | 保留 |
| 名詞後的分詞，說出該事物的狀態 | `StepFailed`、`ModelNotChosen` | 型別的一種 | 保留 |

### 1.4 由另一方決定的名稱

名稱由框架、語言或契約決定時照原樣保留，不套用 1.2。TypeScript 型別若對應某個 Rust 型別，就用同一個名稱。

| 來源 | 名稱 |
|---|---|
| Stimulus | `connect`、`disconnect`、`static targets`、`*Target`、`*Targets`、action option 的 `value` |
| Rust trait | `fmt`、`from`、`drop`、`enabled`、`log`、`flush` |
| i18next、Vitest | `t`、`describe`、`it` |
| `.spec/contract/commands.md` | Tauri 指令名稱，例如 `component_statuses` |
| serde 序列化的欄位 | TypeScript 介面照 Rust 欄位名，例如 `start_ms` |
| 外部程式的 JSON | 照原樣，例如 llama-server 的 `failed` |
| 對應的 Rust 型別 | `ComponentStatus`、`ProjectView`、`SegmentField` |
| 測試 | 描述行為的句子，Rust 與 `it()` 皆同 |

### 1.5 加入名稱之前

先照同模組同類名稱遵守的規則取名，規則不一致就先修正模組。兩個東西同名，只在同一個檔案相遇時才區分。Stimulus 為 target 產生 `xTarget`、`xTargets` 與 `hasXTarget`，會蓋掉同名的成員。

| 情境 | 做法 |
|---|---|
| 加入新名稱 | 照同模組的同類名稱 |
| 規則不一致 | 先統一模組 |
| 兩個東西同名 | 同檔才區分，否則依角色 |
| Stimulus target | 不與產生的成員同名 |

### 1.6 依據

這些規則以 Rust 與 JavaScript 標準函式庫的慣例為依據。Google TypeScript Style Guide 允許 `getFoo`，本專案不採用，以免查詢與 Rust 那一側的寫法不同。

| 來源 | 佐證的規則 |
|---|---|
| Rust API Guidelines C-GETTER | 查詢是名詞，不加 `get_` |
| Rust API Guidelines C-CONV、C-CTOR | `as_`／`to_`／`into_`；建構用 `new`／`with_`／`from_` |
| JavaScript 標準函式庫 | 查詢用名詞 `Map.prototype.size` |
| JavaScript 標準函式庫 | 問句用 `Array.isArray`、`Number.isNaN` |
| JavaScript 標準函式庫 | 轉換用 `Array.from`、`toISOString` |
| Godot API | 依鍵尋找用 `_by_`，不用 `_named` |

## 2 文件

`docs/` 與 `.spec/` 的文件共同遵守下列規則，撰寫或改動章節之前先讀這裡。

### 2.1 結構

| 規則 | 限制 |
|---|---|
| 章節順序 | 依相依關係，由大到小 |
| 每節 | 至少一個表或圖 |
| 章的開頭 | 只有簡短導言時免表或圖 |
| 圖 | ASCII，不用 Mermaid |
| 表格每格 | 15 字內 |
| 每節內文 | 100 字內 |

表格用來快速掃過，細節寫進該節內文；內文超過 100 字就拆成小節。章的開頭常只寫相依與行為，底下的小節才有內容。README 以英文與正體中文兩份提供，互相連結。

### 2.2 算字數

| 內容 | 怎麼算 |
|---|---|
| 中文字、標點 | 各算一個字 |
| 英文單字 | 算一個字 |
| 行內程式碼 | 整段算一個字 |
| 空格、按鍵組合 | 不算 |

英文單字算一個字，中英文夾雜的段落長度才相近。空格與 `⌘/Ctrl+L` 這類按鍵組合只是寫法，不算字。

### 2.3 用字

| 範圍 | 限制 |
|---|---|
| 內文與介面文字 | `zhtw-mcp lint` 零結果 |
| 表格的翻譯腔警告 | 誤報，不算 |

linter 把整列表格讀成一句，表格的翻譯腔警告因此不算；其他警告仍照改。

import type en from "./en";

const zhHant: typeof en = {
  toolbar: {
    open: "開啟 ▾",
    fromSrt: "從 SRT 建立",
    export: "匯出 ▾",
    original: "原文 SRT",
    translation: "譯文 SRT",
    bilingual: "雙語 SRT",
  },
  tabs: {
    transcribe: "轉錄",
    translate: "翻譯",
    edit: "編輯",
    settings: "設定",
  },
  work: {
    into: "譯成",
    preparing: "準備中",
    failed: "失敗：{{reason}}",
  },
  transcribe: {
    drop: "拖入影片或音訊，或",
    choose: "選擇檔案",
    translateAfter: "完成後翻譯",
    done: "完成：音檔 {{audio}} 秒，轉錄 {{seconds}} 秒（RTF {{factor}}）",
    transcribePhases: "轉錄：{{phases}}",
    translatePhases: "翻譯：{{phases}}",
  },
  translate: {
    source: "來源：本專案的 Transcript",
    start: "開始翻譯",
    done: "完成",
  },
  edit: {
    empty: "尚無內容",
  },
  settings: {
    components: "元件",
    models: "模型",
    about: "關於",
    choose: "指定",
    chooseFile: "指定檔案",
    checking: "檢查中",
    license: "Tsuzuri 以 Apache-2.0 授權釋出。",
  },
  slots: {
    transcription: "轉錄",
    translation: "翻譯",
  },
  components: {
    chosen: "指定",
    detected: "偵測到",
    bundled: "內建",
    ready: "已就緒",
    found: "{{origin}}：{{path}}",
    doesNotRun: "未就緒（內建的版本無法執行，可能缺少驅動程式或系統函式庫）",
    installWith: "未就緒（可用 {{command}} 安裝）",
    install: "未就緒（請用套件管理工具安裝）",
  },
  models: {
    notChosen: "尚未指定",
    missing: "找不到 {{path}}，請重新指定",
  },
  phases: {
    prepare: "準備元件",
    convert: "轉檔",
    load: "載入模型",
    transcribe: "轉錄",
    translate: "翻譯",
    firstLoad: "{{phase}}（第一次使用會比較久）",
    percent: "{{phase}} {{percent}}%",
    seconds: "{{phase}} {{seconds}} 秒",
  },
  failures: {
    io: "無法讀寫檔案（{{detail}}）",
    malformedSrt: "SRT 第 {{cue}} 段無法讀取",
    modelNotChosen: "尚未指定{{slot}}模型",
    modelMissing: "找不到模型 {{path}}，請重新指定",
    noProject: "請先轉錄媒體檔或開啟 SRT 檔",
    componentNotReady: "{{component}} 尚未就緒，請到設定確認",
    stepFailed: "{{step}} 失敗：{{detail}}",
    llamaExited: "llama-server 在模型載入前結束",
    llamaTimedOut: "llama-server 未能及時載入模型",
    llamaRequest: "翻譯請求失敗（{{detail}}）",
    internal: "內部錯誤（{{detail}}）",
  },
};

export default zhHant;

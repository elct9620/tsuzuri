/** The interface text in English, which every other language falls back to. */
const en = {
  toolbar: {
    export: "Export ▾",
    original: "Original SRT",
    translation: "Translated SRT",
    bilingual: "Bilingual SRT",
  },
  tabs: {
    transcribe: "Transcribe",
    translate: "Translate",
    edit: "Edit",
    settings: "Settings",
  },
  work: {
    into: "Into",
    preparing: "Preparing",
    failed: "Failed: {{reason}}",
  },
  transcribe: {
    drop: "Drop a video or audio file here, or",
    choose: "Choose a file",
    translateAfter: "Translate once transcribed",
    done: "Done: {{audio}} s of audio transcribed in {{seconds}} s (RTF {{factor}})",
    transcribePhases: "Transcribe: {{phases}}",
    translatePhases: "Translate: {{phases}}",
  },
  translate: {
    choose: "Choose an SRT file",
    done: "Done",
  },
  edit: {
    empty: "Nothing yet",
  },
  settings: {
    components: "Components",
    models: "Models",
    about: "About",
    choose: "Choose",
    chooseFile: "Choose a file",
    checking: "Checking",
    license: "Tsuzuri is released under the Apache-2.0 license.",
  },
  slots: {
    transcription: "Transcription",
    translation: "Translation",
  },
  components: {
    chosen: "Chosen",
    detected: "Detected",
    bundled: "Bundled",
    ready: "Ready",
    found: "{{origin}}: {{path}}",
    doesNotRun:
      "Not ready (the bundled build does not run; a driver or system library it needs may be missing)",
    installWith: "Not ready (install it with {{command}})",
    install: "Not ready (install it with your package manager)",
  },
  models: {
    notChosen: "Not chosen",
    missing: "{{path}} is missing; choose it again",
  },
  phases: {
    prepare: "Preparing components",
    convert: "Converting",
    load: "Loading the model",
    transcribe: "Transcribing",
    translate: "Translating",
    firstLoad: "{{phase}} (slower the first time)",
    percent: "{{phase}} {{percent}}%",
    seconds: "{{phase}} {{seconds}} s",
  },
  failures: {
    io: "Could not read or write a file ({{detail}})",
    malformedSrt: "Could not read cue {{cue}} of the SRT file",
    modelNotChosen: "No model is chosen for {{slot}}",
    modelMissing: "The model {{path}} is missing; choose it again",
    componentNotReady: "{{component}} is not ready; check it in Settings",
    stepFailed: "{{step}} failed: {{detail}}",
    llamaExited: "llama-server stopped before loading its model",
    llamaTimedOut: "llama-server did not load its model in time",
    llamaRequest: "The translation request failed ({{detail}})",
    internal: "Internal error ({{detail}})",
  },
};

export default en;

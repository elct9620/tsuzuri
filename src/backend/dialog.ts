/** The system's file and message dialogs, which Tauri draws on Rust's side of the window. */
export { message, open, save } from "@tauri-apps/plugin-dialog";

/** The choice of file a dialog offers for a subtitle, which Tsuzuri reads and writes as SRT. */
export const SRT_FILTERS = [{ name: "SRT", extensions: ["srt"] }];

/** The choice of file a dialog offers for an export as Plain Text. */
export const TEXT_FILTERS = [{ name: "Text", extensions: ["txt"] }];

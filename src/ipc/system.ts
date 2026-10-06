import { platform } from "@tauri-apps/plugin-os";

/** The system's locale, which picks the Interface Language when the window opens. */
export { locale } from "@tauri-apps/plugin-os";

/** Whether the app runs on macOS, which keeps some keys for itself. */
export function isMacOS(): boolean {
  return platform() === "macos";
}

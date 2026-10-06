/** Runs the rest of the test as on `platform`, as the OS plugin reports it; each test starts on Linux. */
export function usePlatform(platform: "linux" | "macos" | "windows"): void {
  Object.assign(window, { __TAURI_OS_PLUGIN_INTERNALS__: { platform } });
}

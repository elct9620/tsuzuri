import { mockIPC } from "@tauri-apps/api/mocks";

/**
 * Answers the reads the Svelte Components make as the page mounts: the App Build, read with no
 * failure to fall back on, and a Failure for every other read, which each tells as unreadable.
 */
export function mockPageMount(): void {
  mockIPC((command) =>
    command === "app_build"
      ? { release_name: "v0.2.0", commit: "7649ca4" }
      : Promise.reject({ code: "io", detail: "not asked here" }),
  );
}

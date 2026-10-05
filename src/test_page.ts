import { mockIPC } from "@tauri-apps/api/mocks";

import type { ProjectView } from "./backend/project";

/**
 * Answers the reads the Svelte Components make as the page mounts: the App Build and the update
 * settings, with no App Update found at launch, `project` as the Project open, and a Failure for
 * every other read, which each tells as unreadable.
 */
export function mockPageMount(project: ProjectView | null = null): void {
  mockIPC((command) => {
    if (command === "app_build")
      return { release_name: "v0.2.0", commit: "7649ca4" };
    if (command === "current_project") return project;
    if (command === "update_settings")
      return { has_launch_check: false, channel: "stable" };
    if (command === "check_for_update_at_launch") return null;
    return Promise.reject({ code: "io", detail: "not asked here" });
  });
}

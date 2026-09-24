import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Segment {
  start_ms: number;
  end_ms: number;
  text: string;
  translation?: string;
}

/** The Project as Rust holds it; the webview only ever shows this, never a copy of its own. */
export interface ProjectView {
  media: string | null;
  segments: Segment[];
}

/** Calls `show` with the Project Rust holds now and again each time it changes. */
export async function followProject(
  show: (project: ProjectView | null) => void,
): Promise<UnlistenFn> {
  const refresh = async () =>
    show(await invoke<ProjectView | null>("current_project"));
  const unlisten = await listen("project-changed", () => void refresh());
  await refresh();
  return unlisten;
}

import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";

import { followProject, type ProjectView, type Segment } from "../project";

export function formatTime(ms: number): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms % 1000, 3)}`;
}

/** Which text of a Segment an editor holds, named as Rust names it. */
type SegmentField = "text" | "translation";

/** Which text the saved SRT's cues carry; the backend writes each one. */
type SrtContent = "original" | "translation" | "bilingual";

function editor(
  index: number,
  field: SegmentField,
  value: string,
): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = field;
  textarea.dataset.index = String(index);
  textarea.dataset.field = field;
  textarea.dataset.action = "change->transcript#edit";
  textarea.rows = Math.max(1, value.split("\n").length);
  textarea.value = value;
  return textarea;
}

function item(segment: Segment, index: number): HTMLLIElement {
  const li = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = `${formatTime(segment.start_ms)} → ${formatTime(segment.end_ms)}`;
  li.append(time, editor(index, "text", segment.text));
  if (segment.translation !== undefined)
    li.append(editor(index, "translation", segment.translation));
  return li;
}

export default class TranscriptController extends Controller {
  static targets = ["list", "empty", "export"];

  declare readonly listTarget: HTMLOListElement;
  declare readonly emptyTarget: HTMLElement;
  /** Each export, enabled once the Project has the text it writes. */
  declare readonly exportTargets: HTMLButtonElement[];

  private unlisten?: UnlistenFn;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
  }

  async edit(event: Event): Promise<void> {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    await invoke("edit_segment", {
      index: Number(textarea.dataset.index),
      field: textarea.dataset.field as SegmentField,
      value: textarea.value,
    });
  }

  async save({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { content: SrtContent };
  }): Promise<void> {
    (currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
    const path = await save({
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path === null) return;
    await invoke("save_srt", { path, content: params.content });
  }

  private show(project: ProjectView | null): void {
    const segments = project?.segments ?? [];
    this.showSegments(segments);
    const hasTranslation = segments.some(
      (segment) => segment.translation !== undefined,
    );
    this.emptyTarget.hidden = segments.length > 0;
    for (const target of this.exportTargets) {
      const needsTranslation =
        target.dataset.transcriptContentParam !== "original";
      target.disabled =
        segments.length === 0 || (needsTranslation && !hasTranslation);
    }
  }

  /** Refreshes the editors in place when the Project keeps its shape, so the one being typed in keeps its focus. */
  private showSegments(segments: Segment[]): void {
    const editors = [
      ...this.listTarget.querySelectorAll<HTMLTextAreaElement>("textarea"),
    ];
    const values = segments.flatMap((segment) =>
      segment.translation === undefined
        ? [segment.text]
        : [segment.text, segment.translation],
    );
    const sameShape =
      this.listTarget.children.length === segments.length &&
      editors.length === values.length;
    if (!sameShape) {
      this.listTarget.replaceChildren(...segments.map(item));
      return;
    }
    editors.forEach((textarea, index) => {
      if (textarea !== document.activeElement) textarea.value = values[index];
    });
  }
}

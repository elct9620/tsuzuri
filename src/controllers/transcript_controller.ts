import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export interface Segment {
  start_ms: number;
  end_ms: number;
  text: string;
  translation?: string;
}

export function formatTime(ms: number): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms % 1000, 3)}`;
}

function editor(className: string, value: string): HTMLTextAreaElement {
  const field = document.createElement("textarea");
  field.className = className;
  field.rows = Math.max(1, value.split("\n").length);
  field.value = value;
  return field;
}

/** Which text the saved SRT's cues carry; the backend writes each one. */
type SrtContent = "original" | "translation" | "bilingual";

export default class TranscriptController extends Controller {
  static targets = ["list", "empty", "actions", "translated"];

  declare readonly listTarget: HTMLOListElement;
  declare readonly emptyTarget: HTMLElement;
  declare readonly actionsTarget: HTMLElement;
  /** Actions that need a translation, hidden until the Transcript has one. */
  declare readonly translatedTargets: HTMLElement[];

  private segments: Segment[] = [];

  show(event: CustomEvent<{ segments: Segment[] }>): void {
    this.segments = event.detail.segments;
    this.listTarget.replaceChildren(
      ...this.segments.map((segment) => {
        const item = document.createElement("li");
        const time = document.createElement("time");
        time.textContent = `${formatTime(segment.start_ms)} → ${formatTime(segment.end_ms)}`;
        item.append(time, editor("text", segment.text));
        if (segment.translation !== undefined)
          item.append(editor("translation", segment.translation));
        return item;
      }),
    );
    const hasTranslation = this.segments.some(
      (segment) => segment.translation !== undefined,
    );
    this.emptyTarget.hidden = this.segments.length > 0;
    this.actionsTarget.hidden = this.segments.length === 0;
    for (const action of this.translatedTargets)
      action.hidden = !hasTranslation;
  }

  async save({ params }: { params: { content: SrtContent } }): Promise<void> {
    const path = await save({
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path === null) return;

    const items = [...this.listTarget.children];
    const segments = this.segments.map((segment, index) => {
      const field = (name: string) =>
        items[index].querySelector<HTMLTextAreaElement>(`textarea.${name}`)
          ?.value;
      return {
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        text: field("text") ?? "",
        translation: field("translation"),
      };
    });
    await invoke("save_srt", { path, segments, content: params.content });
  }
}

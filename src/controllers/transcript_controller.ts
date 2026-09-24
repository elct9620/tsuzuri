import { Controller } from "@hotwired/stimulus";

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

export default class TranscriptController extends Controller {
  static targets = ["list", "empty"];

  declare readonly listTarget: HTMLOListElement;
  declare readonly emptyTarget: HTMLElement;

  show(event: CustomEvent<{ segments: Segment[] }>): void {
    const { segments } = event.detail;
    this.listTarget.replaceChildren(
      ...segments.map((segment) => {
        const item = document.createElement("li");
        const time = document.createElement("time");
        time.textContent = `${formatTime(segment.start_ms)} → ${formatTime(segment.end_ms)}`;
        const text = document.createElement("p");
        text.textContent = segment.text;
        item.append(time, text);
        if (segment.translation) {
          const translation = document.createElement("p");
          translation.className = "translation";
          translation.textContent = segment.translation;
          item.append(translation);
        }
        return item;
      }),
    );
    this.emptyTarget.hidden = segments.length > 0;
  }
}

import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";

import { failureCode, failureMessage } from "../failure";
import { t } from "../i18n";
import { notify } from "../notification";
import { closeMenu } from "../menu";
import type { TaskKind } from "./progress_controller";
import {
  currentProject,
  currentResource,
  followProject,
  type ProjectView,
  type Segment,
} from "../project";

export function formatTime(ms: number): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms % 1000, 3)}`;
}

/** Which text of a Segment an editor holds, named as Rust names it. */
type SegmentField = "text" | "translation" | "speaker";

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
  if (field === "translation") textarea.placeholder = t("edit.untranslated");
  return textarea;
}

/** Rows standing for Segments still being made or read. */
function placeholderRows(): HTMLLIElement[] {
  return Array.from({ length: 3 }, () => {
    const li = document.createElement("li");
    li.dataset.placeholder = "";
    li.className = "flex flex-col gap-2 py-2";
    const time = document.createElement("div");
    time.className = "skeleton h-4 w-48";
    const text = document.createElement("div");
    text.className = "skeleton h-10 w-full";
    li.append(time, text);
    return li;
  });
}

function option(value: string, label: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = label;
  return choice;
}

/** One row: the times, the text, and the translation when one is shown, even before it is made. */
/** Who says the Segment, chosen from the Speakers already named or typed anew. */
function speakerEditor(index: number, speaker: string): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "speaker input input-xs w-28";
  input.setAttribute("list", "speakers");
  input.dataset.index = String(index);
  input.dataset.field = "speaker";
  input.dataset.action = "change->transcript#edit";
  input.placeholder = t("edit.speaker");
  input.value = speaker;
  return input;
}

function item(
  segment: Segment,
  index: number,
  showsTranslation: boolean,
): HTMLLIElement {
  const li = document.createElement("li");
  const heading = document.createElement("div");
  heading.className = "flex flex-col gap-1";
  const time = document.createElement("time");
  time.textContent = `${formatTime(segment.start_ms)} → ${formatTime(segment.end_ms)}`;
  heading.append(time, speakerEditor(index, segment.speaker ?? ""));
  const editors = document.createElement("div");
  editors.append(editor(index, "text", segment.text));
  if (showsTranslation)
    editors.append(editor(index, "translation", segment.translation ?? ""));
  li.append(heading, editors);
  return li;
}

export default class TranscriptController extends Controller {
  static targets = [
    "list",
    "empty",
    "export",
    "heading",
    "translationLanguage",
    "speakers",
  ];

  declare readonly listTarget: HTMLOListElement;
  declare readonly emptyTarget: HTMLElement;
  /** Names the Current Resource. */
  declare readonly headingTarget: HTMLElement;
  /** Which of the Current Resource's translations the editor shows, or none. */
  declare readonly translationLanguageTarget: HTMLSelectElement;
  /** The Speakers the Current Resource names, which each Speaker field offers. */
  declare readonly speakersTarget: HTMLDataListElement;
  /** Each export, enabled once the Project has the text it writes. */
  declare readonly exportTargets: HTMLButtonElement[];

  private unlisten?: UnlistenFn;
  /** The task running now, whose results the editor holds Placeholders for. */
  private runningTask: TaskKind | null = null;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
  }

  async followTask({
    detail,
  }: CustomEvent<{ task: TaskKind | null }>): Promise<void> {
    this.runningTask = detail.task;
    this.show(await currentProject());
  }

  /** Stands Placeholders in for the Segments of a Resource being read. */
  showLoading(): void {
    this.listTarget.replaceChildren(...placeholderRows());
    this.emptyTarget.hidden = true;
  }

  async edit(event: Event): Promise<void> {
    const field = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    try {
      await invoke("edit_segment", {
        index: Number(field.dataset.index),
        field: field.dataset.field as SegmentField,
        value: field.value,
      });
      notify(t("edit.saved"), "success", "saved");
    } catch (error) {
      notify(
        failureMessage(error),
        failureCode(error) === "changed-elsewhere" ? "warning" : "error",
      );
    }
  }

  async showTranslation(): Promise<void> {
    await invoke("show_translation", {
      language: this.translationLanguageTarget.value || null,
    });
  }

  async save({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { content: SrtContent };
  }): Promise<void> {
    closeMenu(currentTarget);
    const path = await save({
      defaultPath: await invoke<string>("export_path", {
        content: params.content,
      }),
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path === null) return;
    await invoke("save_srt", { path, content: params.content });
  }

  private show(project: ProjectView | null): void {
    const segments = project?.segments ?? [];
    const showsTranslation = (project?.shown_translation ?? null) !== null;
    this.headingTarget.textContent = project?.current_resource ?? "";
    this.showLanguages(project);
    this.showSegments(segments, showsTranslation);
    const isAwaitingSegments =
      segments.length === 0 && this.runningTask === "transcribe";
    if (isAwaitingSegments) this.showLoading();
    const hasTranslation = segments.some(
      (segment) => segment.translation !== undefined,
    );
    this.emptyTarget.hidden = segments.length > 0 || isAwaitingSegments;
    for (const target of this.exportTargets) {
      const needsTranslation =
        target.dataset.transcriptContentParam !== "original";
      target.disabled =
        segments.length === 0 || (needsTranslation && !hasTranslation);
    }
  }

  /** Offers no translation and each Language the Current Resource has, or is being translated into. */
  private showLanguages(project: ProjectView | null): void {
    const shown = project?.shown_translation ?? null;
    const codes = [...(currentResource(project)?.translation_languages ?? [])];
    if (shown !== null && !codes.includes(shown)) codes.push(shown);
    this.translationLanguageTarget.replaceChildren(
      option("", t("edit.noTranslation")),
      ...codes.map((code) => option(code, t(`languages.${code}`))),
    );
    this.translationLanguageTarget.value = shown ?? "";
  }

  /** Refreshes the editors in place when the Project keeps its shape, so the one being typed in keeps its focus. */
  private showSegments(segments: Segment[], showsTranslation: boolean): void {
    this.showSpeakers(segments);
    const editors = [
      ...this.listTarget.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement
      >("[data-field]"),
    ];
    const values = segments.flatMap((segment) => [
      segment.speaker ?? "",
      segment.text,
      ...(showsTranslation ? [segment.translation ?? ""] : []),
    ]);
    const sameShape =
      this.listTarget.children.length === segments.length &&
      editors.length === values.length;
    if (!sameShape) {
      this.listTarget.replaceChildren(
        ...segments.map((segment, index) =>
          item(segment, index, showsTranslation),
        ),
      );
    } else {
      editors.forEach((field, index) => {
        if (field !== document.activeElement) field.value = values[index];
      });
    }
    this.showPendingTranslations();
  }

  private showSpeakers(segments: Segment[]): void {
    const speakers = new Set(
      segments.flatMap((segment) => (segment.speaker ? [segment.speaker] : [])),
    );
    this.speakersTarget.replaceChildren(
      ...[...speakers].sort().map((speaker) => option(speaker, speaker)),
    );
  }

  /** Marks each translation still to come while a translation runs. */
  private showPendingTranslations(): void {
    const isTranslating = this.runningTask === "translate";
    for (const textarea of this.listTarget.querySelectorAll<HTMLTextAreaElement>(
      "textarea.translation",
    )) {
      textarea.classList.toggle(
        "skeleton",
        isTranslating && textarea.value === "",
      );
    }
  }
}

import { Controller } from "@hotwired/stimulus";

import { save } from "../backend/dialog";
import {
  currentProject,
  currentResource,
  editSegment,
  exportPath,
  followProject,
  saveSrt,
  showTranslation,
  type ProjectView,
  type Segment,
  type SegmentField,
  type SrtContent,
  type UnlistenFn,
} from "../backend/project";
import {
  createField,
  fieldValue,
  isField,
  setFieldHeld,
  setFieldValue,
} from "../editor/field";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { iconElement } from "../ui/icons";
import { notify, notifyFailure } from "../ui/notification";
import { formatTime } from "../ui/time";
import type { TaskKind } from "./progress_controller";

/** The text field of one text of a Segment, which hands its text to `transcript#edit` when left changed. */
function editor(
  index: number,
  field: SegmentField,
  value: string,
): HTMLElement {
  const editor = createField(
    value,
    field === "translation" ? t("edit.untranslated") : "",
  );
  editor.className = `field ${field}`;
  editor.dataset.index = String(index);
  editor.dataset.field = field;
  editor.dataset.controller = "field";
  editor.dataset.action =
    "focus->field#remember compositionstart->field#startComposing compositionend->field#endComposing keydown.enter->field#breakLine:!composing:prevent blur->field#leave field:change->transcript#edit";
  return editor;
}

/** Rows standing for Segments still being made or read, three unless `count` says otherwise. */
function placeholderRows(count = 3): HTMLLIElement[] {
  return Array.from({ length: count }, () => {
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

/** Shows who says a Segment on its Speaker button, or that nobody is named yet. */
function labelSpeaker(opener: HTMLElement, speaker: string): void {
  opener.textContent = speaker || t("edit.speaker");
  opener.classList.toggle("text-base-content/40", speaker === "");
}

/**
 * Who says the Segment, in a menu whose names `speakers#list` lists as it opens, so
 * every Speaker is offered whatever the Segment names now.
 */
function speakerMenu(index: number, speaker: string): HTMLElement {
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown";
  const opener = document.createElement("div");
  opener.tabIndex = 0;
  opener.setAttribute("role", "button");
  opener.className =
    "speaker btn btn-xs w-28 justify-start truncate font-normal";
  opener.dataset.field = "speaker";
  opener.dataset.action = "focus->speakers#list";
  opener.dataset.speakersIndexParam = String(index);
  labelSpeaker(opener, speaker);
  const card = document.createElement("div");
  card.tabIndex = 0;
  card.className =
    "dropdown-content card card-sm z-10 w-48 bg-base-100 shadow-md";
  const body = document.createElement("div");
  body.className = "card-body gap-1 p-2";
  const name = document.createElement("input");
  name.className = "new-speaker input input-xs";
  name.placeholder = t("edit.newSpeakerName");
  name.dataset.action = "keydown.enter->speakers#name:!composing:prevent";
  name.dataset.speakersIndexParam = String(index);
  const names = document.createElement("ul");
  names.className = "speakers menu menu-sm w-full p-0";
  body.append(name, names);
  card.append(body);
  dropdown.append(opener, card);
  return dropdown;
}

/** Keeps the menu `opener` opens shut while `isHeld`, as a disabled button would be. */
function holdMenu(opener: HTMLElement, isHeld: boolean): void {
  opener.tabIndex = isHeld ? -1 : 0;
  opener.classList.toggle("btn-disabled", isHeld);
}

/** The start or the end of a Segment, typed as a time. */
function timeEditor(
  index: number,
  edge: "start" | "end",
  ms: number,
): HTMLInputElement {
  const input = document.createElement("input");
  input.className = `${edge} input input-xs w-28 font-mono`;
  input.dataset.index = String(index);
  input.dataset.edge = edge;
  input.dataset.action = "change->segment-changes#changeTimes";
  input.value = formatTime(ms);
  return input;
}

/** The Segment Changes one Segment offers, in a menu opened from its button. */
function changeMenu(index: number): HTMLElement {
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown dropdown-left";
  const opener = document.createElement("div");
  opener.tabIndex = 0;
  opener.setAttribute("role", "button");
  opener.className = "btn btn-square btn-ghost btn-xs";
  opener.setAttribute("aria-label", t("edit.changes"));
  opener.append(iconElement("EllipsisVertical"));
  const menu = document.createElement("ul");
  menu.tabIndex = -1;
  menu.className =
    "menu dropdown-content z-10 w-40 rounded-box bg-base-100 shadow-md";
  for (const [action, label] of [
    ["insertBefore", "edit.insertAbove"],
    ["insertAfter", "edit.insertBelow"],
    ["split", "edit.split"],
    ["delete", "edit.delete"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action;
    button.dataset.index = String(index);
    button.dataset.action = `segment-changes#${action}`;
    button.textContent = t(label);
    const choice = document.createElement("li");
    choice.append(button);
    menu.append(choice);
  }
  dropdown.append(opener, menu);
  return dropdown;
}

/** One row: the choice to select it, its times and Speaker, the text, and the translation when one is shown, even before it is made. */
function item(
  segment: Segment,
  index: number,
  isTranslationShown: boolean,
): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.action = "click->transcript#makeCurrent";
  li.dataset.transcriptIndexParam = String(index);
  const selection = document.createElement("input");
  selection.type = "checkbox";
  selection.className = "selection checkbox checkbox-xs mt-1.5";
  selection.dataset.index = String(index);
  selection.dataset.action = "change->segment-changes#showSelection";
  const heading = document.createElement("div");
  heading.className = "flex flex-col gap-1";
  heading.append(
    timeEditor(index, "start", segment.start_ms),
    timeEditor(index, "end", segment.end_ms),
    speakerMenu(index, segment.speaker ?? ""),
  );
  const editors = document.createElement("div");
  editors.className = "list-col-grow";
  editors.append(editor(index, "text", segment.text));
  if (isTranslationShown)
    editors.append(editor(index, "translation", segment.translation ?? ""));
  li.append(selection, heading, editors, changeMenu(index));
  return li;
}

export default class TranscriptController extends Controller {
  static targets = [
    "list",
    "empty",
    "export",
    "heading",
    "translationLanguage",
  ];

  declare readonly listTarget: HTMLOListElement;
  declare readonly emptyTarget: HTMLElement;
  /** Names the Current Resource. */
  declare readonly headingTarget: HTMLElement;
  /** Which of the Current Resource's translations the editor shows, or none. */
  declare readonly translationLanguageTarget: HTMLSelectElement;
  /** Each export, enabled once the Project has the text it writes. */
  declare readonly exportTargets: HTMLButtonElement[];

  private unlisten?: UnlistenFn;
  /** The task running now, whose results the editor holds Placeholders for. */
  private runningTask: TaskKind | null = null;
  /** The Project shown now, whose Primary Language and glossary Speakers a new Speaker is checked against. */
  private project: ProjectView | null = null;
  /** The Current Segment's position, held by the webview alone. */
  private currentIndex: number | null = null;
  /** The position of the Segment the Preview is playing. */
  private playingIndex: number | null = null;

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
    const field = event.currentTarget as HTMLElement;
    try {
      await editSegment(
        Number(field.dataset.index),
        field.dataset.field as SegmentField,
        fieldValue(field),
      );
      notify({ title: t("edit.saved"), kind: "success" });
    } catch (error) {
      notifyFailure(t("edit.notSaved"), error);
    }
  }

  makeCurrent({ params }: { params: { index: number } }): void {
    if (params.index === this.currentIndex) return;
    this.markCurrent(params.index);
    this.dispatch("current", { detail: { index: params.index } });
  }

  /** Marks the Segment made current elsewhere, bringing its row into view. */
  showCurrent({ detail }: CustomEvent<{ index: number }>): void {
    this.markCurrent(detail.index);
    this.rowAt(detail.index)?.scrollIntoView({ block: "nearest" });
  }

  /** Marks the Segment the Preview is playing, keeping its row in view. */
  markPlaying({ detail }: CustomEvent<{ index: number | null }>): void {
    this.playingIndex = detail.index;
    this.markRows();
    if (detail.index !== null)
      this.rowAt(detail.index)?.scrollIntoView({ block: "nearest" });
  }

  private markCurrent(index: number | null): void {
    this.currentIndex = index;
    this.markRows();
  }

  private markRows(): void {
    this.segmentRows().forEach((row, index) => {
      row.toggleAttribute("aria-current", index === this.currentIndex);
      row.toggleAttribute("data-playing", index === this.playingIndex);
    });
  }

  private segmentRows(): HTMLLIElement[] {
    return [
      ...this.listTarget.querySelectorAll<HTMLLIElement>(
        ":scope > li:not([data-ghost]):not([data-placeholder])",
      ),
    ];
  }

  private rowAt(index: number): HTMLLIElement | undefined {
    return this.segmentRows()[index];
  }

  async showTranslation(): Promise<void> {
    await showTranslation(this.translationLanguageTarget.value || null);
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
      defaultPath: await exportPath(params.content),
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path === null) return;
    await saveSrt(path, params.content);
  }

  private show(project: ProjectView | null): void {
    if (project?.current_resource !== this.project?.current_resource)
      this.markCurrent(null);
    this.project = project;
    const segments = project?.segments ?? [];
    const isTranslationShown = (project?.shown_translation ?? null) !== null;
    this.headingTarget.textContent = project?.current_resource ?? "";
    this.showLanguages(project);
    this.showSegments(segments, isTranslationShown);
    this.holdFields(project);
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
    this.dispatch("shown", { detail: { project } });
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
  private showSegments(segments: Segment[], isTranslationShown: boolean): void {
    const editors = [
      ...this.listTarget.querySelectorAll<HTMLElement>(
        "[data-edge], [data-field]",
      ),
    ];
    const values = segments.flatMap((segment) => [
      formatTime(segment.start_ms),
      formatTime(segment.end_ms),
      segment.speaker ?? "",
      segment.text,
      ...(isTranslationShown ? [segment.translation ?? ""] : []),
    ]);
    const rows = this.listTarget.querySelectorAll(
      ":scope > li:not([data-ghost]):not([data-placeholder])",
    );
    const sameShape =
      rows.length === segments.length && editors.length === values.length;
    if (!sameShape) {
      this.listTarget.replaceChildren(
        ...segments.map((segment, index) =>
          item(segment, index, isTranslationShown),
        ),
      );
    } else {
      editors.forEach((field, index) => {
        if (field === document.activeElement) return;
        if (field.dataset.field === "speaker")
          labelSpeaker(field, values[index]);
        else if (isField(field)) setFieldValue(field, values[index]);
        else (field as HTMLInputElement).value = values[index];
      });
    }
    this.showPendingTranslations();
    this.showSegmentsToCome(segments.length);
    this.markRows();
  }

  /** Disables each field whose subtitle the Mode running on the Current Resource writes. */
  private holdFields(project: ProjectView | null): void {
    const mode = project?.running_mode ?? null;
    const isTranslationFree =
      mode?.mode === "translation" &&
      mode.language !== project?.shown_translation;
    for (const field of this.listTarget.querySelectorAll<
      HTMLInputElement | HTMLButtonElement | HTMLElement
    >('input, button, [role="button"], [contenteditable]')) {
      const isFree =
        mode === null ||
        (mode.mode === "translation" && field.classList.contains("text")) ||
        (isTranslationFree && field.classList.contains("translation"));
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLButtonElement
      )
        field.disabled = !isFree;
      else if (field.getAttribute("role") === "button")
        holdMenu(field, !isFree);
      else setFieldHeld(field, !isFree);
    }
  }

  /** Marks the translations of the Batch being translated, where the next ones land. */
  private showPendingTranslations(): void {
    const batch = this.project?.pending_batch ?? null;
    for (const field of this.listTarget.querySelectorAll<HTMLElement>(
      ".field.translation",
    )) {
      const index = Number(field.dataset.index);
      field.classList.toggle(
        "skeleton",
        batch !== null && index >= batch.first && index <= batch.last,
      );
    }
  }

  /** Holds a Placeholder row after the last of `count` Segments while more are transcribed. */
  private showSegmentsToCome(count: number): void {
    for (const row of this.listTarget.querySelectorAll(
      ":scope > li[data-placeholder]",
    ))
      row.remove();
    if (this.runningTask === "transcribe" && count > 0)
      this.listTarget.append(...placeholderRows(1));
  }
}

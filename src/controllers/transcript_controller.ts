import { Controller } from "@hotwired/stimulus";

import { save } from "../backend/dialog";
import {
  currentProject,
  currentResource,
  editSegment,
  exportPath,
  followProject,
  saveSrt,
  saveTranslationGlossary,
  showTranslation,
  translationGlossaryTable,
  type ProjectView,
  type Segment,
  type SegmentField,
  type SrtContent,
  type UnlistenFn,
} from "../backend/project";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notify, notifyFailure, type Notification } from "../ui/notification";
import { formatTime } from "../ui/time";
import type { TaskKind } from "./progress_controller";

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

/** The Segment Changes one Segment offers, in a menu opened from `⋮`. */
function changeMenu(index: number): HTMLElement {
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown dropdown-left";
  const opener = document.createElement("div");
  opener.tabIndex = 0;
  opener.setAttribute("role", "button");
  opener.className = "btn btn-ghost btn-xs";
  opener.textContent = "⋮";
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
    speakerEditor(index, segment.speaker ?? ""),
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
  /** The Project shown now, whose Primary Language and glossary Speakers a new Speaker is checked against. */
  private project: ProjectView | null = null;

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
      await editSegment(
        Number(field.dataset.index),
        field.dataset.field as SegmentField,
        field.value,
      );
      notify({
        title: t("edit.saved"),
        kind: "success",
        ...this.speakerOffer(field),
      });
    } catch (error) {
      notifyFailure(t("edit.notSaved"), error);
    }
  }

  /** An offer to add the Speaker just named to the Translation Glossary, when it names none such. */
  private speakerOffer(
    field: HTMLInputElement | HTMLTextAreaElement,
  ): Pick<Notification, "detail" | "action"> {
    const name = field.value.trim();
    const glossarySpeakers = this.project?.translation_glossary?.speakers ?? [];
    if (field.dataset.field !== "speaker" || name === "") return {};
    if (glossarySpeakers.includes(name)) return {};
    return {
      detail: t("edit.newSpeaker", { name }),
      action: {
        label: t("edit.addSpeaker"),
        run: () => void this.addSpeaker(name),
      },
    };
  }

  /** Marks the term `name` in the Primary Language column as a Speaker, adding the term when the glossary has none. */
  private async addSpeaker(name: string): Promise<void> {
    try {
      const table = await translationGlossaryTable();
      const column = table.languages.indexOf(this.project?.language ?? "");
      const term = table.rows.find((row) => row.words[column] === name);
      const rows = term
        ? table.rows.map((row) =>
            row === term ? { ...row, is_speaker: true } : row,
          )
        : [
            ...table.rows,
            {
              words: table.languages.map((_, at) =>
                at === column ? name : "",
              ),
              is_speaker: true,
            },
          ];
      await saveTranslationGlossary(rows);
      notify({ title: t("edit.speakerAdded", { name }), kind: "success" });
    } catch (error) {
      notifyFailure(t("edit.speakerNotAdded"), error);
    }
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
    this.project = project;
    const segments = project?.segments ?? [];
    const isTranslationShown = (project?.shown_translation ?? null) !== null;
    this.headingTarget.textContent = project?.current_resource ?? "";
    this.showLanguages(project);
    this.showSpeakers(segments, project?.translation_glossary?.speakers ?? []);
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
      ...this.listTarget.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement
      >("[data-edge], [data-field]"),
    ];
    const values = segments.flatMap((segment) => [
      formatTime(segment.start_ms),
      formatTime(segment.end_ms),
      segment.speaker ?? "",
      segment.text,
      ...(isTranslationShown ? [segment.translation ?? ""] : []),
    ]);
    const rows = this.listTarget.querySelectorAll(
      ":scope > li:not([data-ghost])",
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
        if (field !== document.activeElement) field.value = values[index];
      });
    }
    this.showPendingTranslations();
  }

  /** Disables each field whose subtitle the Mode running on the Current Resource writes. */
  private holdFields(project: ProjectView | null): void {
    const mode = project?.running_mode ?? null;
    const isTranslationFree =
      mode?.mode === "translation" &&
      mode.language !== project?.shown_translation;
    for (const field of this.listTarget.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    >("input, textarea, button")) {
      const isFree =
        mode === null ||
        (mode.mode === "translation" && field.classList.contains("text")) ||
        (isTranslationFree && field.classList.contains("translation"));
      field.disabled = !isFree;
    }
  }

  /** Offers the Speakers the Segments name and those the Translation Glossary names. */
  private showSpeakers(segments: Segment[], glossarySpeakers: string[]): void {
    const speakers = new Set([
      ...segments.flatMap((segment) =>
        segment.speaker ? [segment.speaker] : [],
      ),
      ...glossarySpeakers,
    ]);
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

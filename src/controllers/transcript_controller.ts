import { Controller } from "@hotwired/stimulus";

import { save } from "../backend/dialog";
import {
  currentResource,
  exportPath,
  saveSrt,
  showTranslation,
  type ProjectFeed,
  type ProjectView,
  type Segment,
  type SrtContent,
} from "../backend/project";
import {
  createField,
  drawCursor,
  isField,
  isHeld,
  placeSelection,
  setFieldHeld,
  setFieldValue,
  type CursorField,
  type EditingSession,
  type FieldKind,
} from "../editor";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { iconElement } from "../ui/icons";
import { rememberChoice, rememberedChoice } from "../ui/choices";
import type { TaskKind } from "../ui/progress";
import { formatTime } from "../ui/time";

/** Where the webview remembers whether the editor follows playback. */
const FOLLOWING_KEY = "tsuzuri.transcript-following";

/** Ctrl+Alt+Enter, or ⌘+Option+Enter, splits a Segment at the Cursor in its text, as subtitle editors bind splitting to a modified line break. */
const SPLIT_SHORTCUTS = [
  "keydown.ctrl+alt+enter->field#split:!composing:prevent",
  "keydown.meta+alt+enter->field#split:!composing:prevent",
].join(" ");

/** The field of the text or the translation of a Segment, which hands the session what the user does in it. */
function editor(index: number, field: CursorField, value: string): HTMLElement {
  const element = createField(
    value,
    field === "translation" ? t("edit.untranslated") : "",
  );
  element.className = `field ${field}`;
  element.dataset.index = String(index);
  element.dataset.field = field;
  element.dataset.controller = "field";
  element.dataset.action =
    "focus->field#enter selectionchange@document->field#select compositionstart->field#startComposing compositionend->field#endComposing keydown.enter->field#enterNext:!composing:prevent keydown.shift+enter->field#breakLine:!composing:prevent keydown.esc->field#revert:!composing:prevent blur->field#leave";
  if (field === "text") element.dataset.action += ` ${SPLIT_SHORTCUTS}`;
  return element;
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

/** The Segment Changes one Segment offers, and translating it again into the translation shown, in a menu opened from its button. */
function changeMenu(index: number, isTranslationShown: boolean): HTMLElement {
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
  if (isTranslationShown) {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "retranslate";
    again.dataset.action = "retranslation#translateSegment";
    again.dataset.retranslationIndexParam = String(index);
    again.textContent = t("edit.retranslate");
    const choice = document.createElement("li");
    choice.append(again);
    menu.append(choice);
  }
  dropdown.append(opener, menu);
  return dropdown;
}

/** One row: its check, its times and Speaker, the text, and the translation when one is shown, even before it is made. */
function item(
  segment: Segment,
  index: number,
  isTranslationShown: boolean,
): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.action =
    "mousedown->transcript#checkThrough click->transcript#makeCurrent focusin->transcript#makeCurrent";
  li.dataset.transcriptIndexParam = String(index);
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "check checkbox checkbox-xs mt-1.5";
  check.dataset.index = String(index);
  check.dataset.action = "change->segment-changes#check";
  const heading = document.createElement("div");
  heading.className = "flex flex-col gap-1";
  heading.append(
    timeEditor(index, "start", segment.start_ms),
    timeEditor(index, "end", segment.end_ms),
    speakerMenu(index, segment.speaker ?? ""),
  );
  const editors = document.createElement("div");
  // The Cursor's caret is drawn within, beside the character it stands after
  editors.className = "list-col-grow relative";
  editors.append(editor(index, "text", segment.text));
  if (isTranslationShown)
    editors.append(editor(index, "translation", segment.translation ?? ""));
  li.append(check, heading, editors, changeMenu(index, isTranslationShown));
  return li;
}

export default class TranscriptController extends Controller {
  static targets = [
    "list",
    "emptyHint",
    "exportButton",
    "heading",
    "translationLanguage",
    "followButton",
  ];

  declare readonly listTarget: HTMLOListElement;
  declare readonly emptyHintTarget: HTMLElement;
  /** Names the Current Resource. */
  declare readonly headingTarget: HTMLElement;
  /** Which of the Current Resource's translations the editor shows, or none. */
  declare readonly translationLanguageTarget: HTMLSelectElement;
  /** Each export, enabled once the Project has the text it writes. */
  declare readonly exportButtonTargets: HTMLButtonElement[];
  /** Whether the editor scrolls to the row being played, pressed to turn it on or off. */
  declare readonly followButtonTarget: HTMLButtonElement;
  declare readonly hasFollowButtonTarget: boolean;

  declare readonly feed: ProjectFeed;
  declare readonly session: EditingSession;

  private unfollow?: () => void;
  /** The task running now, whose results the editor holds Placeholders for. */
  private runningTask: TaskKind | null = null;
  /** The Project shown now. */
  private project: ProjectView | null = null;
  /** The position of the Segment the Preview is playing. */
  private playingIndex: number | null = null;
  /** Whether the row being played is scrolled into view; turned off, the list stays where the user left it. */
  private isFollowing = rememberedChoice(FOLLOWING_KEY) !== "false";

  connect(): void {
    this.showFollowing();
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
  }

  followTask({ detail }: CustomEvent<{ task: TaskKind | null }>): void {
    this.runningTask = detail.task;
    this.show(this.feed.project);
  }

  /** Stands Placeholders in for the Segments of a Resource being read. */
  showLoading(): void {
    this.listTarget.replaceChildren(...placeholderRows());
    this.emptyHintTarget.hidden = true;
  }

  /**
   * Checks the Segments from the Current Segment through a row pressed with Shift, keeping the
   * focus where it is so the Current Segment stays the run's fixed end. Within the Current Segment,
   * Shift is left to extend the selection of its text.
   */
  checkThrough(event: MouseEvent & { params: { index: number } }): void {
    const start = this.runStart(event, event.params.index);
    if (start === null) return;
    event.preventDefault();
    this.session.checkRange(start, event.params.index);
  }

  /** Makes the Segment of a row current as the row is clicked or anything in it gets focus, unless the click checks a run. */
  makeCurrent(event: Event & { params: { index: number } }): void {
    if (this.runStart(event, event.params.index) !== null) {
      // Keeps a checkbox clicked from toggling the check the run just set
      event.preventDefault();
      return;
    }
    this.session.makeCurrent(event.params.index);
  }

  /** The Current Segment a run checked by `event` on row `index` starts from, or none unless Shift is held on another row. */
  private runStart(event: Event, index: number): number | null {
    const current = this.session.cursor.index;
    const isShiftHeld = event instanceof MouseEvent && event.shiftKey;
    return isShiftHeld && current !== index ? current : null;
  }

  /**
   * Marks the Current Segment and draws the Cursor in it, bringing its row into view; a live
   * Cursor in a field without focus, as after a split, takes the focus there.
   */
  showCursor(): void {
    const { index, caret } = this.session.cursor;
    this.markRows();
    if (index === null) return;
    this.rowAt(index)?.scrollIntoView({ block: "nearest" });
    const field = caret && this.fieldAt(index, caret.field);
    if (field && caret?.kind === "live" && document.activeElement !== field) {
      field.focus();
      placeSelection(field, caret);
    }
    this.drawCursor();
  }

  /** Checks the rows of the Checked Segments and no others. */
  showChecked(): void {
    const checkedIndexes = new Set(this.session.checkedIndexes);
    for (const check of this.listTarget.querySelectorAll<HTMLInputElement>(
      "input.check",
    ))
      check.checked = checkedIndexes.has(Number(check.dataset.index));
  }

  /** Marks the Segment the Preview is playing, keeping its row in view while following playback. */
  markPlaying({ detail }: CustomEvent<{ index: number | null }>): void {
    this.playingIndex = detail.index;
    this.markRows();
    this.scrollToPlaying();
  }

  /** Turns following playback on or off, catching up with the row being played as it comes on. */
  toggleFollowing(): void {
    this.isFollowing = !this.isFollowing;
    rememberChoice(FOLLOWING_KEY, String(this.isFollowing));
    this.showFollowing();
    this.scrollToPlaying();
  }

  private scrollToPlaying(): void {
    if (!this.isFollowing || this.playingIndex === null) return;
    this.rowAt(this.playingIndex)?.scrollIntoView({ block: "nearest" });
  }

  private showFollowing(): void {
    if (!this.hasFollowButtonTarget) return;
    this.followButtonTarget.setAttribute("aria-pressed", `${this.isFollowing}`);
    this.followButtonTarget.classList.toggle("btn-primary", this.isFollowing);
  }

  private drawCursor(): void {
    const { index, caret } = this.session.cursor;
    drawCursor(
      index === null || !caret ? null : this.fieldAt(index, caret.field),
      caret,
    );
  }

  private markRows(): void {
    const current = this.session.cursor.index;
    this.segmentRows().forEach((row, index) => {
      row.toggleAttribute("aria-current", index === current);
      row.toggleAttribute("data-is-playing", index === this.playingIndex);
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

  private fieldAt(index: number, field: CursorField): HTMLElement | null {
    return this.listTarget.querySelector<HTMLElement>(
      `.field[data-index="${index}"][data-field="${field}"]`,
    );
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
    this.showSegments(segments, isTranslationShown);
    this.holdFields();
    this.showChecked();
    this.drawCursor();
    const isAwaitingSegments =
      segments.length === 0 && this.runningTask === "transcription";
    if (isAwaitingSegments) this.showLoading();
    const hasTranslation = segments.some(
      (segment) => segment.translation !== undefined,
    );
    this.emptyHintTarget.hidden = segments.length > 0 || isAwaitingSegments;
    for (const target of this.exportButtonTargets) {
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
    const isSameShape =
      rows.length === segments.length && editors.length === values.length;
    if (!isSameShape) {
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
  private holdFields(): void {
    const view = this.session.transcript;
    for (const field of this.listTarget.querySelectorAll<
      HTMLInputElement | HTMLButtonElement | HTMLElement
    >('input, button, [role="button"], [contenteditable]')) {
      const kind: FieldKind = field.classList.contains("text")
        ? "text"
        : field.classList.contains("translation")
          ? "translation"
          : "other";
      const isFree = view === null || !isHeld(kind, view);
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
    if (this.runningTask === "transcription" && count > 0)
      this.listTarget.append(...placeholderRows(1));
  }
}

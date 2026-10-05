<!--
  @component
  One Segment's row: its check, its times and Speaker, the text, and the translation when one is
  shown, even before it is made, with the menu of the Segment Changes it offers, also opened by a
  right-click. The editor's comparison marks each field it compares and reads other translations
  beneath them. The fields are made by the editor and written here only while the user is not typing
  in them; a press in the row tells the session where it chose the Segment from.
-->
<script lang="ts">
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";

  import type { Segment } from "../backend/project";
  import { isMacOS } from "../backend/system";
  import {
    type ChoiceSource,
    createField,
    type CursorField,
    type FieldKind,
    isHeld,
    orderedTimes,
    setFieldHeld,
    setFieldValue,
    type TimeEdge,
    type TranscriptView,
  } from "../editor";
  import { t } from "../i18n";
  import { closeMenu } from "../ui/menu";
  import { notify } from "../ui/notification.svelte";
  import { shortcutById, shortcutText } from "../ui/shortcuts";
  import { speakerNames } from "../ui/speakers";
  import { formatTime, parseTime, TIME_FIELD_ACTIONS } from "../ui/time";
  import ComparisonMarks from "./ComparisonMarks.svelte";
  import { editingSession, projectFeed, segmentDialogs } from "./context";
  import EarlierText from "./EarlierText.svelte";
  import type { SegmentComparison, Side } from "./editor-comparison.svelte";
  import {
    change,
    checkedChoices,
    popUpChoices,
    type ResourceOffers,
    segmentChoices,
  } from "./segment-changes";
  import { notifyNamed } from "./speaker-actions";

  /** What a field hands the session as the user works in it. */
  const FIELD_ACTIONS =
    "focus->field#enter transcript:selection->field#select compositionstart->field#startComposing compositionend->field#endComposing keydown.enter->field#enterNext:!composing:prevent keydown.shift+enter->field#breakLine:!composing:prevent keydown.esc->field#revert:!composing:prevent blur->field#leave";

  /** Ctrl+Alt+Enter, or ⌘+Option+Enter, splits a Segment at the Cursor in its text, as subtitle editors bind splitting to a modified line break. */
  const SPLIT_SHORTCUTS =
    "keydown.ctrl+alt+enter->field#split:!composing:prevent keydown.meta+alt+enter->field#split:!composing:prevent";

  /** The side of the comparison each field shows the marks of. */
  const SIDE_BY_FIELD: Record<CursorField, Side> = {
    text: "original",
    translation: "translation",
  };

  let {
    segment,
    index,
    count,
    view,
    offers,
    isPending,
    isChecked,
    isCurrent,
    isPlaying,
    isTypingKept,
    comparison,
  }: {
    segment: Segment;
    index: number;
    /** How many Segments there are, so no merge is offered past either end. */
    count: number;
    /** The transcript as the session reads it, whose running Mode holds fields. */
    view: TranscriptView | null;
    /** What the Current Resource offers besides the Segment Changes, its translation shown among them. */
    offers: ResourceOffers;
    /** Whether the translation is of the Batch being translated, where the next ones land. */
    isPending: boolean;
    isChecked: boolean;
    isCurrent: boolean;
    isPlaying: boolean;
    /** Whether a field being typed in keeps its value, as the Segments keep their number. */
    isTypingKept: boolean;
    /** What the editor's comparison shows on this row. */
    comparison: SegmentComparison;
  } = $props();

  const feed = projectFeed();
  const session = editingSession();
  const dialogs = segmentDialogs();
  let row = $state<HTMLLIElement>();
  let startInput = $state<HTMLInputElement>();
  let endInput = $state<HTMLInputElement>();
  let newSpeakerInput = $state<HTMLInputElement>();
  /** The Speakers the Speaker menu offers, read from the Project each time it opens. */
  let offeredSpeakers = $state<string[]>([]);
  let fieldByKind: Partial<Record<CursorField, HTMLElement>> = {};
  /** The fields the row has, drawn anew only as the translation is shown or hidden. */
  const kinds: CursorField[] = untrack(() =>
    offers.isTranslationShown ? ["text", "translation"] : ["text"],
  );

  const isFree = (kind: FieldKind) =>
    view === null || !isHeld(kind, view, index);
  const isOtherHeld = $derived(!isFree("other"));
  const choices = $derived(
    segmentChoices(
      session,
      dialogs,
      { index, count, isHeld: isOtherHeld },
      offers,
    ),
  );
  const speaker = $derived(segment.speaker ?? "");
  const isMac = isMacOS();

  /** Brings the row into view, as it becomes current or is played while playback is followed. */
  export function bringIntoView(): void {
    row?.scrollIntoView({ block: "nearest" });
  }

  /** The row's text or translation field, or none for a translation not shown. */
  export function field(kind: CursorField): HTMLElement | null {
    return fieldByKind[kind] ?? null;
  }

  /** Writes `value` into `editor` unless the user is typing in it and it keeps what is typed. */
  function writeUnlessTyping(
    editor: HTMLElement | undefined,
    write: () => void,
  ): void {
    if (!editor) return;
    if (isTypingKept && editor === document.activeElement) return;
    write();
  }

  /**
   * Makes the row's field of `kind` once in its own host, where the Cursor's caret is drawn beside
   * it, and keeps it showing the Segment, held while a Mode writes it.
   */
  function attachField(kind: CursorField): Attachment<HTMLElement> {
    return (host) => {
      const element = createField(
        "",
        kind === "translation" ? t("edit.untranslated") : "",
      );
      element.className = `field ${kind}`;
      element.dataset.index = String(index);
      element.dataset.field = kind;
      element.dataset.controller = "field";
      element.dataset.action =
        kind === "text" ? `${FIELD_ACTIONS} ${SPLIT_SHORTCUTS}` : FIELD_ACTIONS;
      fieldByKind[kind] = element;
      host.append(element);
      $effect(() => {
        const value =
          kind === "text" ? segment.text : (segment.translation ?? "");
        writeUnlessTyping(element, () => setFieldValue(element, value));
        setFieldHeld(element, !isFree(kind));
        if (kind === "translation")
          element.classList.toggle("skeleton", isPending);
      });
      return () => {
        element.remove();
        delete fieldByKind[kind];
      };
    };
  }

  $effect(() => {
    const timeByInput: [HTMLInputElement | undefined, number][] = [
      [startInput, segment.start_ms],
      [endInput, segment.end_ms],
    ];
    for (const [input, ms] of timeByInput)
      writeUnlessTyping(input, () => (input!.value = formatTime(ms)));
  });

  /**
   * Where in the row a press of the pointer chooses its Segment from: its text or translation, a
   * time, its Speaker menu, or anywhere else; a press of another button opens a menu, as from
   * anywhere else.
   */
  function pressedSource({ button, target }: PointerEvent): ChoiceSource {
    if (button !== 0 || !(target instanceof Element)) return "row";
    if (target.closest(".speaker-menu")) return "speaker";
    if (target.closest(".field")) return "text";
    if (target.closest("[data-edge]")) return "time";
    return "row";
  }

  /** The Current Segment a run checked by `event` starts from, or none unless Shift is held on another row. */
  function runStart(event: Event): number | null {
    const current = session.cursor.index;
    const isShiftHeld = event instanceof MouseEvent && event.shiftKey;
    return isShiftHeld && current !== index ? current : null;
  }

  /**
   * Checks the Segments from the Current Segment through this row pressed with Shift, keeping the
   * focus where it is so the Current Segment stays the run's fixed end. Within the Current Segment,
   * Shift is left to extend the selection of its text.
   */
  function checkThrough(event: MouseEvent): void {
    const start = runStart(event);
    if (start === null) return;
    event.preventDefault();
    session.checkRange(start, index);
  }

  /** Makes the Segment current as the row is clicked or anything in it gets focus, unless the click checks a run. */
  function makeCurrent(event: Event): void {
    if (runStart(event) !== null) {
      // Keeps a checkbox clicked from toggling the check the run just set
      event.preventDefault();
      return;
    }
    const isSpeakerMenu =
      event.target instanceof Element &&
      event.target.closest(".speaker-menu") !== null;
    session.makeCurrent(index, isSpeakerMenu ? "speaker" : undefined);
  }

  /** Asks for the times typed, `edge` the one just changed; a time that cannot be read is put back. */
  async function changeTimes(edge: TimeEdge): Promise<void> {
    const startMs = parseTime(startInput?.value ?? "");
    const endMs = parseTime(endInput?.value ?? "");
    if (startMs === null || endMs === null) {
      notify({ title: t("edit.unreadableTime"), kind: "warning" });
      await feed.refresh();
      return;
    }
    await change(session, {
      kind: "times",
      index,
      ...orderedTimes(edge, startMs, endMs),
    });
  }

  /**
   * Opens what the row's menu offers, or what the checked bar offers while some Segments are
   * checked, as a menu of the system beside the pointer.
   */
  async function openMenu(event: MouseEvent): Promise<void> {
    makeCurrent(event);
    event.preventDefault();
    const indexes = session.checkedIndexes;
    await popUpChoices(
      indexes.length > 0
        ? checkedChoices(session, dialogs, indexes, offers)
        : choices,
      event.target,
    );
  }

  /** Lists every Speaker named as the Speaker menu opens, with no new name typed yet. */
  function listSpeakers(): void {
    offeredSpeakers = speakerNames(feed.project);
    if (newSpeakerInput) newSpeakerInput.value = "";
  }

  /** Writes `name` as the Segment's Speaker, closing the Speaker menu `item` was chosen from; an empty name clears it. */
  async function writeSpeaker(
    item: EventTarget | null,
    name: string,
  ): Promise<void> {
    closeMenu(item);
    notifyNamed(feed, await session.editText(index, "speaker", name), name);
  }

  /** Names the Segment's Speaker as typed, once Enter is pressed; a key the input method is still composing with stays its own. */
  function nameSpeaker(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229)
      return;
    event.preventDefault();
    const input = event.currentTarget as HTMLInputElement;
    const name = input.value.trim();
    if (name !== "") void writeSpeaker(input, name);
  }
</script>

{#snippet choiceLabel(label: string, shortcutId?: string)}
  {@const shortcut = shortcutById(shortcutId ?? "")}
  {label}{#if shortcut}<kbd class="kbd kbd-xs ms-auto"
      >{shortcutText(shortcut, isMac)}</kbd
    >{/if}
{/snippet}

<!-- The keyboard chooses a row by moving focus into it, which focusin takes -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<li
  class="@max-4xl:grid-cols-[auto_1fr_auto]"
  aria-current={isCurrent ? "true" : undefined}
  data-is-playing={isPlaying ? "" : undefined}
  onpointerdown={(event) => session.pointAt(pressedSource(event))}
  onmousedown={checkThrough}
  onclick={makeCurrent}
  onfocusin={makeCurrent}
  oncontextmenu={openMenu}
  bind:this={row}
>
  <input
    type="checkbox"
    class="check checkbox checkbox-xs mt-1.5"
    checked={isChecked}
    onchange={({ currentTarget }) =>
      session.check(index, currentTarget.checked)}
    disabled={isOtherHeld}
  />
  <div class="flex flex-col gap-1 @max-4xl:flex-row @max-4xl:items-center">
    <input
      class="start input input-xs w-28 font-mono"
      data-edge="start"
      data-controller="time-field"
      data-action={TIME_FIELD_ACTIONS}
      disabled={isOtherHeld}
      onchange={() => changeTimes("start")}
      bind:this={startInput}
    />
    <input
      class="end input input-xs w-28 font-mono"
      data-edge="end"
      data-controller="time-field"
      data-action={TIME_FIELD_ACTIONS}
      disabled={isOtherHeld}
      onchange={() => changeTimes("end")}
      bind:this={endInput}
    />
    <div class="speaker-menu dropdown">
      <div
        tabindex={isOtherHeld ? -1 : 0}
        role="button"
        class={[
          "speaker btn btn-xs w-28 justify-start truncate font-normal",
          speaker === "" && "text-base-content/40",
          isOtherHeld && "btn-disabled",
        ]}
        data-field="speaker"
        onfocus={listSpeakers}
      >
        {speaker || t("edit.speaker")}
      </div>
      <!-- A focus dropdown stays open only while focus is inside, so a click on the card keeps it -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        tabindex="0"
        class="dropdown-content card card-sm z-10 w-48 bg-base-100 shadow-md"
      >
        <div class="card-body gap-1 p-2">
          <input
            class="new-speaker input input-xs"
            placeholder={t("edit.newSpeakerName")}
            onkeydown={nameSpeaker}
            disabled={isOtherHeld}
            bind:this={newSpeakerInput}
          />
          <ul class="speakers menu menu-sm w-full p-0">
            {#each offeredSpeakers as name (name)}
              <li>
                <button
                  type="button"
                  class={[name === speaker && "menu-active"]}
                  onclick={({ currentTarget }) =>
                    writeSpeaker(currentTarget, name)}>{name}</button
                >
              </li>
            {/each}
            {#if speaker !== ""}
              <li>
                <button
                  type="button"
                  onclick={({ currentTarget }) =>
                    writeSpeaker(currentTarget, "")}
                  >{t("edit.clearSpeaker")}</button
                >
              </li>
            {/if}
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div
    class="list-col-grow @max-4xl:col-start-2 @max-4xl:col-end-4 @max-4xl:row-start-2"
  >
    {#each kinds as kind (kind)}
      {@const sideRows = comparison.rowsBySide[SIDE_BY_FIELD[kind]]}
      {#each sideRows as sideRow (sideRow.index)}
        <ComparisonMarks {sideRow} />
      {/each}
      <!-- The Cursor's caret is drawn within, beside the character it stands after -->
      <div class="relative" {@attach attachField(kind)}></div>
      {#each sideRows as { row, index } (index)}
        {#if row.kind !== "pair" || row.is_text_changed}
          <EarlierText {row} />
        {/if}
      {/each}
    {/each}
    {#each comparison.references as { language, text } (language)}
      <p
        class="flex items-baseline gap-2 px-1.5 text-sm text-base-content/70"
        data-reference={language}
      >
        <span class="badge badge-ghost badge-xs">{language}</span>
        <span data-cue>{text}</span>
      </p>
    {/each}
  </div>
  <div class="dropdown dropdown-left">
    <div
      tabindex={isOtherHeld ? -1 : 0}
      role="button"
      class={["btn btn-square btn-ghost btn-xs", isOtherHeld && "btn-disabled"]}
      aria-label={t("edit.changes")}
    >
      <EllipsisVertical class="size-4" aria-hidden="true" />
    </div>
    <ul
      tabindex="-1"
      class="change-menu menu dropdown-content z-10 w-60 rounded-box bg-base-100 shadow-md"
    >
      {#each choices as choice (choice.id)}
        <li>
          <button
            type="button"
            class={choice.id}
            data-shortcut={choice.shortcut}
            disabled={!choice.isEnabled}
            onclick={({ currentTarget }) => {
              closeMenu(currentTarget);
              void choice.run();
            }}
          >
            {@render choiceLabel(choice.label, choice.shortcut)}
          </button>
        </li>
      {/each}
    </ul>
  </div>
</li>

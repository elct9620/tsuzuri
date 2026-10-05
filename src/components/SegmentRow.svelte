<!--
  @component
  One Segment's row: its check, its times and Speaker, the text, and the translation when one is
  shown, even before it is made, with the menu of the Segment Changes it offers. The fields are made
  by the editor and written here only while the user is not typing in them; a press in the row tells
  the session where it chose the Segment from.
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
    runWithNeighbour,
    setFieldHeld,
    setFieldValue,
    type TranscriptView,
  } from "../editor";
  import { t } from "../i18n";
  import { shortcutById, shortcutText } from "../ui/shortcuts";
  import { formatTime, TIME_FIELD_ACTIONS } from "../ui/time";
  import { editingSession } from "./context";

  /** What a field hands the session as the user works in it. */
  const FIELD_ACTIONS =
    "focus->field#enter transcript:selection->field#select compositionstart->field#startComposing compositionend->field#endComposing keydown.enter->field#enterNext:!composing:prevent keydown.shift+enter->field#breakLine:!composing:prevent keydown.esc->field#revert:!composing:prevent blur->field#leave";

  /** Ctrl+Alt+Enter, or ⌘+Option+Enter, splits a Segment at the Cursor in its text, as subtitle editors bind splitting to a modified line break. */
  const SPLIT_SHORTCUTS =
    "keydown.ctrl+alt+enter->field#split:!composing:prevent keydown.meta+alt+enter->field#split:!composing:prevent";

  /** The Segment Changes of the row's menu: the action each runs, its label and its shortcut. */
  const CHANGE_CHOICES: [string, string, string?][] = [
    ["insertBefore", "edit.insertAbove"],
    ["insertAfter", "edit.insertBelow"],
    ["split", "edit.split", "split"],
    ["mergeWithPrevious", "edit.mergeWithPrevious", "mergeWithPrevious"],
    ["mergeWithNext", "edit.mergeWithNext", "mergeWithNext"],
    ["delete", "edit.delete", "delete"],
  ];

  let {
    segment,
    index,
    count,
    view,
    isTranslationShown,
    isPending,
    hasMedia,
    isChecked,
    isCurrent,
    isPlaying,
    isTypingKept,
  }: {
    segment: Segment;
    index: number;
    /** How many Segments there are, so no merge is offered past either end. */
    count: number;
    /** The transcript as the session reads it, whose running Mode holds fields. */
    view: TranscriptView | null;
    isTranslationShown: boolean;
    /** Whether the translation is of the Batch being translated, where the next ones land. */
    isPending: boolean;
    hasMedia: boolean;
    isChecked: boolean;
    isCurrent: boolean;
    isPlaying: boolean;
    /** Whether a field being typed in keeps its value, as the Segments keep their number. */
    isTypingKept: boolean;
  } = $props();

  const session = editingSession();
  let row = $state<HTMLLIElement>();
  let startInput = $state<HTMLInputElement>();
  let endInput = $state<HTMLInputElement>();
  let fieldByKind: Partial<Record<CursorField, HTMLElement>> = {};

  const isFree = (kind: FieldKind) =>
    view === null || !isHeld(kind, view, index);
  const isOtherHeld = $derived(!isFree("other"));
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

  /** Makes the row's fields once and keeps them showing the Segment, held while a Mode writes it. */
  const fields: Attachment<HTMLElement> = (editors) => {
    const kinds: CursorField[] = untrack(() =>
      isTranslationShown ? ["text", "translation"] : ["text"],
    );
    for (const kind of kinds) {
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
      editors.append(element);
    }
    $effect(() => {
      const value: Record<CursorField, string> = {
        text: segment.text,
        translation: segment.translation ?? "",
      };
      for (const kind of kinds) {
        const element = fieldByKind[kind]!;
        writeUnlessTyping(element, () => setFieldValue(element, value[kind]));
        setFieldHeld(element, !isFree(kind));
      }
      fieldByKind.translation?.classList.toggle("skeleton", isPending);
    });
    return () => {
      for (const element of Object.values(fieldByKind)) element.remove();
      fieldByKind = {};
    };
  };

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
</script>

{#snippet choiceLabel(label: string, shortcutId?: string)}
  {@const shortcut = shortcutById(shortcutId ?? "")}
  {t(label)}{#if shortcut}<kbd class="kbd kbd-xs ms-auto"
      >{shortcutText(shortcut, isMac)}</kbd
    >{/if}
{/snippet}

<!-- The keyboard chooses a row by moving focus into it, which focusin takes -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<li
  class="@max-4xl:grid-cols-[auto_1fr_auto]"
  aria-current={isCurrent ? "true" : undefined}
  data-is-playing={isPlaying ? "" : undefined}
  data-action="contextmenu->segment-changes#openMenu:prevent"
  onpointerdown={(event) => session.pointAt(pressedSource(event))}
  onmousedown={checkThrough}
  onclick={makeCurrent}
  onfocusin={makeCurrent}
  oncontextmenu={makeCurrent}
  bind:this={row}
>
  <input
    type="checkbox"
    class="check checkbox checkbox-xs mt-1.5"
    data-index={index}
    data-action="change->segment-changes#check"
    checked={isChecked}
    disabled={isOtherHeld}
  />
  <div class="flex flex-col gap-1 @max-4xl:flex-row @max-4xl:items-center">
    <input
      class="start input input-xs w-28 font-mono"
      data-index={index}
      data-edge="start"
      data-controller="time-field"
      data-action="change->segment-changes#changeTimes {TIME_FIELD_ACTIONS}"
      disabled={isOtherHeld}
      bind:this={startInput}
    />
    <input
      class="end input input-xs w-28 font-mono"
      data-index={index}
      data-edge="end"
      data-controller="time-field"
      data-action="change->segment-changes#changeTimes {TIME_FIELD_ACTIONS}"
      disabled={isOtherHeld}
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
        data-action="focus->speakers#list"
        data-speakers-index-param={index}
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
            data-action="keydown.enter->speakers#name:!composing:prevent"
            data-speakers-index-param={index}
            disabled={isOtherHeld}
          />
          <ul class="speakers menu menu-sm w-full p-0"></ul>
        </div>
      </div>
    </div>
  </div>
  <!-- The Cursor's caret is drawn within, beside the character it stands after -->
  <div
    class="list-col-grow relative @max-4xl:col-start-2 @max-4xl:col-end-4 @max-4xl:row-start-2"
    {@attach fields}
  ></div>
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
      {#each CHANGE_CHOICES as [action, label, shortcutId] (action)}
        <li
          hidden={(action === "mergeWithPrevious" &&
            runWithNeighbour(index, "previous", count) === null) ||
            (action === "mergeWithNext" &&
              runWithNeighbour(index, "next", count) === null)}
        >
          <button
            type="button"
            class={action}
            data-index={index}
            data-action="segment-changes#{action}"
            data-shortcut={shortcutId}
            disabled={isOtherHeld}
          >
            {@render choiceLabel(label, shortcutId)}
          </button>
        </li>
      {/each}
      {#if isTranslationShown}
        <li>
          <button
            type="button"
            class="retranslate"
            data-index={index}
            data-action="segment-changes#retranslateSegment"
            disabled={isOtherHeld}
          >
            {t("edit.retranslate")}
          </button>
        </li>
      {/if}
      <li hidden={!hasMedia}>
        <button
          type="button"
          class="retranscribe"
          data-index={index}
          data-action="segment-changes#retranscribeRest"
          disabled={isOtherHeld}
        >
          {t("edit.retranscribeRest")}
        </button>
      </li>
      <li data-cleanup-target="segmentChoice">
        <button
          type="button"
          class="cleanup"
          data-action="cleanup#cleanSegment"
          data-cleanup-index-param={index}
          data-shortcut="cleanup"
          disabled={isOtherHeld}
        >
          {@render choiceLabel("cleanup.action", "cleanup")}
        </button>
      </li>
    </ul>
  </div>
</li>

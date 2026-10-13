<!--
  @component
  One text or translation field of a Segment, handing the session what the user does in it:
  entering it, moving the selection, leaving it or giving up its typing, and splitting its Segment
  by shortcut; its keys also break a line and move on to the next Segment. It draws the Cursor the
  session holds in it, and its own Glossary Marks and compared additions until it is typed in, so a
  read redraws the marks of only the fields it changed. Its text is written with the editor's
  `setFieldValue` and never bound, and only while the user is not typing in it.
-->
<script lang="ts">
  import type {
    ComparedRow,
    GlossaryMark,
    GlossaryMarkKind,
  } from "#/ipc/project.ts";
  import { isMacOS } from "#/ipc/system.ts";
  import {
    type CaretPlace,
    caretPlace,
    type CursorField,
    cursorMark,
    fieldSelection,
    fieldValue,
    insertLineBreak,
    markOwnRanges,
    setFieldValue,
    textStaticRange,
  } from "#/editor/index.ts";
  import { notifyEdit } from "#/state/notification.svelte.ts";
  import { isComposingKey, isShortcut } from "#/ui/shortcuts.ts";
  import {
    editingSession,
    editingState,
    segmentFields,
  } from "#/state/context.ts";

  /** The highlight marking the characters a text gained since the Backup compared. */
  const ADDED_HIGHLIGHT = "compare-addition";

  /** The highlight each kind of Glossary Mark is drawn under. */
  const GLOSSARY_HIGHLIGHT: Record<GlossaryMarkKind, string> = {
    term: "glossary-term",
    candidate: "glossary-candidate",
  };
  const GLOSSARY_KINDS = Object.keys(GLOSSARY_HIGHLIGHT) as GlossaryMarkKind[];

  /** The ranges of `field` holding the characters a row's text gained, while the field still reads that text. */
  function addedRanges(field: HTMLElement, row: ComparedRow): StaticRange[] {
    const keptSpans = row.text_spans.filter((span) => span.kind !== "removal");
    if (keptSpans.map((span) => span.text).join("") !== fieldValue(field))
      return [];
    const ranges: StaticRange[] = [];
    let offset = 0;
    for (const span of keptSpans) {
      const end = offset + span.text.length;
      const range =
        span.kind === "addition" ? textStaticRange(field, offset, end) : null;
      if (range) ranges.push(range);
      offset = end;
    }
    return ranges;
  }

  interface Props {
    index: number;
    kind: CursorField;
    /** The Segment's text or translation, written in unless the user is typing and it is kept. */
    value: string;
    placeholder?: string;
    /** The Glossary Marks found in the field's value, underlined while the field still reads it. */
    glossaryMarks?: GlossaryMark[];
    /** The rows of the comparison covering the field, whose added characters it marks. */
    comparedRows?: ComparedRow[];
    /** Whether a running Mode holds the field from typing. */
    isHeld: boolean;
    /** Whether the field waits for a translation being made. */
    isPending?: boolean;
    /** Whether a field being typed in keeps its value, as the Segments keep their number. */
    isTypingKept: boolean;
    /** The field's element. */
    element?: HTMLElement;
  }

  let {
    index,
    kind,
    value,
    placeholder,
    isHeld,
    isPending = false,
    isTypingKept,
    glossaryMarks = [],
    comparedRows = [],
    element = $bindable(),
  }: Props = $props();

  const session = editingSession();
  const editing = editingState();
  const fields = segmentFields();
  const isMac = isMacOS();

  /** The caret of the Cursor while it is in this field, or none. */
  const caret = $derived.by(() => {
    const { index: cursorIndex, caret: cursorCaret } = editing.cursor;
    return cursorIndex === index && cursorCaret?.field === kind
      ? cursorCaret
      : null;
  });
  const isRange = $derived(caret !== null && caret.start !== caret.end);
  /** Where the caret mark stands, measured from the text as it is laid out. */
  let drawnCaret = $state.raw<CaretPlace | null>(null);

  // Measures where the caret stands, again whenever the field or what is drawn beside it in its row
  // moves the text
  $effect(() => {
    const field = element;
    if (!field || !caret || isRange) {
      drawnCaret = null;
      return;
    }
    const measure = () => (drawnCaret = caretPlace(field, caret));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const target of [field, field.parentElement])
      if (target) observer.observe(target);
    return () => observer.disconnect();
  });

  /** Whether an input method is composing, or has only just ended composing, in the field. */
  let hasComposition = false;

  $effect(() => {
    if (!element) return;
    // Read only for the field with focus, so a change to it writes no other field again
    if (element !== document.activeElement || !isTypingKept)
      setFieldValue(element, value);
  });

  /** What the field's marks were last drawn from, so a read changing none of it redraws none. */
  let drawnMarks = "";

  // Underlines the Glossary Marks while the field still reads the text they were found in, and
  // marks the characters each compared text gained; each field draws its own marks, so a read
  // redraws only those of the fields it changed
  $effect(() => {
    if (!element) return;
    const field = element;
    const isRead = fieldValue(field) === value;
    const marks = JSON.stringify([value, isRead, glossaryMarks, comparedRows]);
    if (marks === drawnMarks) return;
    drawnMarks = marks;
    for (const markKind of GLOSSARY_KINDS) {
      const kindMarks = isRead
        ? glossaryMarks.filter((mark) => mark.kind === markKind)
        : [];
      markOwnRanges(
        GLOSSARY_HIGHLIGHT[markKind],
        field,
        kindMarks.flatMap(
          (mark) => textStaticRange(field, mark.start, mark.end) ?? [],
        ),
      );
    }
    markOwnRanges(
      ADDED_HIGHLIGHT,
      field,
      comparedRows.flatMap((row) => addedRanges(field, row)),
    );
  });

  /** Takes the field's marks away, as they count characters of a text it no longer reads. */
  function forgetMarks(field: HTMLElement): void {
    for (const name of [...Object.values(GLOSSARY_HIGHLIGHT), ADDED_HIGHLIGHT])
      markOwnRanges(name, field, []);
    drawnMarks = "";
  }

  // Takes the field's marks away with it
  $effect(() => {
    const field = element;
    return () => {
      if (field) forgetMarks(field);
    };
  });

  /** Follows the selection while the field has focus, as the rows hand it each change. */
  export function select(): void {
    if (!element || document.activeElement !== element) return;
    const range = fieldSelection(element);
    if (range) session.select(index, kind, range, fieldValue(element));
  }

  function enter(): void {
    session.enter(index, kind, fieldSelection(element!), fieldValue(element!));
  }

  /** Hands over where the Cursor was left and the text. */
  async function leave(): Promise<void> {
    notifyEdit(
      await session.leave(
        index,
        kind,
        fieldSelection(element!),
        fieldValue(element!),
      ),
    );
  }

  /** Stays composing until the next task, so the key that ended the composition still counts as its. */
  function endComposing(): void {
    setTimeout(() => (hasComposition = false), 0);
  }

  function pressKey(event: KeyboardEvent): void {
    if (hasComposition || isComposingKey(event)) return;
    if (isShortcut(event, "next", isMac)) {
      event.preventDefault();
      enterNext();
    } else if (isShortcut(event, "lineBreak", isMac)) {
      event.preventDefault();
      // A line break is a character of the text rather than markup
      insertLineBreak();
    } else if (isShortcut(event, "revert", isMac)) {
      event.preventDefault();
      revert();
    } else if (kind === "text" && isShortcut(event, "split", isMac)) {
      event.preventDefault();
      void split();
    }
  }

  /**
   * Enters the same field of the next Segment, or leaves the field after the last; leaving writes
   * the text as a click elsewhere does.
   */
  function enterNext(): void {
    const next = fields.field(index + 1, kind);
    if (next) session.chooseFrom("next", () => next.focus());
    else element!.blur();
  }

  /** Puts back the text the field was entered with and leaves it, so nothing is written and no Cursor kept. */
  function revert(): void {
    const text = session.revert(index, kind);
    if (text === null) return;
    setFieldValue(element!, text);
    element!.blur();
  }

  /** Splits the Segment where the Cursor in its text starts. */
  async function split(): Promise<void> {
    select();
    notifyEdit(await session.split(), { refusal: "edit.splitWhere" });
  }
</script>

<!-- Being editable makes the field focusable, so a held field leaves the tab order as a disabled control does -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  bind:this={element}
  class={["field", kind, isPending && "skeleton"]}
  contenteditable={isHeld ? "false" : "plaintext-only"}
  role="textbox"
  aria-multiline="true"
  aria-disabled={isHeld}
  data-index={index}
  data-field={kind}
  data-placeholder={placeholder}
  data-cursor={caret === null ? undefined : cursorMark(caret)}
  data-has-kept-cursor={caret?.kind === "kept" ? "" : undefined}
  onfocus={enter}
  onblur={leave}
  oncompositionstart={() => (hasComposition = true)}
  oncompositionend={endComposing}
  onkeydown={pressKey}
  oninput={({ currentTarget }) => forgetMarks(currentTarget)}
></div>
{#if drawnCaret}
  <span
    aria-hidden="true"
    class={[
      "cursor-caret pointer-events-none absolute w-0.5 bg-base-content",
      caret?.kind === "live" && "animate-blink",
    ]}
    style:left="{drawnCaret.left}px"
    style:top="{drawnCaret.top}px"
    style:height="{drawnCaret.height}px"
  ></span>
{/if}

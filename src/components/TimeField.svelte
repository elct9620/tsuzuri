<!--
  @component
  One time field of the editor, typed as Aegisub's time field is in its overwrite mode: a digit
  overwrites the one at the caret, a separator typed moves past the one there, Backspace steps back
  without removing anything, and no other key changes the text, so a time never loses its shape.
  Typing goes through the browser's editing, so `change` still writes the time and undo still takes
  it back.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  import { isComposingKey } from "../ui/shortcuts";
  import {
    caretPastSeparator,
    formatTime,
    parseTime,
    typedTime,
  } from "../ui/time";

  interface Props extends HTMLInputAttributes {
    /** The field's element, which the row writes the Segment's time into. */
    input?: HTMLInputElement;
  }

  let { input = $bindable(), ...attributes }: Props = $props();

  /** The keys that move the caret past a separator rather than type one. */
  const SEPARATOR_KEYS = [":", ";", ".", ","];

  /** The time and caret an input method began composing over, put back once it ends. */
  let timeBeforeComposition = "";
  let caretBeforeComposition = 0;

  /** Keeps the time an input method is about to compose over. */
  function keepTime({
    currentTarget,
  }: {
    currentTarget: HTMLInputElement;
  }): void {
    timeBeforeComposition = currentTarget.value;
    caretBeforeComposition = currentTarget.selectionStart ?? 0;
  }

  /** Takes back what an input method composed, so only the keys of a time change it. */
  function restoreTime({
    currentTarget,
  }: {
    currentTarget: HTMLInputElement;
  }): void {
    const caret = caretBeforeComposition;
    currentTarget.value = timeBeforeComposition;
    currentTarget.setSelectionRange(caret, caret);
  }

  /** Types a key into the time, unless an input method is composing with it. */
  function typeKey(
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
  ): void {
    if (isComposingKey(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const field = event.currentTarget;
    const at = field.selectionStart ?? 0;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const typedResult = typedTime(field.value, at, event.key);
      if (typedResult)
        replaceTime(
          field,
          typedResult.time,
          typedResult.caret,
          typedResult.caret,
        );
    } else if (SEPARATOR_KEYS.includes(event.key)) {
      event.preventDefault();
      const caret = caretPastSeparator(field.value, at);
      field.setSelectionRange(caret, caret);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      const caret = Math.max(at - 1, 0);
      field.setSelectionRange(caret, caret);
    } else if (event.key === "Delete" || event.key.length === 1) {
      event.preventDefault();
    }
  }

  /** Puts a pasted time in place of the whole field, selected; text that is no time is left out. */
  function pasteTime(
    event: ClipboardEvent & { currentTarget: HTMLInputElement },
  ): void {
    event.preventDefault();
    const ms = parseTime(event.clipboardData?.getData("text/plain") ?? "");
    if (ms === null) return;
    const time = formatTime(ms);
    replaceTime(event.currentTarget, time, 0, time.length);
  }

  /** Copies the selection without removing it, as a time keeps every digit. */
  function copySelection(
    event: ClipboardEvent & { currentTarget: HTMLInputElement },
  ): void {
    event.preventDefault();
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    event.clipboardData?.setData(
      "text/plain",
      value.slice(selectionStart ?? 0, selectionEnd ?? 0),
    );
  }

  /** Writes `time` over the whole field through the browser's editing, then selects `start` to `end`. */
  function replaceTime(
    field: HTMLInputElement,
    time: string,
    start: number,
    end: number,
  ): void {
    field.select();
    document.execCommand("insertText", false, time);
    field.setSelectionRange(start, end);
  }
</script>

<input
  {...attributes}
  bind:this={input}
  onkeydown={typeKey}
  onpaste={pasteTime}
  oncut={copySelection}
  oncompositionstart={keepTime}
  oncompositionend={restoreTime}
/>

<!--
  @component
  The search bar: finds what is typed in the Current Resource's original or the translation it
  shows, as Rust reads it, marks every match and moves from one to the next, making its Segment
  current. It searches again whenever the Segment rows are shown anew while it is open.
-->
<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import { flushSync, onDestroy } from "svelte";

  import { findText, type TextMatch } from "../backend/editing";
  import { isMacOS } from "../backend/system";
  import { type CursorField, markRanges, rangeOf } from "../editor";
  import { t } from "../i18n";
  import { failureMessage } from "../ui/failure";
  import { isShortcut } from "../ui/shortcuts";
  import { selectedText } from "../ui/text-fields";
  import { editingSession, projectFeed } from "./context";

  /** The highlight every match is marked under, and the one the current match is. */
  const MATCH_HIGHLIGHT = "search-match";
  const CURRENT_MATCH_HIGHLIGHT = "search-current";

  const feed = projectFeed();
  const session = editingSession();
  let patternInput = $state<HTMLInputElement>();
  let isOpen = $state(false);
  let pattern = $state("");
  let field = $state<CursorField>("text");
  let isRegex = $state(false);
  /** Whether a translation is shown to search in, as of opening. */
  let hasTranslation = $state(false);
  let matches = $state<TextMatch[]>([]);
  let currentPosition = $state(0);
  /** Why the last search found nothing, when Rust could not read it. */
  let failure = $state<string | null>(null);
  /** The search asked for last, so an answer to an older one is dropped. */
  let searchNumber = 0;

  /** Which match is current out of how many, or why nothing is found. */
  const count = $derived(
    failure ??
      (matches.length === 0
        ? t("search.nothing")
        : `${currentPosition + 1}/${matches.length}`),
  );

  /** How far `event` moves between matches: one on, one back, or 0 for any other key. */
  function matchStep(event: KeyboardEvent): number {
    const isMac = isMacOS();
    if (isShortcut(event, "searchNext", isMac)) return 1;
    if (isShortcut(event, "searchPrevious", isMac)) return -1;
    return 0;
  }

  /** Opens the bar by the search shortcut while a Project is open, and moves between matches while it is open. */
  function followShortcut(event: KeyboardEvent): void {
    if (isShortcut(event, "search", isMacOS()) && feed.project !== null) {
      event.preventDefault();
      open();
      return;
    }
    const step = matchStep(event);
    if (step === 0 || !isOpen) return;
    event.preventDefault();
    moveBy(step);
  }

  /** Opens the bar looking for the range the Cursor selects, if any. */
  export function open(): void {
    const selection = selectedText(session.cursor);
    if (selection !== "") pattern = selection;
    hasTranslation = Boolean(session.transcript?.shownTranslation);
    if (!hasTranslation) field = "text";
    isOpen = true;
    flushSync();
    patternInput?.focus();
    patternInput?.select();
    void search();
  }

  /** Closes the bar and takes its marks away. */
  function close(): void {
    isOpen = false;
    matches = [];
    unmark();
  }

  /** Looks for what is typed from the first match on. */
  async function search(): Promise<void> {
    currentPosition = 0;
    await findMatches();
  }

  /** Moves by Enter or back by Shift+Enter, and closes by Esc, unless the key ends a composition. */
  function followPatternKey(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Enter") moveBy(event.shiftKey ? -1 : 1);
    else if (event.key === "Escape") close();
    else return;
    event.preventDefault();
  }

  /** Searches again while open, as the Segment rows are shown anew. */
  function follow(): void {
    if (isOpen) void findMatches();
  }

  function moveBy(step: number): void {
    if (!isOpen || matches.length === 0) return;
    const total = matches.length;
    currentPosition = (currentPosition + step + total) % total;
    session.makeCurrent(matches[currentPosition].index, "search");
    mark();
  }

  async function findMatches(): Promise<void> {
    const number = ++searchNumber;
    failure = null;
    if (pattern === "") {
      matches = [];
      mark();
      return;
    }
    try {
      const answer = await findText(field, { pattern, is_regex: isRegex });
      if (number !== searchNumber) return;
      matches = answer;
      currentPosition = Math.min(
        currentPosition,
        Math.max(answer.length - 1, 0),
      );
      mark();
    } catch (error) {
      if (number !== searchNumber) return;
      matches = [];
      unmark();
      failure = failureMessage(error);
    }
  }

  /** Marks every match and the current one. */
  function mark(): void {
    const ranges = matches.map((match) => matchRange(match));
    markRanges(
      MATCH_HIGHLIGHT,
      ranges.filter((range): range is Range => range !== null),
    );
    const currentRange = ranges[currentPosition];
    markRanges(CURRENT_MATCH_HIGHLIGHT, currentRange ? [currentRange] : []);
  }

  function unmark(): void {
    markRanges(MATCH_HIGHLIGHT, []);
    markRanges(CURRENT_MATCH_HIGHLIGHT, []);
  }

  /** The Range a match covers in its field, or none while its row is not drawn. */
  function matchRange({ index, start, end }: TextMatch): Range | null {
    const element = document.querySelector<HTMLElement>(
      `.field[data-index="${index}"][data-field="${field}"]`,
    );
    return element ? rangeOf(element, { start, end }) : null;
  }

  onDestroy(unmark);
</script>

<svelte:window onkeydown={followShortcut} ontranscript:shown={follow} />

{#if isOpen}
  <div
    class="flex flex-wrap items-center gap-2 rounded-box bg-base-200 px-3 py-1.5 text-sm"
  >
    <div class="join">
      <label class="input input-sm join-item">
        <Search class="size-4 opacity-50" />
        <input
          type="search"
          class="grow"
          aria-label={t("search.pattern")}
          bind:this={patternInput}
          value={pattern}
          oninput={({ currentTarget }) => {
            pattern = currentTarget.value;
            void search();
          }}
          onkeydown={followPatternKey}
        />
        <span class="text-xs text-base-content/60 tabular-nums" role="status"
          >{count}</span
        >
      </label>
      <button
        type="button"
        class="btn btn-sm btn-square join-item"
        aria-label={t("search.previous")}
        data-shortcut="searchPrevious"
        onclick={() => moveBy(-1)}
      >
        <ChevronUp class="size-4" />
      </button>
      <button
        type="button"
        class="btn btn-sm btn-square join-item"
        aria-label={t("search.next")}
        data-shortcut="searchNext"
        onclick={() => moveBy(1)}
      >
        <ChevronDown class="size-4" />
      </button>
    </div>
    <div class="join">
      <input
        type="radio"
        name="search-field"
        value="text"
        class="btn btn-sm join-item"
        aria-label={t("replace.original")}
        checked={field === "text"}
        onchange={() => {
          field = "text";
          void search();
        }}
      />
      <input
        type="radio"
        name="search-field"
        value="translation"
        class="btn btn-sm join-item"
        aria-label={t("replace.translation")}
        disabled={!hasTranslation}
        checked={field === "translation"}
        onchange={() => {
          field = "translation";
          void search();
        }}
      />
    </div>
    <label class="label">
      <input
        type="checkbox"
        class="checkbox checkbox-xs"
        checked={isRegex}
        onchange={({ currentTarget }) => {
          isRegex = currentTarget.checked;
          void search();
        }}
      />
      <span>{t("replace.regex")}</span>
    </label>
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square ms-auto"
      aria-label={t("search.close")}
      onclick={close}
    >
      <X class="size-4" />
    </button>
  </div>
{/if}

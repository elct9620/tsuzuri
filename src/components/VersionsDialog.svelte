<!--
  @component
  The Versions of the Current Resource's subtitles: their Backups, a comparison of two, and
  restoring one. A Backup set as the comparison is what the editor compares with from then on.
-->
<script lang="ts">
  import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { flushSync } from "svelte";

  import {
    compareVersions,
    restoreVersion,
    revertRow,
    subtitleVersions,
    type ComparedCue,
    type ComparedRow,
    type Restoration,
    type SubtitleVersions,
  } from "../backend/project";
  import { t } from "../i18n";
  import { notifyFailure, notifyRestoration } from "../ui/notification.svelte";
  import { formatTime, localTime } from "../ui/time";
  import { editorComparison } from "./context";

  const comparison = editorComparison();
  let dialog: HTMLDialogElement;
  let rowList = $state<HTMLTableSectionElement>();
  /** What Rust listed when the dialog opened; shown until it closes. */
  let versions = $state<SubtitleVersions[]>([]);
  /** Which subtitle's Versions are shown: the original as "", or a translation by its Language code. */
  let language = $state("");
  /** The Backup on each side of the comparison, or "" for the subtitle now. */
  let leftVersion = $state("");
  let rightVersion = $state("");
  /** The rows of the comparison shown, or null while none is. */
  let rows = $state<ComparedRow[] | null>(null);
  /** Whether the rows shown can be taken back, from a Backup on the left into the subtitle now. */
  let isRevertible = $state(false);
  let isFilteredToDifferences = $state(false);
  /** The row moved to last among those that differ. */
  let currentRow = $state<number | null>(null);
  /** The comparison asked for last; an answer to an earlier one is dropped. */
  let comparisonRequest: Promise<ComparedRow[]> | undefined;

  const backups = $derived(
    versions.find((each) => each.language === shownLanguage())?.backups ?? [],
  );

  function shownLanguage(): string | null {
    return language || null;
  }

  /** The texts of one side of a row, a line each, or a dash where that side has none. */
  function texts(cues: ComparedCue[]): string {
    return cues.length === 0 ? "—" : cues.map((cue) => cue.text).join("\n");
  }

  function isDifferent(row: ComparedRow): boolean {
    return row.kind !== "pair" || row.is_text_changed || row.is_time_changed;
  }

  function startOf(row: ComparedRow): number {
    return Math.min(...[...row.left, ...row.right].map((cue) => cue.start_ms));
  }

  /** Opens the dialog at the Versions of the subtitle in `subtitle`, or of the original for none. */
  export async function open(subtitle: string | null = null): Promise<void> {
    try {
      versions = await subtitleVersions();
    } catch (error) {
      notifyFailure(t("versions.unreadable"), error);
      return;
    }
    language = subtitle ?? "";
    closeComparison();
    dialog.showModal();
  }

  function closeComparison(): void {
    leftVersion = "";
    rightVersion = "";
    rows = null;
  }

  function chooseSubtitle(
    event: Event & { currentTarget: HTMLSelectElement },
  ): void {
    language = event.currentTarget.value;
    closeComparison();
  }

  /** Hands the editor a Backup to compare with, and closes. */
  function setComparison(file: string): void {
    void comparison.compareWith(shownLanguage(), file);
    dialog.close();
  }

  async function compare(file: string): Promise<void> {
    leftVersion = file;
    rightVersion = "";
    await showComparison();
  }

  /** Asks Rust to line the two chosen Versions up by time, marking each row that differs. */
  async function showComparison(): Promise<void> {
    const request = compareVersions(
      shownLanguage(),
      leftVersion || null,
      rightVersion || null,
    );
    comparisonRequest = request;
    let comparedRows: ComparedRow[];
    try {
      comparedRows = await request;
    } catch (error) {
      if (request === comparisonRequest)
        notifyFailure(t("versions.unreadable"), error);
      return;
    }
    if (request !== comparisonRequest) return;
    isRevertible = leftVersion !== "" && rightVersion === "";
    currentRow = null;
    rows = comparedRows;
  }

  function chooseVersion(
    side: "left" | "right",
    event: Event & { currentTarget: HTMLSelectElement },
  ): void {
    if (side === "left") leftVersion = event.currentTarget.value;
    else rightVersion = event.currentTarget.value;
    void showComparison();
  }

  /** Moves to the row that differs `step` rows of difference away from the current one. */
  function moveToDifference(step: 1 | -1): void {
    const differences = (rows ?? []).flatMap((row, index) =>
      isDifferent(row) ? [index] : [],
    );
    if (differences.length === 0) return;
    const current = currentRow === null ? -1 : differences.indexOf(currentRow);
    const next =
      current === -1
        ? step === 1
          ? 0
          : differences.length - 1
        : (current + step + differences.length) % differences.length;
    currentRow = differences[next];
    flushSync();
    rowList
      ?.querySelector("[data-is-current]")
      ?.scrollIntoView?.({ block: "nearest" });
  }

  /** Takes back row `index` from the Backup on the left, and compares again. */
  async function revert(index: number): Promise<void> {
    let restoration: Restoration;
    try {
      restoration = await revertRow(
        shownLanguage(),
        leftVersion,
        index,
        "whole",
      );
    } catch (error) {
      notifyFailure(t("compare.notReverted"), error);
      return;
    }
    notifyRestoration(t("compare.reverted"), restoration);
    await showComparison();
  }

  async function restore(file: string): Promise<void> {
    let restoration: Restoration;
    try {
      restoration = await restoreVersion(shownLanguage(), file);
    } catch (error) {
      notifyFailure(t("versions.notRestored"), error);
      return;
    }
    dialog.close();
    notifyRestoration(
      t("versions.restored"),
      restoration,
      t("versions.replacedKept"),
    );
  }
</script>

{#snippet versionChoices()}
  <option value="">{t("versions.now")}</option>
  {#each backups as backup (backup.file)}
    <option value={backup.file}>{localTime(backup.taken_at)}</option>
  {/each}
{/snippet}

{#snippet spansCell(row: ComparedRow, own: "removal" | "addition")}
  <td class="whitespace-pre-line"
    >{#each row.text_spans as span, index (index)}{#if span.kind === "common"}<span
          >{span.text}</span
        >{:else if span.kind === own}<span
          data-span={span.kind}
          class={span.kind === "removal"
            ? "bg-error/20 line-through"
            : "bg-success/20"}>{span.text}</span
        >{/if}{/each}</td
  >
{/snippet}

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box max-w-4xl">
    <h3 class="mb-2 text-lg font-bold">{t("versions.title")}</h3>
    <label class="mb-2 flex items-center gap-2 text-sm"
      ><span>{t("versions.subtitle")}</span>
      <select
        class="select select-sm w-auto"
        value={language}
        onchange={chooseSubtitle}
      >
        {#each versions as each (each.language)}
          <option value={each.language ?? ""}
            >{each.language
              ? t(`languages.${each.language}`)
              : t("versions.original")}</option
          >
        {/each}
      </select>
    </label>
    <ul
      class="list max-h-48 overflow-y-auto rounded-box border border-base-300 text-sm"
    >
      <li class="list-row">{t("versions.now")}</li>
      {#each backups as backup (backup.file)}
        <li class="list-row items-center">
          <span class="badge badge-sm">{t(`compare.${backup.kind}`)}</span>
          <span class="list-col-grow">{localTime(backup.taken_at)}</span>
          <button
            type="button"
            class="btn btn-xs"
            onclick={() => setComparison(backup.file)}
            >{t("versions.setComparison")}</button
          >
          <button
            type="button"
            class="btn btn-xs"
            onclick={() => compare(backup.file)}>{t("versions.compare")}</button
          >
          <button
            type="button"
            class="btn btn-xs"
            onclick={() => restore(backup.file)}>{t("versions.restore")}</button
          >
        </li>
      {/each}
    </ul>
    {#if rows !== null}
      <section class="mt-4">
        <div class="mb-2 flex items-center gap-2">
          <select
            class="select select-sm w-auto"
            value={leftVersion}
            onchange={(event) => chooseVersion("left", event)}
          >
            {@render versionChoices()}
          </select>
          <ArrowLeftRight class="size-4 text-base-content/60" />
          <select
            class="select select-sm w-auto"
            value={rightVersion}
            onchange={(event) => chooseVersion("right", event)}
          >
            {@render versionChoices()}
          </select>
          <label class="ml-auto flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              bind:checked={isFilteredToDifferences}
            />
            <span>{t("versions.onlyDifferences")}</span>
          </label>
          <button
            type="button"
            class="btn btn-square btn-sm"
            aria-label={t("versions.previousDifference")}
            onclick={() => moveToDifference(-1)}
          >
            <ChevronUp class="size-4" />
          </button>
          <button
            type="button"
            class="btn btn-square btn-sm"
            aria-label={t("versions.nextDifference")}
            onclick={() => moveToDifference(1)}
          >
            <ChevronDown class="size-4" />
          </button>
        </div>
        <div class="max-h-96 overflow-y-auto">
          <table class="table table-sm">
            <tbody bind:this={rowList}>
              {#each rows as row, index (index)}
                {@const isRowDifferent = isDifferent(row)}
                {#if isRowDifferent || !isFilteredToDifferences}
                  <tr
                    class={[
                      isRowDifferent &&
                        (currentRow === index ? "bg-info/20" : "bg-warning/15"),
                    ]}
                    data-is-different={isRowDifferent || undefined}
                    data-is-current={currentRow === index || undefined}
                  >
                    <td class="whitespace-pre-line"
                      >{formatTime(startOf(row))}</td
                    >
                    {#if row.text_spans.length > 0}
                      {@render spansCell(row, "removal")}
                      {@render spansCell(row, "addition")}
                    {:else}
                      <td class="whitespace-pre-line">{texts(row.left)}</td>
                      <td class="whitespace-pre-line">{texts(row.right)}</td>
                    {/if}
                    <td>
                      {#if isRowDifferent && isRevertible}
                        <button
                          type="button"
                          class="btn btn-square btn-ghost btn-xs"
                          title={t("compare.revertWhole")}
                          aria-label={t("compare.revertWhole")}
                          onclick={() => revert(index)}
                        >
                          <RotateCcw class="size-4" />
                        </button>
                      {/if}
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.close")}</button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

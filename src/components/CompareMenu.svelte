<!--
  @component
  The compare menu's choices: for each side a few Backups, nothing, and the Versions dialog for the
  rest, then the other translations to read beneath the cues.
-->
<script lang="ts">
  import { t } from "#/i18n.ts";
  import { closeMenu } from "#/ui/menu.ts";
  import { localTime } from "#/ui/time.ts";
  import { editorComparison } from "#/components/context.ts";
  import type { Side } from "#/components/editor-comparison.svelte.ts";

  let {
    openVersions,
  }: {
    /** Opens the Versions dialog at the subtitle in a Language, or at the original for none. */
    openVersions: (subtitle: string | null) => void;
  } = $props();

  const comparison = editorComparison();

  /** What a Backup offered goes by: its kind and when it was taken, or its file once no longer listed. */
  function backupLabel(side: Side, file: string): string {
    const backup = comparison
      .sideBackups(side)
      .find((each) => each.file === file);
    return backup
      ? `${t(`compare.${backup.kind}`)} ${localTime(backup.taken_at)}`
      : file;
  }

  function chooseInVersions(item: EventTarget | null, side: Side): void {
    closeMenu(item);
    openVersions(comparison.sideLanguage(side));
  }

  function chooseReference(language: string, isChosen: boolean): void {
    void comparison.chooseReferences(
      isChosen
        ? [...comparison.references, language]
        : comparison.references.filter((each) => each !== language),
    );
  }
</script>

{#snippet backupChoice(side: Side, file: string | null, label: string)}
  <li>
    <label>
      <input
        type="radio"
        class="radio radio-xs"
        name="compare-{side}"
        value={file ?? ""}
        checked={comparison.fileBySide[side] === file}
        onchange={() => comparison.choose(side, file)}
      />
      <span>{label}</span>
    </label>
  </li>
{/snippet}

<ul class="menu w-full">
  {#each comparison.sides as side (side)}
    <li class="menu-title">{comparison.sideName(side)}</li>
    {#each comparison.offeredFiles(side) as file (file)}
      {@render backupChoice(side, file, backupLabel(side, file))}
    {/each}
    {@render backupChoice(side, null, t("compare.none"))}
    <li>
      <button
        type="button"
        onclick={({ currentTarget }) => chooseInVersions(currentTarget, side)}
        >{t("compare.chooseInVersions")}</button
      >
    </li>
  {/each}
  {#if comparison.offeredReferences.length > 0}
    <li class="menu-title">{t("compare.references")}</li>
    {#each comparison.offeredReferences as language (language)}
      <li>
        <label>
          <input
            type="checkbox"
            class="checkbox checkbox-xs"
            checked={comparison.references.includes(language)}
            onchange={({ currentTarget }) =>
              chooseReference(language, currentTarget.checked)}
          />
          <span>{t(`languages.${language}`)}</span>
        </label>
      </li>
    {/each}
  {/if}
</ul>

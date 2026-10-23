<!--
  @component
  The export menu: saves the Current Resource as SRT or Plain Text, offering only the exports the
  Project has text for, or in an Export Format a Script registers, and keeps on this machine whether
  Plain Text names its Speakers and leaves blank lines between blocks, which Export Formats are
  handed too.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Download from "@lucide/svelte/icons/download";

  import { save, SRT_FILTERS, TEXT_FILTERS } from "#/ipc/dialog.ts";
  import {
    type ExportKind,
    exportPath,
    type ProjectView,
    saveSrt,
    saveText,
    type WrittenText,
  } from "#/ipc/project.ts";
  import {
    exportFormatPath,
    runExportFormat,
    scanScripts,
    scriptExportFormats,
    type ScriptExportFormat,
  } from "#/ipc/scripts.ts";
  import { t } from "#/i18n.ts";
  import { rememberedFlag, rememberFlag } from "#/ui/choices.ts";
  import { closeMenu } from "#/ui/menu.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import { taskRun } from "#/state/context.ts";
  import ScriptMenuItem from "#/components/ScriptMenuItem.svelte";

  /** Where the webview remembers whether a Plain Text export names its Speakers. */
  const TEXT_SPEAKERS_KEY = "tsuzuri.plain-text-speakers";

  /** Where the webview remembers whether a Plain Text export leaves a blank line between blocks. */
  const TEXT_BLANK_LINES_KEY = "tsuzuri.plain-text-blank-lines";

  interface ExportChoice {
    content: WrittenText;
    format: ExportKind;
    label: string;
  }

  const SRT_EXPORTS: ExportChoice[] = [
    { content: "bilingual", format: "srt", label: "toolbar.bilingual" },
    { content: "original", format: "srt", label: "toolbar.original" },
    { content: "translation", format: "srt", label: "toolbar.translation" },
  ];

  const TEXT_EXPORTS: ExportChoice[] = [
    {
      content: "bilingual",
      format: "plain_text",
      label: "toolbar.bilingualText",
    },
    {
      content: "original",
      format: "plain_text",
      label: "toolbar.originalText",
    },
    {
      content: "translation",
      format: "plain_text",
      label: "toolbar.translationText",
    },
  ];

  let { project }: { project: ProjectView | null } = $props();
  const run = taskRun();
  let exportFormats = $state.raw<ScriptExportFormat[]>([]);
  let hasTextSpeakers = $state(rememberedFlag(TEXT_SPEAKERS_KEY, true));
  let hasTextBlankLines = $state(rememberedFlag(TEXT_BLANK_LINES_KEY, true));

  const segments = $derived(project?.segments ?? []);
  const hasTranslation = $derived(
    segments.some((segment) => segment.translation !== undefined),
  );

  /** Whether the Project has the text `content` writes. */
  function isOffered(content: WrittenText): boolean {
    if (segments.length === 0) return false;
    return content === "original" || hasTranslation;
  }

  async function readExportFormats(): Promise<void> {
    await attempt(t("script.unscanned"), async () => {
      exportFormats = scriptExportFormats(await scanScripts(false));
    });
  }

  onMount(readExportFormats);

  async function saveExportFormat(
    format: ScriptExportFormat,
    item: EventTarget | null,
  ): Promise<void> {
    closeMenu(item);
    if (run.isBusy) return;
    let path = null as string | null;
    const isChosen = await attempt(t("toolbar.notExported"), async () => {
      path = await save({
        defaultPath: await exportFormatPath(format.extension),
        filters: [{ name: format.label, extensions: [format.extension] }],
      });
    });
    if (!isChosen || path === null) return;
    const chosenPath: string = path;
    await run.perform(
      "script",
      () =>
        runExportFormat(
          {
            script: format.script,
            id: format.id,
            has_speakers: hasTextSpeakers,
            has_blank_lines: hasTextBlankLines,
          },
          chosenPath,
        ),
      format.label,
    );
  }

  async function saveExport(
    { content, format }: ExportChoice,
    item: EventTarget | null,
  ): Promise<void> {
    closeMenu(item);
    const isPlainText = format === "plain_text";
    await attempt(t("toolbar.notExported"), async () => {
      const path = await save({
        defaultPath: await exportPath(content, format),
        filters: isPlainText ? TEXT_FILTERS : SRT_FILTERS,
      });
      if (path === null) return;
      if (isPlainText)
        await saveText(path, content, hasTextSpeakers, hasTextBlankLines);
      else await saveSrt(path, content);
    });
  }
</script>

<svelte:window onrust:scripts-changed={readExportFormats} />

{#snippet exportItem(item: ExportChoice)}
  <li>
    <button
      type="button"
      disabled={!isOffered(item.content)}
      onclick={({ currentTarget }) => saveExport(item, currentTarget)}
      >{t(item.label)}</button
    >
  </li>
{/snippet}

<div class="dropdown dropdown-end">
  <div
    tabindex="0"
    role="button"
    class="btn btn-sm"
    onfocus={readExportFormats}
    aria-label={t("toolbar.export")}
    data-tooltip={t("toolbar.export")}
  >
    <Download class="size-4" /><span class="hidden @5xl:inline"
      >{t("toolbar.export")}</span
    >
    <ChevronDown class="size-4" />
  </div>
  <ul
    tabindex="-1"
    class="menu dropdown-content z-10 w-52 rounded-box bg-base-100 shadow-md"
  >
    {#each SRT_EXPORTS as item (item.label)}
      {@render exportItem(item)}
    {/each}
    <li></li>
    {#each TEXT_EXPORTS as item (item.label)}
      {@render exportItem(item)}
    {/each}
    <li>
      <label class="justify-between">
        <span>{t("toolbar.textSpeakers")}</span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          bind:checked={hasTextSpeakers}
          onchange={() => rememberFlag(TEXT_SPEAKERS_KEY, hasTextSpeakers)}
        />
      </label>
    </li>
    <li>
      <label class="justify-between">
        <span>{t("toolbar.textBlankLines")}</span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          bind:checked={hasTextBlankLines}
          onchange={() => rememberFlag(TEXT_BLANK_LINES_KEY, hasTextBlankLines)}
        />
      </label>
    </li>
    {#if exportFormats.length > 0}
      <li></li>
      {#each exportFormats as format (`${format.script}:${format.id}`)}
        <ScriptMenuItem
          label={format.label}
          script={format.script}
          disabled={segments.length === 0 || run.isBusy}
          choose={(item) => saveExportFormat(format, item)}
        />
      {/each}
    {/if}
  </ul>
</div>

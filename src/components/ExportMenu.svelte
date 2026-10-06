<!--
  @component
  The export menu: saves the Current Resource as SRT or Plain Text, offering only the exports the
  Project has text for, and keeps on this machine whether Plain Text names its Speakers and leaves
  blank lines between blocks.
-->
<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Download from "@lucide/svelte/icons/download";

  import { save, SRT_FILTERS, TEXT_FILTERS } from "#/ipc/dialog.ts";
  import {
    type ExportFormat,
    exportPath,
    type ProjectView,
    saveSrt,
    saveText,
    type WrittenText,
  } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import { rememberedFlag, rememberFlag } from "#/ui/choices.ts";
  import { closeMenu } from "#/ui/menu.ts";
  import { notifyFailure } from "#/state/notification.svelte.ts";

  /** Where the webview remembers whether a Plain Text export names its Speakers. */
  const TEXT_SPEAKERS_KEY = "tsuzuri.plain-text-speakers";

  /** Where the webview remembers whether a Plain Text export leaves a blank line between blocks. */
  const TEXT_BLANK_LINES_KEY = "tsuzuri.plain-text-blank-lines";

  interface ExportChoice {
    content: WrittenText;
    format: ExportFormat;
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

  async function saveExport(
    { content, format }: ExportChoice,
    item: EventTarget | null,
  ): Promise<void> {
    closeMenu(item);
    const isPlainText = format === "plain_text";
    try {
      const path = await save({
        defaultPath: await exportPath(content, format),
        filters: isPlainText ? TEXT_FILTERS : SRT_FILTERS,
      });
      if (path === null) return;
      if (isPlainText)
        await saveText(path, content, hasTextSpeakers, hasTextBlankLines);
      else await saveSrt(path, content);
    } catch (error) {
      notifyFailure(t("toolbar.notExported"), error);
    }
  }
</script>

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
  </ul>
</div>

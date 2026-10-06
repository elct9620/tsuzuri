<script lang="ts">
  import AudioWaveform from "@lucide/svelte/icons/audio-waveform";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import GitCompare from "@lucide/svelte/icons/git-compare";
  import History from "@lucide/svelte/icons/history";
  import Replace from "@lucide/svelte/icons/replace";
  import Search from "@lucide/svelte/icons/search";
  import SquarePlay from "@lucide/svelte/icons/square-play";
  import Users from "@lucide/svelte/icons/users";
  import { onMount } from "svelte";

  import {
    currentResource,
    type ProjectView,
    showTranslation,
  } from "#/backend/project.ts";
  import { t } from "#/i18n.ts";
  import { notifyFailure } from "#/ui/notification.svelte.ts";
  import { playedSource } from "#/ui/silence.ts";
  import CompareMenu from "#/components/CompareMenu.svelte";
  import { projectFeed } from "#/components/context.ts";
  import type { PreviewFold } from "#/components/preview-fold.svelte.ts";
  import TaskProgress from "#/components/TaskProgress.svelte";

  interface Props {
    openReplacement: () => void;
    /** Opens the Versions dialog at the subtitle in a Language, or at the original for none. */
    openVersions: (subtitle?: string | null) => void;
    openSearch: () => void;
    openSpeakers: () => void;
    /** The parts of the Preview folded away, which only a Current Resource has to fold. */
    fold: PreviewFold;
  }

  let { openReplacement, openVersions, openSearch, openSpeakers, fold }: Props =
    $props();

  const feed = projectFeed();
  let project = $state<ProjectView | null>(null);

  const hasPreview = $derived(playedSource(project, null) !== null);
  const shownLanguage = $derived(project?.shown_translation ?? null);
  /** Each Language the Current Resource has a translation in, or is being translated into. */
  const translationLanguages = $derived.by(() => {
    const codes = [...(currentResource(project)?.translation_languages ?? [])];
    if (shownLanguage !== null && !codes.includes(shownLanguage))
      codes.push(shownLanguage);
    return codes;
  });

  async function chooseTranslation(language: string): Promise<void> {
    try {
      await showTranslation(language || null);
    } catch (error) {
      notifyFailure(t("translate.notShown"), error);
    }
  }

  onMount(() => feed.follow((next) => (project = next)));
</script>

<div class="flex items-center gap-2 border-b border-base-300 px-4 py-2">
  <div class="flex min-w-0 grow items-center gap-2">
    <h2 class="truncate font-semibold">{project?.current_resource ?? ""}</h2>
    <span
      class="flex shrink-0 items-center gap-1 text-sm text-base-content/70 opacity-0 transition-opacity duration-200 ease-out data-is-shown:opacity-100 motion-reduce:transition-none"
      role="status"
      data-save-mark
      ><Check class="size-4 text-success" aria-hidden="true" /><span
        data-save-mark-label
      ></span></span
    >
  </div>
  <label class="flex items-center gap-2 text-sm"
    ><span class="hidden @5xl:inline">{t("edit.translation")}</span>
    <!-- What a running Mode shows is its own until it ends. -->
    <select
      class="select select-sm w-auto"
      aria-label={t("edit.translation")}
      value={shownLanguage ?? ""}
      disabled={(project?.running_mode ?? null) !== null}
      onchange={({ currentTarget }) => chooseTranslation(currentTarget.value)}
    >
      <option value="">{t("edit.noTranslation")}</option>
      {#each translationLanguages as code (code)}
        <option value={code}>{t(`languages.${code}`)}</option>
      {/each}
    </select>
  </label>
  <div class="dropdown dropdown-end">
    <div
      tabindex="0"
      role="button"
      class="btn btn-sm"
      aria-label={t("compare.label")}
      data-tooltip={t("compare.label")}
    >
      <GitCompare class="size-4" aria-hidden="true" /><span
        class="hidden @5xl:inline">{t("compare.label")}</span
      >
      <ChevronDown class="size-4" aria-hidden="true" />
    </div>
    <div
      tabindex="-1"
      class="dropdown-content z-20 w-64 rounded-box bg-base-100 shadow-md"
    >
      <CompareMenu {openVersions} />
    </div>
  </div>
  <button
    type="button"
    class="btn btn-sm"
    onclick={() => openVersions()}
    aria-label={t("versions.open")}
    data-tooltip={t("versions.open")}
  >
    <History class="size-4" aria-hidden="true" /><span
      class="hidden @5xl:inline">{t("versions.open")}</span
    >
  </button>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openSpeakers}
    aria-label={t("edit.speakers")}
    data-tooltip={t("edit.speakers")}
  >
    <Users class="size-4" aria-hidden="true" /><span class="hidden @5xl:inline"
      >{t("edit.speakers")}</span
    >
  </button>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openReplacement}
    aria-label={t("replace.open")}
    data-tooltip={t("replace.open")}
    data-shortcut="replace"
  >
    <Replace class="size-4" aria-hidden="true" /><span
      class="hidden @5xl:inline">{t("replace.open")}</span
    >
  </button>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openSearch}
    aria-label={t("search.open")}
    data-tooltip={t("search.open")}
    data-shortcut="search"
  >
    <Search class="size-4" aria-hidden="true" /><span class="hidden @5xl:inline"
      >{t("search.open")}</span
    >
  </button>
  <TaskProgress />
  {#if hasPreview}
    <!-- Each lights while its part is folded away, as a toggle button is lit while it is on -->
    <button
      type="button"
      class={["btn btn-square btn-sm", fold.isPlayerFolded && "btn-primary"]}
      aria-pressed={fold.isPlayerFolded}
      aria-label={t("preview.foldPlayer")}
      data-tooltip={t("preview.foldPlayer")}
      onclick={() => fold.togglePlayer()}
    >
      <SquarePlay class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      class={["btn btn-square btn-sm", fold.isTimelineFolded && "btn-primary"]}
      aria-pressed={fold.isTimelineFolded}
      aria-label={t("preview.foldTimeline")}
      data-tooltip={t("preview.foldTimeline")}
      onclick={() => fold.toggleTimeline()}
    >
      <AudioWaveform class="size-4" aria-hidden="true" />
    </button>
  {/if}
</div>

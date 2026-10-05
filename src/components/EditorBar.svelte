<script lang="ts">
  import { onMount } from "svelte";

  import {
    currentResource,
    type ProjectView,
    showTranslation,
  } from "../backend/project";
  import { t } from "../i18n";
  import { notifyFailure } from "../ui/notification.svelte";
  import { projectFeed } from "./context";
  import TaskProgress from "./TaskProgress.svelte";

  interface Props {
    openReplacement: () => void;
    openVersions: () => void;
    openSearch: () => void;
  }

  let { openReplacement, openVersions, openSearch }: Props = $props();

  const feed = projectFeed();
  let project = $state<ProjectView | null>(null);

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
      ><i data-lucide="check" class="size-4 text-success"></i><span
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
      data-i18n-label="compare.label"
      data-i18n-tooltip="compare.label"
    >
      <i data-lucide="git-compare" class="size-4"></i><span
        class="hidden @5xl:inline"
        data-i18n="compare.label"
      ></span>
      <i data-lucide="chevron-down" class="size-4"></i>
    </div>
    <div
      tabindex="-1"
      class="dropdown-content z-20 w-64 rounded-box bg-base-100 shadow-md"
      data-comparison-target="menu"
    ></div>
  </div>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openVersions}
    data-i18n-label="versions.open"
    data-i18n-tooltip="versions.open"
  >
    <i data-lucide="history" class="size-4"></i><span
      class="hidden @5xl:inline"
      data-i18n="versions.open"
    ></span>
  </button>
  <button
    type="button"
    class="btn btn-sm"
    data-action="speakers#open"
    data-i18n-label="edit.speakers"
    data-i18n-tooltip="edit.speakers"
  >
    <i data-lucide="users" class="size-4"></i><span
      class="hidden @5xl:inline"
      data-i18n="edit.speakers"
    ></span>
  </button>
  <dialog class="modal" data-speakers-target="dialog">
    <div class="modal-box max-w-md">
      <h3 class="mb-2 text-lg font-bold" data-i18n="edit.speakersTitle"></h3>
      <fieldset class="fieldset gap-2 text-sm">
        <legend class="fieldset-legend" data-i18n="edit.speakersScope"></legend>
        <label
          class="flex items-center gap-2"
          data-speakers-target="checkedChoice"
        >
          <input
            type="radio"
            name="speaker-scope"
            value="checked-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-speakers-target="checkedCount"></span>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="speaker-scope"
            value="all-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-i18n="edit.speakersEvery"></span>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="speaker-scope"
            value="unnamed-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-i18n="edit.speakersUnnamed"></span>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="speaker-scope"
            value="named-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-i18n="edit.speakersNamedBefore"></span>
          <select
            class="select select-xs w-auto"
            data-speakers-target="renamedSpeaker"
          ></select>
          <span data-i18n="edit.speakersNamedAfter"></span>
        </label>
      </fieldset>
      <fieldset class="fieldset gap-2 text-sm">
        <legend class="fieldset-legend" data-i18n="edit.speakersTo"></legend>
        <input class="input input-sm" data-speakers-target="newSpeaker" />
        <div class="flex flex-wrap gap-1" data-speakers-target="names"></div>
      </fieldset>
      <div class="modal-action">
        <form method="dialog">
          <button class="btn" data-i18n="work.cancel"></button>
        </form>
        <button
          type="button"
          class="btn btn-primary"
          data-action="speakers#apply"
          data-i18n="edit.apply"
        ></button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openReplacement}
    data-i18n-label="replace.open"
    data-i18n-tooltip="replace.open"
    data-shortcut="replace"
  >
    <i data-lucide="replace" class="size-4"></i><span
      class="hidden @5xl:inline"
      data-i18n="replace.open"
    ></span>
  </button>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openSearch}
    data-i18n-label="search.open"
    data-i18n-tooltip="search.open"
    data-shortcut="search"
  >
    <i data-lucide="search" class="size-4"></i><span
      class="hidden @5xl:inline"
      data-i18n="search.open"
    ></span>
  </button>
  <TaskProgress />
  <button
    type="button"
    class="btn btn-square btn-sm"
    data-preview-target="playerFoldButton"
    data-action="preview#togglePlayerFold"
    data-i18n-label="preview.foldPlayer"
    data-i18n-tooltip="preview.foldPlayer"
    hidden
  >
    <i data-lucide="square-play" class="size-4"></i>
  </button>
  <button
    type="button"
    class="btn btn-square btn-sm"
    data-preview-target="timelineFoldButton"
    data-action="preview#toggleTimelineFold"
    data-i18n-label="preview.foldTimeline"
    data-i18n-tooltip="preview.foldTimeline"
    hidden
  >
    <i data-lucide="audio-waveform" class="size-4"></i>
  </button>
</div>

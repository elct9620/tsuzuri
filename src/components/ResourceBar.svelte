<!--
  @component
  The resource bar: the Current Resource's name and Save Mark, the translation shown, and the tasks
  that act on the Current Resource — transcribing and diarizing, translating, exporting — with the
  progress of a task under way.
-->
<script lang="ts">
  import AudioLines from "@lucide/svelte/icons/audio-lines";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Languages from "@lucide/svelte/icons/languages";

  import {
    currentResource,
    type Language,
    type ProjectView,
    showTranslation,
  } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import { closeMenu } from "#/ui/menu.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import { saveMark } from "#/state/save-mark.svelte.ts";
  import ExportMenu from "#/components/ExportMenu.svelte";
  import TaskProgress from "#/components/TaskProgress.svelte";

  interface Props {
    /** The open Project, as Page reads it. */
    project: ProjectView | null;
    openTranscription: () => void;
    openTranslation: () => void;
    openDiarization: () => void;
  }

  let { project, openTranscription, openTranslation, openDiarization }: Props =
    $props();

  const resource = $derived(currentResource(project));
  const hasMedia = $derived(resource?.has_media ?? false);
  const hasSubtitle = $derived(resource?.has_subtitle ?? false);
  const shownLanguage = $derived(project?.shown_translation ?? null);
  /** Each Language the Current Resource has a translation in, or is being translated into. */
  const translationLanguages = $derived.by(() => {
    const codes = [...(resource?.translation_languages ?? [])];
    if (shownLanguage !== null && !codes.includes(shownLanguage))
      codes.push(shownLanguage);
    return codes;
  });
  /** The transcribe menu's items, each usable only for a Current Resource holding what its task reads. */
  const transcribeItems = $derived([
    {
      label: t("toolbar.transcribeSpeech"),
      isOffered: hasMedia,
      open: openTranscription,
    },
    {
      label: t("toolbar.diarize"),
      isOffered: hasMedia && hasSubtitle,
      open: openDiarization,
    },
  ]);

  async function chooseTranslation(language: Language | ""): Promise<void> {
    await attempt(t("translate.notShown"), async () => {
      await showTranslation(language || null);
    });
  }
</script>

<div class="flex min-w-0 grow items-center gap-2">
  <h2 class="truncate font-semibold">{project?.current_resource ?? ""}</h2>
  <span
    class="flex shrink-0 items-center gap-1 text-sm text-base-content/70 opacity-0 transition-opacity duration-200 ease-out data-is-shown:opacity-100 motion-reduce:transition-none"
    role="status"
    data-is-shown={saveMark.isShown ? "" : undefined}
    ><Check class="size-4 text-success" aria-hidden="true" /><span
      >{saveMark.label}</span
    ></span
  >
  <label class="ml-auto flex items-center gap-2 text-sm"
    ><span class="hidden @5xl:inline">{t("edit.translation")}</span>
    <!-- What a running Mode shows is its own until it ends. -->
    <select
      class="select select-sm w-auto"
      aria-label={t("edit.translation")}
      value={shownLanguage ?? ""}
      disabled={(project?.running_mode ?? null) !== null}
      onchange={({ currentTarget }) =>
        chooseTranslation(currentTarget.value as Language | "")}
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
      aria-label={t("toolbar.transcribe")}
      data-tooltip={t("toolbar.transcribe")}
    >
      <AudioLines class="size-4" aria-hidden="true" /><span
        class="hidden @5xl:inline">{t("toolbar.transcribe")}</span
      >
      <ChevronDown class="size-4" aria-hidden="true" />
    </div>
    <ul
      tabindex="-1"
      class="menu dropdown-content z-10 w-max min-w-40 rounded-box bg-base-100 shadow-md"
    >
      {#each transcribeItems as { label, isOffered, open } (label)}
        <li>
          <button
            type="button"
            disabled={!isOffered}
            onclick={({ currentTarget }) => {
              closeMenu(currentTarget);
              open();
            }}>{label}</button
          >
        </li>
      {/each}
    </ul>
  </div>
  <button
    type="button"
    class="btn btn-sm"
    aria-label={t("toolbar.translate")}
    data-tooltip={t("toolbar.translate")}
    disabled={!hasSubtitle}
    onclick={openTranslation}
  >
    <Languages class="size-4" aria-hidden="true" /><span
      class="hidden @5xl:inline">{t("toolbar.translate")}</span
    >
  </button>
  <ExportMenu {project} />
  <TaskProgress />
</div>

<script lang="ts">
  import AudioLines from "@lucide/svelte/icons/audio-lines";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Languages from "@lucide/svelte/icons/languages";
  import Menu from "@lucide/svelte/icons/menu";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Users from "@lucide/svelte/icons/users";
  import { onMount } from "svelte";

  import {
    currentResource,
    type ProjectView,
    type RecentProjectView,
  } from "../backend/project";
  import { t } from "../i18n";
  import { projectFeed } from "./context";
  import {
    openDirectory,
    openRecent,
    openSrt,
    rename,
  } from "./project-actions";
  import type { ResourceDock } from "./resource-dock.svelte";

  interface Props {
    dock: ResourceDock;
    recentProjects: RecentProjectView[];
    openSettings: () => void;
    openShortcuts: () => void;
    openTranscription: () => void;
    openTranslation: () => void;
    openDiarization: () => void;
  }

  let {
    dock,
    recentProjects,
    openSettings,
    openShortcuts,
    openTranscription,
    openTranslation,
    openDiarization,
  }: Props = $props();

  const feed = projectFeed();
  let project = $state<ProjectView | null>(null);

  /** The task buttons, each usable only for a Current Resource holding what its task reads. */
  const taskButtons = $derived.by(() => {
    const resource = currentResource(project);
    const hasMedia = resource?.has_media ?? false;
    const hasSubtitle = resource?.has_subtitle ?? false;
    return [
      {
        Icon: AudioLines,
        label: t("toolbar.transcribe"),
        isOffered: hasMedia,
        open: openTranscription,
      },
      {
        Icon: Languages,
        label: t("toolbar.translate"),
        isOffered: hasSubtitle,
        open: openTranslation,
      },
      {
        Icon: Users,
        label: t("toolbar.diarize"),
        isOffered: hasMedia && hasSubtitle,
        open: openDiarization,
      },
    ];
  });

  /**
   * Leaves the name field: Enter writes the name typed there as the field loses focus, and Esc
   * puts back the name shown first. A key the input method is still composing with stays its own.
   */
  function leaveName(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return;
    const field = event.currentTarget as HTMLInputElement;
    if (event.key === "Escape") field.value = project?.name ?? "";
    else if (event.key !== "Enter") return;
    field.blur();
  }

  onMount(() => feed.follow((next) => (project = next)));
</script>

<header class="navbar min-h-0 gap-2 bg-base-200 px-4 py-2">
  <label
    for="resources-drawer"
    class="btn btn-square btn-sm btn-ghost drawer-button lg:hidden"
    bind:this={dock.overlayButton}
    aria-label={t("resources.open")}
    data-tooltip={t("resources.open")}
    data-shortcut="resourceList"
  >
    <Menu class="size-4" />
  </label>
  <!-- Lit while the list is folded away, as the Preview's fold buttons are. -->
  <button
    type="button"
    class={[
      "btn btn-square btn-sm btn-ghost hidden lg:inline-flex",
      !dock.isDocked && "btn-primary",
    ]}
    aria-pressed={!dock.isDocked}
    onclick={() => dock.toggleDocked()}
    aria-label={t("resources.dock")}
    data-tooltip={t("resources.dock")}
    data-shortcut="resourceList"
  >
    <PanelLeft class="size-4" />
  </button>
  <h1 class="navbar-start w-auto min-w-0 flex-1">
    <label
      class="group input input-ghost input-sm w-full max-w-md hover:border-base-300"
      data-tooltip={t("toolbar.rename")}
    >
      <input
        type="text"
        class="truncate text-base font-semibold"
        aria-label={t("toolbar.projectName")}
        value={project?.name ?? ""}
        onchange={({ currentTarget }) => rename(feed, currentTarget.value)}
        onkeydown={leaveName}
      />
      <Pencil class="size-4 opacity-0 group-hover:opacity-60" />
    </label>
  </h1>
  <div class="navbar-end w-auto shrink-0 gap-2">
    <div class="dropdown dropdown-end">
      <div
        tabindex="0"
        role="button"
        class="btn btn-sm"
        aria-label={t("toolbar.open")}
        data-tooltip={t("toolbar.open")}
      >
        <FolderOpen class="size-4" /><span class="hidden @5xl:inline"
          >{t("toolbar.open")}</span
        >
        <ChevronDown class="size-4" />
      </div>
      <ul
        tabindex="-1"
        class="menu dropdown-content z-10 w-max min-w-40 max-w-80 rounded-box bg-base-100 shadow-md"
      >
        <li>
          <button
            type="button"
            onclick={({ currentTarget }) => openDirectory(currentTarget)}
            >{t("toolbar.openDirectory")}</button
          >
        </li>
        <li>
          <button
            type="button"
            onclick={({ currentTarget }) => openSrt(currentTarget)}
            >{t("toolbar.openSrt")}</button
          >
        </li>
        {#if recentProjects.length > 0}
          <li class="menu-title">{t("start.recentProjects")}</li>
          {#each recentProjects as recentProject (recentProject.directory)}
            <li>
              <button
                type="button"
                data-tooltip={recentProject.directory}
                onclick={({ currentTarget }) =>
                  openRecent(feed, recentProject.directory, currentTarget)}
              >
                <span class="min-w-0 truncate">{recentProject.name}</span>
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </div>

    {#each taskButtons as { Icon, label, isOffered, open } (label)}
      <button
        type="button"
        class="btn btn-sm"
        aria-label={label}
        data-tooltip={label}
        disabled={!isOffered}
        onclick={open}
      >
        <Icon class="size-4" /><span class="hidden @5xl:inline">{label}</span>
      </button>
    {/each}

    <div class="dropdown dropdown-end">
      <div
        tabindex="0"
        role="button"
        class="btn btn-sm"
        data-i18n-label="toolbar.export"
        data-i18n-tooltip="toolbar.export"
      >
        <i data-lucide="download" class="size-4"></i><span
          class="hidden @5xl:inline"
          data-i18n="toolbar.export"
        ></span>
        <i data-lucide="chevron-down" class="size-4"></i>
      </div>
      <ul
        tabindex="-1"
        class="menu dropdown-content z-10 w-52 rounded-box bg-base-100 shadow-md"
      >
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="bilingual"
            data-transcript-format-param="srt"
            disabled
            data-i18n="toolbar.bilingual"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="original"
            data-transcript-format-param="srt"
            disabled
            data-i18n="toolbar.original"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="translation"
            data-transcript-format-param="srt"
            disabled
            data-i18n="toolbar.translation"
          ></button>
        </li>
        <li></li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="bilingual"
            data-transcript-format-param="plain_text"
            disabled
            data-i18n="toolbar.bilingualText"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="original"
            data-transcript-format-param="plain_text"
            disabled
            data-i18n="toolbar.originalText"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="translation"
            data-transcript-format-param="plain_text"
            disabled
            data-i18n="toolbar.translationText"
          ></button>
        </li>
        <li>
          <label class="justify-between">
            <span data-i18n="toolbar.textSpeakers"></span>
            <input
              type="checkbox"
              class="toggle toggle-sm"
              data-transcript-target="textSpeakerToggle"
              data-action="transcript#rememberTextSpeakers"
            />
          </label>
        </li>
        <li>
          <label class="justify-between">
            <span data-i18n="toolbar.textBlankLines"></span>
            <input
              type="checkbox"
              class="toggle toggle-sm"
              data-transcript-target="textBlankLineToggle"
              data-action="transcript#rememberTextBlankLines"
            />
          </label>
        </li>
      </ul>
    </div>

    <button
      type="button"
      class="btn btn-sm btn-ghost"
      onclick={openSettings}
      data-i18n-label="toolbar.settings"
      data-i18n-tooltip="toolbar.settings"
    >
      <i data-lucide="settings" class="size-4"></i><span
        class="hidden @5xl:inline"
        data-i18n="toolbar.settings"
      ></span>
    </button>
    <button
      type="button"
      class="btn btn-square btn-sm btn-ghost"
      onclick={openShortcuts}
      data-i18n-label="shortcuts.title"
      data-i18n-tooltip="shortcuts.title"
      data-shortcut="list"
    >
      <i data-lucide="keyboard" class="size-4"></i>
    </button>
  </div>
</header>

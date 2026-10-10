<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";

  import type { ProjectView } from "#/ipc/project.ts";
  import type { ModelSlot } from "#/ipc/toolchain.ts";
  import { t } from "#/i18n.ts";
  import type { HubFile } from "#/ui/models.ts";
  import About from "#/components/settings/general/About.svelte";
  import Components from "#/components/settings/general/Components.svelte";
  import GeneralModels from "#/components/settings/general/Models.svelte";
  import GeneralTranscription from "#/components/settings/general/Transcription.svelte";
  import Logs from "#/components/settings/general/Logs.svelte";
  import InterfaceLanguage from "#/components/settings/preferences/InterfaceLanguage.svelte";
  import Preferences from "#/components/settings/preferences/Preferences.svelte";
  import Project from "#/components/settings/project/Project.svelte";
  import ProjectModels from "#/components/settings/project/Models.svelte";
  import ProjectTranscription from "#/components/settings/project/Transcription.svelte";
  import Translation from "#/components/settings/general/Translation.svelte";
  import VersionAndUpdates from "#/components/settings/general/VersionAndUpdates.svelte";

  /** One section of the settings, shown alone once chosen from the section list. */
  type Section =
    | "project"
    | "project-transcription"
    | "project-models"
    | "updates"
    | "components"
    | "translation"
    | "transcription"
    | "models"
    | "logs"
    | "about"
    | "language"
    | "choosing";

  /** The section list's groups in order, each with its title and the sections under it. */
  const SECTION_GROUPS: {
    title: string;
    isProjectOwn: boolean;
    sections: { section: Section; label: string }[];
  }[] = [
    {
      title: "settings.project",
      isProjectOwn: true,
      sections: [
        { section: "project", label: "settings.project" },
        { section: "project-transcription", label: "settings.transcription" },
        { section: "project-models", label: "settings.models" },
      ],
    },
    {
      title: "settings.general",
      isProjectOwn: false,
      sections: [
        { section: "updates", label: "settings.versionAndUpdates" },
        { section: "components", label: "settings.components" },
        { section: "translation", label: "settings.translation" },
        { section: "transcription", label: "settings.transcription" },
        { section: "models", label: "settings.models" },
        { section: "logs", label: "settings.logs" },
        { section: "about", label: "settings.about" },
      ],
    },
    {
      title: "settings.preferences",
      isProjectOwn: false,
      sections: [
        { section: "language", label: "settings.language" },
        { section: "choosing", label: "settings.choosing" },
      ],
    },
  ];

  interface Props {
    project: ProjectView | null;
    /** Whether the settings cover the window; hidden, every section stays drawn and keeps what it read. */
    isShown: boolean;
    /** Leaves the settings for the screen they were opened from. */
    goBack: () => void;
    /** Opens the Repository dialog for a slot, answering the file picked, or none. */
    pick: (slot: ModelSlot) => Promise<HubFile | null>;
    /** Opens the full License Notice. */
    openLicenses: () => void;
  }

  let { project, isShown, goBack, pick, openLicenses }: Props = $props();

  const isProjectOpen = $derived(project !== null);
  /** The section shown, the Project's own once one has just opened, until another is chosen. */
  let shownSection = $derived<Section>(isProjectOpen ? "project" : "updates");
  const groupsOffered = $derived(
    SECTION_GROUPS.filter(({ isProjectOwn }) => isProjectOpen || !isProjectOwn),
  );

  let backButton: HTMLButtonElement;

  // Focus moves in as the settings show and back to where it was as they hide, as a modal's does.
  $effect(() => {
    if (!isShown) return;
    const focusLeft = document.activeElement;
    backButton.focus();
    return () => {
      if (focusLeft instanceof HTMLElement) focusLeft.focus();
    };
  });

  /** Goes back by Esc, unless a dialog over the settings takes it first. */
  function goBackByEscape(event: KeyboardEvent): void {
    if (
      !isShown ||
      event.key !== "Escape" ||
      event.defaultPrevented ||
      document.querySelector("dialog[open]") !== null
    )
      return;
    event.preventDefault();
    goBack();
  }
</script>

<svelte:window onkeydown={goBackByEscape} />

<div
  role="region"
  data-covers-editor
  aria-label={t("toolbar.settings")}
  class="flex h-dvh flex-col"
  hidden={!isShown}
>
  <div class="navbar min-h-0 gap-2 bg-base-200 px-4 py-2">
    <button
      type="button"
      class="btn btn-ghost"
      bind:this={backButton}
      onclick={goBack}
    >
      <ArrowLeft class="size-4" aria-hidden="true" />
      {t("settings.back")}
    </button>
    <h2 class="text-lg font-bold">
      {t("toolbar.settings")}
    </h2>
  </div>
  <div class="flex min-h-0 flex-1">
    <nav
      class="w-56 shrink-0 overflow-y-auto border-r border-base-300 max-lg:hidden"
      aria-label={t("settings.sections")}
    >
      <ul class="menu w-full">
        {#each groupsOffered as { title, sections } (title)}
          <li class="menu-title">{t(title)}</li>
          {#each sections as { section, label } (section)}
            <li>
              <button
                type="button"
                class={{ "menu-active": shownSection === section }}
                aria-current={shownSection === section ? "true" : undefined}
                onclick={() => (shownSection = section)}>{t(label)}</button
              >
            </li>
          {/each}
        {/each}
      </ul>
    </nav>
    <div class="min-w-0 flex-1 overflow-y-auto p-6">
      <select
        class="select mb-4 w-full lg:hidden"
        aria-label={t("settings.sections")}
        value={shownSection}
        onchange={(event) =>
          (shownSection = event.currentTarget.value as Section)}
      >
        {#each groupsOffered as { title, sections } (title)}
          <optgroup label={t(title)}>
            {#each sections as { section, label } (section)}
              <option value={section}>{t(label)}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <div class="mx-auto max-w-4xl">
        {#if project !== null}
          <div hidden={shownSection !== "project"}>
            <Project {project} />
          </div>
          <div hidden={shownSection !== "project-transcription"}>
            <ProjectTranscription {project} />
          </div>
          <div hidden={shownSection !== "project-models"}>
            <ProjectModels {project} {pick} />
          </div>
        {/if}
        <div hidden={shownSection !== "updates"}><VersionAndUpdates /></div>
        <div hidden={shownSection !== "components"}><Components /></div>
        <div hidden={shownSection !== "translation"}><Translation /></div>
        <div hidden={shownSection !== "transcription"}>
          <GeneralTranscription />
        </div>
        <div hidden={shownSection !== "models"}>
          <GeneralModels {pick} />
        </div>
        <div hidden={shownSection !== "logs"}><Logs /></div>
        <div hidden={shownSection !== "about"}>
          <About {openLicenses} />
        </div>
        <div hidden={shownSection !== "language"}><InterfaceLanguage /></div>
        <div hidden={shownSection !== "choosing"}><Preferences /></div>
      </div>
    </div>
  </div>
</div>

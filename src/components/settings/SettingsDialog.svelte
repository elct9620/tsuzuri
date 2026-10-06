<script lang="ts">
  import Modal from "#/components/Modal.svelte";

  import type { ProjectView } from "#/ipc/project.ts";
  import type { ModelSlot } from "#/ipc/toolchain.ts";
  import { t } from "#/i18n.ts";
  import type { HubFile } from "#/ui/models.ts";
  import About from "#/components/settings/general/About.svelte";
  import Components from "#/components/settings/general/Components.svelte";
  import GeneralModels from "#/components/settings/general/Models.svelte";
  import GeneralTranscription from "#/components/settings/general/Transcription.svelte";
  import Logs from "#/components/settings/general/Logs.svelte";
  import Preferences from "#/components/settings/preferences/Preferences.svelte";
  import Project from "#/components/settings/project/Project.svelte";
  import ProjectModels from "#/components/settings/project/Models.svelte";
  import ProjectTranscription from "#/components/settings/project/Transcription.svelte";
  import Translation from "#/components/settings/general/Translation.svelte";
  import VersionAndUpdates from "#/components/settings/general/VersionAndUpdates.svelte";

  interface Props {
    project: ProjectView | null;
    /** Opens the Repository dialog for a slot, answering the file picked, or none. */
    pick: (slot: ModelSlot) => Promise<HubFile | null>;
    /** Opens the full License Notice. */
    openLicenses: () => void;
  }

  let { project, pick, openLicenses }: Props = $props();

  let dialog: Modal;
  const isProjectOpen = $derived(project !== null);
  /** The tab shown, the Project's own settings once one has just opened, until another is chosen. */
  let tab = $derived<"project" | "general" | "preferences">(
    isProjectOpen ? "project" : "general",
  );

  export function open(): void {
    dialog.showModal();
  }
</script>

<Modal
  bind:this={dialog}
  title={t("toolbar.settings")}
  boxClass="max-w-3xl"
  dismissLabel={t("work.close")}
>
  <div role="tablist" class="tabs tabs-border">
    {#if project !== null}
      <input
        type="radio"
        name="settings-tabs"
        class="tab"
        aria-label={t("settings.project")}
        checked={tab === "project"}
        onchange={() => (tab = "project")}
      />
      <div class="tab-content pt-4">
        <div class="flex flex-col gap-4">
          <Project {project} />
          <ProjectTranscription {project} />
          <ProjectModels {project} {pick} />
        </div>
      </div>
    {/if}
    <input
      type="radio"
      name="settings-tabs"
      class="tab"
      aria-label={t("settings.general")}
      checked={tab === "general"}
      onchange={() => (tab = "general")}
    />
    <div class="tab-content pt-4">
      <div class="flex flex-col gap-4">
        <VersionAndUpdates />

        <Components />

        <Translation />

        <GeneralTranscription />

        <GeneralModels {pick} />

        <Logs />

        <About {openLicenses} />
      </div>
    </div>
    <input
      type="radio"
      name="settings-tabs"
      class="tab"
      aria-label={t("settings.preferences")}
      checked={tab === "preferences"}
      onchange={() => (tab = "preferences")}
    />
    <div class="tab-content pt-4">
      <Preferences />
    </div>
  </div>
</Modal>

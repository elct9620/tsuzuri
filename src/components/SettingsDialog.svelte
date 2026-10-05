<script lang="ts">
  import { onMount } from "svelte";

  import type { ProjectView } from "../backend/project";
  import type { ModelSlot } from "../backend/toolchain";
  import { t } from "../i18n";
  import type { HubFile } from "../ui/models";
  import { projectFeed } from "./context";
  import About from "./settings/general/About.svelte";
  import Components from "./settings/general/Components.svelte";
  import GeneralModels from "./settings/general/Models.svelte";
  import GeneralTranscription from "./settings/general/Transcription.svelte";
  import Logs from "./settings/general/Logs.svelte";
  import Preferences from "./settings/Preferences.svelte";
  import Project from "./settings/project/Project.svelte";
  import ProjectModels from "./settings/project/Models.svelte";
  import ProjectTranscription from "./settings/project/Transcription.svelte";
  import Translation from "./settings/general/Translation.svelte";
  import VersionAndUpdates from "./settings/general/VersionAndUpdates.svelte";

  interface Props {
    /** Opens the Repository dialog for a slot, answering the file picked, or none. */
    pick: (slot: ModelSlot) => Promise<HubFile | null>;
    /** Opens the full License Notice. */
    openLicenses: () => void;
  }

  let { pick, openLicenses }: Props = $props();

  const feed = projectFeed();
  let dialog: HTMLDialogElement;
  /** The open Project, whose own settings are offered only while it is open. */
  let project = $state<ProjectView | null>(null);
  let tab = $state<"project" | "general" | "preferences">("general");

  /** Shows the Project's own settings while one is open, at their tab once it has just opened. */
  onMount(() =>
    feed.follow((next) => {
      if (next === null) tab = "general";
      else if (project === null) tab = "project";
      project = next;
    }),
  );

  export function open(): void {
    dialog.showModal();
  }
</script>

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box max-w-3xl">
    <h3 class="mb-2 text-lg font-bold">{t("toolbar.settings")}</h3>
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

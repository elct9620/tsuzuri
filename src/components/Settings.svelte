<script lang="ts">
  import { onMount } from "svelte";

  import type { ProjectView } from "../backend/project";
  import type { ModelSlot } from "../backend/toolchain";
  import { t } from "../i18n";
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
  import RepositoryDialog from "./settings/RepositoryDialog.svelte";
  import Translation from "./settings/general/Translation.svelte";
  import VersionAndUpdates from "./settings/general/VersionAndUpdates.svelte";

  const feed = projectFeed();
  let repositoryDialog: RepositoryDialog;
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

  const pick = (slot: ModelSlot) => repositoryDialog.pick(slot);
</script>

<dialog class="modal" data-dialog-target="dialog">
  <div class="modal-box max-w-3xl">
    <h3 class="mb-2 text-lg font-bold">{t("toolbar.settings")}</h3>
    <div role="tablist" class="tabs tabs-border">
      <input
        type="radio"
        name="settings-tabs"
        class="tab"
        aria-label={t("settings.project")}
        checked={tab === "project"}
        onchange={() => (tab = "project")}
        hidden={project === null}
      />
      <div class="tab-content pt-4" hidden={project === null}>
        {#if project !== null}
          <div class="flex flex-col gap-4">
            <Project {project} />
            <ProjectTranscription {project} />
            <ProjectModels {project} {pick} />
          </div>
        {/if}
      </div>
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
          <RepositoryDialog bind:this={repositoryDialog} />

          <Logs />

          <About />
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

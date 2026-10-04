<script>
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
</script>

<dialog class="modal" data-dialog-target="dialog">
  <div class="modal-box max-w-3xl">
    <h3 class="mb-2 text-lg font-bold" data-i18n="toolbar.settings"></h3>
    <div
      role="tablist"
      class="tabs tabs-border"
      data-controller="project-settings"
      data-project-settings-model-slot-outlet="#project-models [data-controller='model-slot']"
    >
      <input
        type="radio"
        name="settings-tabs"
        class="tab"
        data-i18n-label="settings.project"
        data-project-settings-target="projectTab settings"
        checked
      />
      <div class="tab-content pt-4" data-project-settings-target="settings">
        <div class="flex flex-col gap-4">
          <Project />
          <ProjectTranscription />
          <ProjectModels />
        </div>
      </div>
      <input
        type="radio"
        name="settings-tabs"
        class="tab"
        data-i18n-label="settings.general"
        data-project-settings-target="generalTab"
      />
      <div class="tab-content pt-4">
        <div class="flex flex-col gap-4">
          <VersionAndUpdates />

          <Components />

          <Translation />

          <GeneralTranscription />

          <GeneralModels />
          <RepositoryDialog />

          <Logs />

          <About />
        </div>
      </div>
      <input
        type="radio"
        name="settings-tabs"
        class="tab"
        data-i18n-label="settings.preferences"
      />
      <div class="tab-content pt-4">
        <Preferences />
      </div>
    </div>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn" data-i18n="work.close"></button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

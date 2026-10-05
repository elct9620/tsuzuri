<script lang="ts">
  import EditorBar from "./components/EditorBar.svelte";
  import GlossaryDialog from "./components/GlossaryDialog.svelte";
  import Notifications from "./components/Notifications.svelte";
  import Preview from "./components/Preview.svelte";
  import ResourceList from "./components/ResourceList.svelte";
  import SegmentList from "./components/SegmentList.svelte";
  import DiarizationDialog from "./components/DiarizationDialog.svelte";
  import LicensesDialog from "./components/settings/LicensesDialog.svelte";
  import RepositoryDialog from "./components/settings/RepositoryDialog.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ShortcutsDialog from "./components/ShortcutsDialog.svelte";
  import StartScreen from "./components/StartScreen.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import TranscriptionDialog from "./components/TranscriptionDialog.svelte";
  import TranslationDialog from "./components/TranslationDialog.svelte";
  import UpdatesDialog from "./components/UpdatesDialog.svelte";

  let settingsDialog: SettingsDialog;
  let repositoryDialog: RepositoryDialog;
  let licensesDialog: LicensesDialog;
  let transcriptionDialog: TranscriptionDialog;
  let translationDialog: TranslationDialog;
  let diarizationDialog: DiarizationDialog;
  let glossaryDialog: GlossaryDialog;

  const openSettings = () => settingsDialog.open();
</script>

<main
  class="flex h-dvh flex-col"
  data-controller="project recent-projects transcript segment-changes comparison speakers replacement cleanup search"
  data-comparison-versions-outlet="[data-controller~=versions]"
  data-action="progress:task->transcript#followTask selectionchange@document->transcript#followSelection pointerup@window->transcript#releasePointer editor:cursor@window->transcript#showCursor editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked keydown.ctrl+a@window->segment-changes#checkAll:!typing:prevent keydown.meta+a@window->segment-changes#checkAll:!typing:prevent keydown@window->segment-changes#deleteByShortcut:!typing keydown@window->segment-changes#mergeByShortcut preview:playing->transcript#markPlaying project:select->transcript#showLoading transcript:shown->comparison#mark transcript:shown->speakers#follow segment-changes:speakers->speakers#openForChecked transcript:shown->segment-changes#followTasks versions:compare-with->comparison#compareWith keydown.ctrl+r@window->project#reload:prevent keydown.meta+r@window->project#reload:prevent keydown.ctrl+l@window->transcript#toggleFollowing:prevent keydown.meta+l@window->transcript#toggleFollowing:prevent keydown@window->replacement#openByShortcut keydown@window->search#openByShortcut keydown@window->search#moveByShortcut transcript:shown->search#follow keydown.ctrl+shift+t@window->cleanup#cleanByShortcut:prevent keydown.meta+shift+t@window->cleanup#cleanByShortcut:prevent rust:edit-command@window->cleanup#applyEditCommand transcript:shown->cleanup#follow rust:edit-command@window->segment-changes#applyEditCommand rust:changed-elsewhere-kept@window->project#notifyChangedElsewhereKept rust:srt-requested@window->project#openRequestedSrt"
>
  <StartScreen {openSettings} />

  <div
    class="drawer h-dvh lg:data-is-docked:drawer-open"
    data-project-target="workspace"
    data-controller="resource-list"
    data-action="system:orientation@window->resource-list#follow keydown@window->resource-list#toggleByShortcut project:select@window->resource-list#putAway"
    hidden
  >
    <input
      id="resources-drawer"
      type="checkbox"
      class="drawer-toggle"
      data-resource-list-target="toggle"
    />
    <div class="drawer-content @container flex h-dvh min-w-0 flex-col">
      <Toolbar
        {openSettings}
        openTranscription={() => transcriptionDialog.open()}
        openTranslation={() => translationDialog.open()}
        openDiarization={() => diarizationDialog.open()}
      />
      <div
        class="contents"
        data-controller="preview timeline"
        data-action="editor:cursor@window->timeline#showCursor system:color-scheme@window->timeline#repaintWaveform editor:cursor@window->preview#showCursor rust:video-window-closing@window->preview#closeVideoWindow editor:choice@window->timeline#moveToChoice preferences:saved@window->timeline#readPreferences keydown.space@window->timeline#playOrStop:!control:prevent keydown@window->timeline#setTimeAtMedia:!control keydown.esc@window->timeline#cancel:!control keydown.enter@window->timeline#insertRange:!control focusin@window->timeline#followFocus pointerdown@window->timeline#followModifiers:capture pointermove@window->timeline#followModifiers:capture pointermove@window->timeline#extendDrawing pointerup@window->timeline#finishDrawing"
      >
        <EditorBar />
        <Preview />
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <SegmentList />
      </div>
    </div>
    <ResourceList openGlossary={() => glossaryDialog.open()} />
  </div>
</main>
<SettingsDialog
  bind:this={settingsDialog}
  pick={(slot) => repositoryDialog.pick(slot)}
  openLicenses={() => licensesDialog.open()}
/>
<RepositoryDialog bind:this={repositoryDialog} />
<LicensesDialog bind:this={licensesDialog} />
<TranscriptionDialog bind:this={transcriptionDialog} />
<TranslationDialog bind:this={translationDialog} />
<DiarizationDialog bind:this={diarizationDialog} />
<GlossaryDialog bind:this={glossaryDialog} />
<ShortcutsDialog />
<UpdatesDialog />
<Notifications />

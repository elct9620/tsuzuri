<script lang="ts">
  import { onMount } from "svelte";

  import {
    type ProjectView,
    recentProjects as readRecentProjects,
    type RecentProjectView,
  } from "./backend/project";
  import { projectFeed } from "./components/context";
  import DiarizationDialog from "./components/DiarizationDialog.svelte";
  import EditorBar from "./components/EditorBar.svelte";
  import GlossaryDialog from "./components/GlossaryDialog.svelte";
  import Notifications from "./components/Notifications.svelte";
  import Preview from "./components/Preview.svelte";
  import {
    notifyChangedElsewhereKept,
    openRequestedSrt,
  } from "./components/project-actions";
  import ReplacementDialog from "./components/ReplacementDialog.svelte";
  import { ResourceDock } from "./components/resource-dock.svelte";
  import ResourceList from "./components/ResourceList.svelte";
  import SegmentList from "./components/SegmentList.svelte";
  import LicensesDialog from "./components/settings/LicensesDialog.svelte";
  import RepositoryDialog from "./components/settings/RepositoryDialog.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ShortcutsDialog from "./components/ShortcutsDialog.svelte";
  import StartScreen from "./components/StartScreen.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import Tooltip from "./components/Tooltip.svelte";
  import TranscriptionDialog from "./components/TranscriptionDialog.svelte";
  import TranslationDialog from "./components/TranslationDialog.svelte";
  import Undo from "./components/Undo.svelte";
  import UpdatesDialog from "./components/UpdatesDialog.svelte";
  import VersionsDialog from "./components/VersionsDialog.svelte";

  let settingsDialog: SettingsDialog;
  let repositoryDialog: RepositoryDialog;
  let licensesDialog: LicensesDialog;
  let transcriptionDialog: TranscriptionDialog;
  let translationDialog: TranslationDialog;
  let diarizationDialog: DiarizationDialog;
  let glossaryDialog: GlossaryDialog;
  let shortcutsDialog: ShortcutsDialog;
  let replacementDialog: ReplacementDialog;
  let versionsDialog: VersionsDialog;

  const openSettings = () => settingsDialog.open();
  const dock = new ResourceDock();
  const feed = projectFeed();
  let project = $state<ProjectView | null>(null);
  let recentProjects = $state<RecentProjectView[]>([]);

  $effect(() => {
    document.title = project === null ? "Tsuzuri" : `${project.name} - Tsuzuri`;
  });

  onMount(() =>
    feed.follow(async (next) => {
      project = next;
      // A list that cannot be read is shown as none: the start screen still opens a directory.
      recentProjects = await readRecentProjects().catch(() => []);
    }),
  );
</script>

<svelte:window
  onrust:changed-elsewhere-kept={notifyChangedElsewhereKept}
  onrust:srt-requested={openRequestedSrt}
/>

<main
  class="flex h-dvh flex-col"
  data-controller="transcript segment-changes comparison speakers cleanup search"
  data-action="progress:task->transcript#followTask selectionchange@document->transcript#followSelection pointerup@window->transcript#releasePointer editor:cursor@window->transcript#showCursor editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked keydown.ctrl+a@window->segment-changes#checkAll:!typing:prevent keydown.meta+a@window->segment-changes#checkAll:!typing:prevent keydown@window->segment-changes#deleteByShortcut:!typing keydown@window->segment-changes#mergeByShortcut preview:playing->transcript#markPlaying project:select->transcript#showLoading transcript:shown->comparison#mark transcript:shown->speakers#follow segment-changes:speakers->speakers#openForChecked transcript:shown->segment-changes#followTasks versions:compare-with@window->comparison#compareWith keydown.ctrl+l@window->transcript#toggleFollowing:prevent keydown.meta+l@window->transcript#toggleFollowing:prevent keydown@window->search#openByShortcut keydown@window->search#moveByShortcut transcript:shown->search#follow keydown.ctrl+shift+t@window->cleanup#cleanByShortcut:prevent keydown.meta+shift+t@window->cleanup#cleanByShortcut:prevent rust:edit-command@window->cleanup#applyEditCommand transcript:shown->cleanup#follow rust:edit-command@window->segment-changes#applyEditCommand"
>
  {#if project === null}
    <StartScreen {recentProjects} {openSettings} />
  {/if}

  <div
    class="drawer h-dvh lg:data-is-docked:drawer-open"
    data-is-docked={dock.isDocked ? "" : undefined}
    hidden={project === null}
  >
    <input
      id="resources-drawer"
      type="checkbox"
      class="drawer-toggle"
      bind:checked={dock.isOverlaid}
    />
    <div class="drawer-content @container flex h-dvh min-w-0 flex-col">
      <Toolbar
        {dock}
        {recentProjects}
        {openSettings}
        openShortcuts={() => shortcutsDialog.open()}
        openTranscription={() => transcriptionDialog.open()}
        openTranslation={() => translationDialog.open()}
        openDiarization={() => diarizationDialog.open()}
      />
      <div
        class="contents"
        data-controller="preview timeline"
        data-action="editor:cursor@window->timeline#showCursor system:color-scheme@window->timeline#repaintWaveform editor:cursor@window->preview#showCursor rust:video-window-closing@window->preview#closeVideoWindow editor:choice@window->timeline#moveToChoice preferences:saved@window->timeline#readPreferences keydown.space@window->timeline#playOrStop:!control:prevent keydown@window->timeline#setTimeAtMedia:!control keydown.esc@window->timeline#cancel:!control keydown.enter@window->timeline#insertRange:!control focusin@window->timeline#followFocus pointerdown@window->timeline#followModifiers:capture pointermove@window->timeline#followModifiers:capture pointermove@window->timeline#extendDrawing pointerup@window->timeline#finishDrawing"
      >
        <EditorBar
          openReplacement={() => replacementDialog.open()}
          openVersions={() => versionsDialog.open()}
        />
        <Preview />
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <SegmentList />
      </div>
    </div>
    <ResourceList {dock} openGlossary={() => glossaryDialog.open()} />
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
<ReplacementDialog bind:this={replacementDialog} />
<VersionsDialog bind:this={versionsDialog} />
<ShortcutsDialog bind:this={shortcutsDialog} />
<UpdatesDialog />
<Notifications />
<Tooltip />
<Undo />

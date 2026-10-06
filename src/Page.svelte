<script lang="ts">
  import { onMount } from "svelte";

  import {
    type ProjectView,
    recentProjects as readRecentProjects,
    type RecentProjectView,
  } from "#/ipc/project.ts";
  import {
    editorComparison,
    projectFeed,
    setSegmentDialogs,
  } from "#/state/context.ts";
  import DiarizationDialog from "#/components/DiarizationDialog.svelte";
  import EditTools from "#/components/EditTools.svelte";
  import ResourceBar from "#/components/ResourceBar.svelte";
  import GlossaryDialog from "#/components/GlossaryDialog.svelte";
  import Notifications from "#/components/Notifications.svelte";
  import Preview from "#/components/Preview.svelte";
  import Timeline from "#/components/Timeline.svelte";
  import {
    notifyChangedElsewhereKept,
    openRequestedSrt,
  } from "#/actions/project.ts";
  import { Playback } from "#/state/playback.svelte.ts";
  import { PreviewFold } from "#/state/preview-fold.svelte.ts";
  import ReplacementDialog from "#/components/ReplacementDialog.svelte";
  import { ResourceDock } from "#/state/resource-dock.svelte.ts";
  import { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
  import ResourceList from "#/components/ResourceList.svelte";
  import SegmentList from "#/components/SegmentList.svelte";
  import LicensesDialog from "#/components/settings/LicensesDialog.svelte";
  import RepositoryDialog from "#/components/settings/RepositoryDialog.svelte";
  import SettingsDialog from "#/components/settings/SettingsDialog.svelte";
  import ShiftDialog from "#/components/ShiftDialog.svelte";
  import ShortcutsDialog from "#/components/ShortcutsDialog.svelte";
  import SpeakersDialog from "#/components/SpeakersDialog.svelte";
  import StartScreen from "#/components/StartScreen.svelte";
  import Toolbar from "#/components/Toolbar.svelte";
  import Tooltip from "#/components/Tooltip.svelte";
  import TranscriptionDialog from "#/components/TranscriptionDialog.svelte";
  import TranslationDialog from "#/components/TranslationDialog.svelte";
  import Undo from "#/components/Undo.svelte";
  import UpdatesDialog from "#/components/UpdatesDialog.svelte";
  import VersionsDialog from "#/components/VersionsDialog.svelte";

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
  let speakersDialog: SpeakersDialog;
  let shiftDialog: ShiftDialog;
  let segmentList: SegmentList;

  const openSettings = () => settingsDialog.open();
  const dock = new ResourceDock();
  const playback = new Playback();
  const fold = new PreviewFold();
  const placeholders = new ResourcePlaceholders();
  const feed = projectFeed();
  const comparison = editorComparison();
  setSegmentDialogs({
    openRetranslation: (indexes) => translationDialog.openForSegments(indexes),
    openRetranscription: (scope) =>
      void transcriptionDialog.openForScope(scope),
    openShift: () => shiftDialog.open(),
    openSpeakers: (indexes) => speakersDialog.openFor(indexes),
  });
  let project = $state<ProjectView | null>(null);
  let recentProjects = $state<RecentProjectView[]>([]);

  $effect(() => {
    document.title = project === null ? "Tsuzuri" : `${project.name} - Tsuzuri`;
  });

  onMount(() =>
    feed.follow(async (next) => {
      project = next;
      void comparison.show(next);
      // A list that cannot be read is shown as none: the start screen still opens a directory.
      recentProjects = await readRecentProjects().catch(() => []);
    }),
  );
</script>

<svelte:window
  onrust:changed-elsewhere-kept={notifyChangedElsewhereKept}
  onrust:srt-requested={openRequestedSrt}
/>

<main class="flex h-dvh flex-col">
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
        {project}
        {dock}
        {recentProjects}
        {openSettings}
        openShortcuts={() => shortcutsDialog.open()}
      />
      <div class="flex items-center gap-2 border-b border-base-300 px-4 py-2">
        <ResourceBar
          {project}
          openTranscription={() => transcriptionDialog.open()}
          openTranslation={() => translationDialog.open()}
          openDiarization={() => diarizationDialog.open()}
        />
        <EditTools
          {project}
          openReplacement={() => replacementDialog.open()}
          openVersions={(subtitle) => versionsDialog.open(subtitle)}
          openSearch={() => segmentList.openSearch()}
          openSpeakers={() => speakersDialog.open()}
          {fold}
        />
      </div>
      <Preview {playback} {fold} />
      <Timeline {playback} {fold} />
      <div class="flex-1 overflow-y-auto p-4">
        <SegmentList
          {project}
          {playback}
          {placeholders}
          bind:this={segmentList}
        />
      </div>
    </div>
    <ResourceList
      {project}
      {dock}
      openGlossary={() => glossaryDialog.open()}
      {placeholders}
    />
  </div>
</main>
<SettingsDialog
  bind:this={settingsDialog}
  pick={(slot) => repositoryDialog.pick(slot)}
  openLicenses={() => licensesDialog.open()}
/>
<RepositoryDialog bind:this={repositoryDialog} />
<LicensesDialog bind:this={licensesDialog} />
<TranscriptionDialog {project} bind:this={transcriptionDialog} />
<TranslationDialog {project} bind:this={translationDialog} />
<DiarizationDialog {project} bind:this={diarizationDialog} />
<GlossaryDialog bind:this={glossaryDialog} />
<ReplacementDialog bind:this={replacementDialog} />
<VersionsDialog bind:this={versionsDialog} />
<SpeakersDialog {project} bind:this={speakersDialog} />
<ShiftDialog bind:this={shiftDialog} />
<ShortcutsDialog bind:this={shortcutsDialog} />
<UpdatesDialog />
<Notifications />
<Tooltip />
<Undo />

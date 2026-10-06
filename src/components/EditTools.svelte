<!--
  @component
  The edit tools: searching, replacing, setting Speakers and the Versions of the whole subtitle,
  the View menu, and the buttons folding the Preview's parts away.
-->
<script lang="ts">
  import AudioWaveform from "@lucide/svelte/icons/audio-waveform";
  import History from "@lucide/svelte/icons/history";
  import Replace from "@lucide/svelte/icons/replace";
  import Search from "@lucide/svelte/icons/search";
  import SquarePlay from "@lucide/svelte/icons/square-play";
  import Users from "@lucide/svelte/icons/users";

  import type { Language, ProjectView } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import { playedSource } from "#/ui/silence.ts";
  import type { PreviewFold } from "#/state/preview-fold.svelte.ts";
  import type { CaptionChoices } from "#/state/caption-choices.svelte.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { ViewChoices } from "#/state/view-choices.svelte.ts";
  import ViewMenu from "#/components/ViewMenu.svelte";

  interface Props {
    /** The open Project, as Page reads it. */
    project: ProjectView | null;
    openReplacement: () => void;
    /** Opens the Versions dialog at the subtitle in a Language, or at the original for none. */
    openVersions: (subtitle?: Language | null) => void;
    openSearch: () => void;
    openSpeakers: () => void;
    /** The parts of the Preview folded away, which only a Current Resource has to fold. */
    fold: PreviewFold;
    playback: Playback;
    captionChoices: CaptionChoices;
    viewChoices: ViewChoices;
  }

  let {
    project,
    openReplacement,
    openVersions,
    openSearch,
    openSpeakers,
    fold,
    playback,
    captionChoices,
    viewChoices,
  }: Props = $props();

  const hasPreview = $derived(playedSource(project, null) !== null);
</script>

<div class="flex shrink-0 items-center gap-2">
  <button
    type="button"
    class="btn btn-sm"
    onclick={openSearch}
    aria-label={t("search.open")}
    data-tooltip={t("search.open")}
    data-shortcut="search"
  >
    <Search class="size-4" aria-hidden="true" /><span class="hidden @5xl:inline"
      >{t("search.open")}</span
    >
  </button>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openReplacement}
    aria-label={t("replace.open")}
    data-tooltip={t("replace.open")}
    data-shortcut="replace"
  >
    <Replace class="size-4" aria-hidden="true" /><span
      class="hidden @5xl:inline">{t("replace.open")}</span
    >
  </button>
  <button
    type="button"
    class="btn btn-sm"
    onclick={openSpeakers}
    aria-label={t("edit.speakers")}
    data-tooltip={t("edit.speakers")}
  >
    <Users class="size-4" aria-hidden="true" /><span class="hidden @5xl:inline"
      >{t("edit.speakers")}</span
    >
  </button>
  <button
    type="button"
    class="btn btn-sm"
    onclick={() => openVersions()}
    aria-label={t("versions.open")}
    data-tooltip={t("versions.open")}
  >
    <History class="size-4" aria-hidden="true" /><span
      class="hidden @5xl:inline">{t("versions.open")}</span
    >
  </button>
  <ViewMenu
    {project}
    {playback}
    {captionChoices}
    {viewChoices}
    {openVersions}
  />
  {#if hasPreview}
    <!-- Each lights while its part is folded away, as a toggle button is lit while it is on -->
    <button
      type="button"
      class={["btn btn-square btn-sm", fold.isPlayerFolded && "btn-primary"]}
      aria-pressed={fold.isPlayerFolded}
      aria-label={t("preview.foldPlayer")}
      data-tooltip={t("preview.foldPlayer")}
      onclick={() => fold.togglePlayer()}
    >
      <SquarePlay class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      class={["btn btn-square btn-sm", fold.isTimelineFolded && "btn-primary"]}
      aria-pressed={fold.isTimelineFolded}
      aria-label={t("preview.foldTimeline")}
      data-tooltip={t("preview.foldTimeline")}
      onclick={() => fold.toggleTimeline()}
    >
      <AudioWaveform class="size-4" aria-hidden="true" />
    </button>
  {/if}
</div>

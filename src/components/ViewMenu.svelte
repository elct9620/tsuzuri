<!--
  @component
  The View menu: the choices set once and seldom touched — following playback and playing alone,
  what is shown over the video, Snapping on the timeline, the Speaker column and the comparison —
  gathered so the editor keeps only what each Segment needs.
-->
<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Eye from "@lucide/svelte/icons/eye";

  import type { ProjectView } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import type { CaptionChoices } from "#/state/caption-choices.svelte.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { ViewChoices } from "#/state/view-choices.svelte.ts";
  import CaptionControls from "#/components/CaptionControls.svelte";
  import CompareMenu from "#/components/CompareMenu.svelte";

  interface Props {
    /** The open Project, as Page reads it. */
    project: ProjectView | null;
    playback: Playback;
    captionChoices: CaptionChoices;
    viewChoices: ViewChoices;
    /** Opens the Versions dialog at the subtitle in a Language, or at the original for none. */
    openVersions: (subtitle: string | null) => void;
  }

  let { project, playback, captionChoices, viewChoices, openVersions }: Props =
    $props();

  const hasTranslation = $derived(
    (project?.shown_translation ?? null) !== null,
  );
</script>

<div class="dropdown dropdown-end">
  <div
    tabindex="0"
    role="button"
    class="btn btn-sm"
    aria-label={t("view.label")}
    data-tooltip={t("view.label")}
  >
    <Eye class="size-4" aria-hidden="true" /><span class="hidden @5xl:inline"
      >{t("view.label")}</span
    >
    <ChevronDown class="size-4" aria-hidden="true" />
  </div>
  <div
    tabindex="-1"
    class="dropdown-content z-20 max-h-[70vh] w-72 overflow-y-auto rounded-box bg-base-100 p-3 shadow-md"
  >
    <fieldset class="fieldset">
      <legend class="fieldset-legend">{t("view.playback")}</legend>
      <label
        class="label justify-between"
        data-tooltip={t("preview.followingHint")}
        data-shortcut="following"
      >
        <span>{t("preview.following")}</span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={playback.isFollowing}
          onchange={() => playback.toggleFollowing()}
        />
      </label>
      <label
        class="label justify-between"
        data-tooltip={t("preview.playingAloneHint")}
      >
        <span>{t("preview.playingAlone")}</span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={playback.isPlayingAlone}
          onchange={() => playback.togglePlayingAlone()}
        />
      </label>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">{t("view.captions")}</legend>
      <CaptionControls
        choices={captionChoices}
        {hasTranslation}
        hasPicture={playback.hasPicture}
      />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">{t("view.timeline")}</legend>
      <label
        class="label justify-between"
        data-tooltip={t("preview.snappingHint")}
      >
        <span>{t("preview.snapping")}</span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={viewChoices.isSnapping}
          onchange={() => viewChoices.toggleSnapping()}
        />
      </label>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">{t("view.segments")}</legend>
      <label class="label justify-between">
        <span>{t("view.speakerColumn")}</span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={viewChoices.isSpeakerColumnShown}
          onchange={() => viewChoices.toggleSpeakerColumn()}
        />
      </label>
      <details class="collapse-arrow collapse">
        <summary class="collapse-title min-h-0 px-0 py-1"
          >{t("compare.label")}</summary
        >
        <div class="collapse-content px-0">
          <CompareMenu {openVersions} />
        </div>
      </details>
    </fieldset>
  </div>
</div>

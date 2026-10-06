<!--
  @component
  The Current Segment as the Preview shows it beside the media: its number, times and length,
  Speaker, text and translation, with the keys that play it and set its times; or a hint to pick one.
-->
<script lang="ts">
  import type { Segment } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import { MS_PER_SECOND, formatTime } from "#/ui/time.ts";
  import { formatLength } from "#/ui/timeline-spans.ts";
  import { editingState } from "#/state/context.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import CurrentSegmentKeys from "#/components/CurrentSegmentKeys.svelte";

  let { segments, playback }: { segments: Segment[]; playback: Playback } =
    $props();
  const editing = editingState();
  const currentIndex = $derived(editing.cursor.index);
  const currentSegment = $derived(
    currentIndex === null ? undefined : segments[currentIndex],
  );
</script>

{#if currentSegment && currentIndex !== null}
  <div class="flex min-h-0 flex-col gap-1">
    <h3 class="card-title text-sm">
      <span>{t("preview.current")}</span>
      <span class="badge badge-sm">#{currentIndex + 1}</span>
      <span class="text-xs font-normal tabular-nums text-base-content/60"
        >{formatTime(currentSegment.start_ms)} → {formatTime(
          currentSegment.end_ms,
        )}</span
      >
      <span class="badge badge-sm badge-ghost tabular-nums" data-length
        >{formatLength({
          start: currentSegment.start_ms / MS_PER_SECOND,
          end: currentSegment.end_ms / MS_PER_SECOND,
        })}</span
      >
      {#if currentSegment.speaker}
        <span class="badge badge-sm badge-neutral max-w-32 truncate"
          >{currentSegment.speaker}</span
        >
      {/if}
    </h3>
    <p class="line-clamp-3 text-lg whitespace-pre-line">
      {currentSegment.text}
    </p>
    <p
      class="line-clamp-2 whitespace-pre-line text-[color-mix(in_oklab,var(--color-info)_60%,var(--color-base-content))]"
    >
      {currentSegment.translation ?? ""}
    </p>
    <CurrentSegmentKeys {playback} />
  </div>
{:else}
  <p class="text-sm text-base-content/60">
    {t("preview.pickSegment")}
  </p>
{/if}

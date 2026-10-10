<!--
  @component
  The keys that act on the Current Segment: Space playing it, and the two setting its start and end
  where the media is, as its card and its unfolded row show them.
-->
<script module lang="ts">
  import { chords, type Shortcut, shortcutById } from "#/ui/shortcuts.ts";

  /** The keys that set the Current Segment's start and end where the media is, as `KeyboardEvent.key` names them. */
  function timeKeys(isMac: boolean): Record<"start" | "end", string> {
    const key = (shortcut: Shortcut) =>
      chords(shortcut, isMac)[0].toUpperCase();
    return {
      start: key(shortcutById("setStart")),
      end: key(shortcutById("setEnd")),
    };
  }
</script>

<script lang="ts">
  import { isMacOS } from "#/ipc/system.ts";
  import { t } from "#/i18n.ts";
  import type { Playback } from "#/state/playback.svelte.ts";

  let { playback }: { playback: Playback } = $props();
  const keys = timeKeys(isMacOS());
</script>

<p class="text-xs text-base-content/60">
  <kbd class="kbd kbd-xs">{t("shortcuts.keys.space")}</kbd>
  <span
    >{t(
      playback.isPlayingAlone ? "preview.playCurrent" : "preview.playOn",
    )}</span
  >
</p>
<p class="text-xs text-base-content/60">
  <kbd class="kbd kbd-xs">{keys.start}</kbd>
  <kbd class="kbd kbd-xs">{keys.end}</kbd>
  <span>{t("preview.setTimes")}</span>
</p>

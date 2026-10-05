<script lang="ts">
  import { isMacOS } from "../backend/system";
  import { t } from "../i18n";
  import { shortcutById, shortcutText } from "../ui/shortcuts";

  /** The text of `trigger`'s tooltip, followed by the keys of the Shortcut it names. */
  function tipOf({ dataset }: HTMLElement): string | undefined {
    const shortcut = shortcutById(dataset.shortcut ?? "");
    if (!shortcut) return dataset.tooltip;
    const keys = shortcutText(shortcut, isMacOS());
    return dataset.tooltip
      ? t("shortcuts.withKeys", { tip: dataset.tooltip, keys })
      : keys;
  }

  let bubble: HTMLElement;
  /** Whether the bubble is in the top layer now. */
  let isShown = false;
  let tip = $state<string>();
  let triggerBox = $state({ left: 0, top: 0, width: 0, height: 0 });
  /** Opening away from the nearer window edge keeps the tip on screen. */
  let isInRightHalf = $state(false);

  /** Shows the tip of the element with `data-tooltip` or `data-shortcut` the pointer or focus has come to. */
  function show({ target }: Event): void {
    if (!(target instanceof Element)) return;
    const trigger = target.closest<HTMLElement>(
      "[data-tooltip], [data-shortcut]",
    );
    if (!trigger) return;
    const { left, top, width, height } = trigger.getBoundingClientRect();
    triggerBox = { left, top, width, height };
    isInRightHalf = left + width / 2 > window.innerWidth / 2;
    tip = tipOf(trigger);
    // Showing it again lays it over a dialog opened since it last showed.
    hide();
    bubble.showPopover();
    isShown = true;
  }

  /** Hides the tip; bound to `scroll` in the capture phase too, since a scrolling list does not bubble it. */
  function hide(): void {
    if (!isShown) return;
    bubble.hidePopover();
    isShown = false;
  }
</script>

<svelte:document
  onpointerover={show}
  onfocusin={show}
  onpointerout={hide}
  onfocusout={hide}
  onscrollcapture={hide}
/>

<!--
  One daisyUI tooltip for the whole page, placed over whichever element the pointer or focus is on.
  daisyUI draws a tooltip inside its element, where a scrolling list or a dialog cuts it off; as a
  popover this one sits in the top layer above them. The popover's own margin, border, padding,
  background and overflow are taken off so it lies exactly over the element and shows the tip
  drawn outside it.
-->
<div
  bind:this={bubble}
  popover="manual"
  class="tooltip tooltip-open pointer-events-none m-0 overflow-visible border-0 bg-transparent p-0 {isInRightHalf
    ? 'tooltip-left'
    : 'tooltip-right'}"
  style:left="{triggerBox.left}px"
  style:top="{triggerBox.top}px"
  style:width="{triggerBox.width}px"
  style:height="{triggerBox.height}px"
  data-tip={tip}
></div>

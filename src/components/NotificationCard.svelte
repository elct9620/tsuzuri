<script lang="ts">
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import X from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";

  import { t } from "#/i18n.ts";
  import {
    NOTIFICATION_MS,
    TICK_MS,
    notificationStack,
    type NotificationKind,
    type ShownNotification,
  } from "#/state/notification.svelte.ts";

  /** A check, an exclamation and a cross, each in a circle or a triangle. */
  const KIND_ICONS: Record<NotificationKind, typeof CircleCheck> = {
    success: CircleCheck,
    warning: TriangleAlert,
    error: CircleX,
  };

  /**
   * The colour of each kind, written out in full so Tailwind finds each class: the card keeps the
   * page's own colour and only its edge and icon carry the kind.
   */
  const KIND_CLASSES: Record<NotificationKind, { edge: string; icon: string }> =
    {
      success: { edge: "border-l-success", icon: "text-success" },
      warning: { edge: "border-l-warning", icon: "text-warning" },
      error: { edge: "border-l-error", icon: "text-error" },
    };

  let { shownNotification }: { shownNotification: ShownNotification } =
    $props();

  const { id, notification } = $derived(shownNotification);
  const { title, kind, detail, items, action } = $derived(notification);
  const KindIcon = $derived(KIND_ICONS[kind]);
  /** An error stays until closed; anything else counts down. */
  const isStaying = $derived(kind === "error");

  let remainingMs = $state(NOTIFICATION_MS);
  /** What rests on the card now: the pointer, focus, or both. */
  const restingInputs = new Set<"pointer" | "focus">();

  onMount(() => {
    if (isStaying) return;
    const timer = setInterval(() => {
      if (shownNotification.isLeaving) return clearInterval(timer);
      if (restingInputs.size > 0) return;
      remainingMs -= TICK_MS;
      if (remainingMs > 0) return;
      clearInterval(timer);
      notificationStack.leave(id);
    }, TICK_MS);
    return () => clearInterval(timer);
  });

  function act(run: () => void): void {
    run();
    notificationStack.leave(id);
  }
</script>

<!--
  A card sliding in from the right as daisyUI's toast fades it in, and fading away as it slides
  back; still for a system asking for less motion, as the toast's own animation is.
-->
<div
  role="alert"
  class="alert w-80 items-start border border-l-4 border-base-300 bg-base-100 text-sm shadow-lg transition-[opacity,translate] duration-200 ease-out starting:translate-x-8 data-is-leaving:translate-x-8 data-is-leaving:opacity-0 motion-reduce:transition-none {KIND_CLASSES[
    kind
  ].edge}"
  data-is-leaving={shownNotification.isLeaving ? "" : undefined}
  onmouseenter={() => restingInputs.add("pointer")}
  onmouseleave={() => restingInputs.delete("pointer")}
  onfocusin={() => restingInputs.add("focus")}
  onfocusout={() => restingInputs.delete("focus")}
>
  <KindIcon
    class="size-5 shrink-0 {KIND_CLASSES[kind].icon}"
    data-kind={kind}
  />
  <div class="flex w-full min-w-0 flex-col gap-1">
    <strong class="notification-title">{title}</strong>
    {#if detail}
      <p class="notification-detail text-base-content/70">{detail}</p>
    {/if}
    {#if items?.length}
      <dl
        class="grid grid-cols-[1fr_auto] gap-x-6 text-base-content/70 [&_dd]:text-right [&_dd]:tabular-nums"
      >
        {#each items as [name, value], index (index)}
          <dt>{name}</dt>
          <dd>{value}</dd>
        {/each}
      </dl>
    {/if}
    {#if !isStaying}
      <progress class="progress h-1" max={NOTIFICATION_MS} value={remainingMs}
      ></progress>
    {/if}
  </div>
  <div class="flex items-center gap-1">
    {#if action}
      <button type="button" class="btn btn-sm" onclick={() => act(action.run)}
        >{action.label}</button
      >
    {/if}
    <button
      type="button"
      class="btn btn-sm btn-circle btn-ghost"
      aria-label={t("work.close")}
      data-close-button
      onclick={() => notificationStack.leave(id)}><X class="size-4" /></button
    >
  </div>
</div>

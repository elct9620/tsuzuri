<!--
  @component
  The bar that shows while Segments are checked: how many, and the Segment Changes that reach them
  at once, the same a right-click on a row offers then.
-->
<script lang="ts">
  import { onMount } from "svelte";

  import type { ProjectView } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import {
    editingSession,
    editingState,
    projectFeed,
    segmentDialogs,
  } from "#/state/context.ts";
  import { checkedChoices, resourceOffers } from "#/actions/segment-changes.ts";

  const feed = projectFeed();
  const session = editingSession();
  const editing = editingState();
  const dialogs = segmentDialogs();
  let project = $state.raw<ProjectView | null>(null);
  const indexes = $derived(editing.checkedIndexes);

  const choices = $derived(
    checkedChoices(session, dialogs, indexes, resourceOffers(project)),
  );

  onMount(() => feed.follow((next) => (project = next)));
</script>

{#if indexes.length > 0}
  <div
    class="flex items-center gap-2 rounded-box bg-base-200 px-3 py-1.5 text-sm"
  >
    <span>{t("edit.checkedCount", { count: indexes.length })}</span>
    {#each choices as choice (choice.id)}
      <button
        type="button"
        class={["btn btn-xs", choice.id === "clearChecks" && "btn-ghost"]}
        data-shortcut={choice.shortcut}
        disabled={!choice.isEnabled}
        onclick={() => choice.run()}>{choice.label}</button
      >
    {/each}
  </div>
{/if}

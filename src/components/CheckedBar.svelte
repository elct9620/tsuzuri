<!--
  @component
  The bar that shows while Segments are checked: how many, and the Segment Changes that reach them
  at once, the same a right-click on a row offers then.
-->
<script lang="ts">
  import { onMount } from "svelte";

  import type { ProjectView } from "#/backend/project.ts";
  import { t } from "#/i18n.ts";
  import {
    editingSession,
    projectFeed,
    segmentDialogs,
  } from "#/components/context.ts";
  import {
    checkedChoices,
    resourceOffers,
  } from "#/components/segment-changes.ts";

  const feed = projectFeed();
  const session = editingSession();
  const dialogs = segmentDialogs();
  let project = $state.raw<ProjectView | null>(null);
  let indexes = $state.raw<number[]>([]);

  const choices = $derived(
    checkedChoices(session, dialogs, indexes, resourceOffers(project)),
  );

  onMount(() =>
    feed.follow((next) => {
      project = next;
      indexes = session.checkedIndexes;
    }),
  );
</script>

<svelte:window oneditor:checks={() => (indexes = session.checkedIndexes)} />

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

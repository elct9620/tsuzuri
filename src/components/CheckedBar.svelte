<!--
  @component
  The bar that shows while Segments are checked: how many, and what can be done to them at once.
  A cleanup is offered only where the Current Resource shows a text in `zh-TW`.
-->
<script lang="ts">
  import { onMount } from "svelte";

  import { hasTraditionalChinese, type ProjectView } from "../backend/project";
  import { t } from "../i18n";
  import { cleanSegments } from "./cleanup-actions";
  import { editingSession, projectFeed } from "./context";

  const feed = projectFeed();
  const session = editingSession();
  let project = $state.raw<ProjectView | null>(null);

  onMount(() => feed.follow((next) => (project = next)));
</script>

<div
  class="flex items-center gap-2 rounded-box bg-base-200 px-3 py-1.5 text-sm"
  data-segment-changes-target="checkedBar"
  hidden
>
  <span data-segment-changes-target="checkedCount"></span>
  <button
    type="button"
    class="btn btn-xs"
    data-segment-changes-target="mergeButton"
    data-action="segment-changes#merge"
    data-i18n="edit.merge"
  ></button>
  <button
    type="button"
    class="btn btn-xs"
    data-action="segment-changes#openShift"
    data-i18n="edit.shift"
  ></button>
  <button
    type="button"
    class="btn btn-xs"
    data-action="segment-changes#openSpeakers"
    data-i18n="edit.speakersOfChecked"
  ></button>
  <button
    type="button"
    class="btn btn-xs"
    data-segment-changes-target="retranslateButton"
    data-action="segment-changes#retranslate"
    data-i18n="edit.retranslate"
  ></button>
  <button
    type="button"
    class="btn btn-xs"
    data-segment-changes-target="retranscribeButton"
    data-action="segment-changes#retranscribe"
    data-i18n="edit.retranscribe"
  ></button>
  {#if hasTraditionalChinese(project)}
    <button
      type="button"
      class="btn btn-xs"
      data-shortcut="cleanup"
      onclick={() => cleanSegments(session, session.checkedIndexes)}
      >{t("cleanup.action")}</button
    >
  {/if}
  <button
    type="button"
    class="btn btn-xs"
    data-action="segment-changes#deleteChecked"
    data-i18n="edit.delete"
    data-shortcut="delete"
  ></button>
  <button
    type="button"
    class="btn btn-ghost btn-xs"
    data-action="segment-changes#clearChecks"
    data-i18n="edit.clearChecks"
  ></button>
</div>

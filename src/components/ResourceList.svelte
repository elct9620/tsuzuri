<script lang="ts">
  import GlossaryDialog from "./GlossaryDialog.svelte";

  let glossaryDialog: GlossaryDialog;
</script>

<div class="drawer-side">
  <label
    for="resources-drawer"
    class="drawer-overlay"
    data-i18n-label="resources.close"
  ></label>
  <div class="flex min-h-full w-56 flex-col bg-base-300">
    <ul class="menu w-full pb-0">
      <li class="menu-title flex flex-row items-center justify-between">
        <span data-i18n="resources.title"></span>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs"
          data-action="project#reload"
          data-i18n-label="resources.reload"
          data-i18n-tooltip="resources.reloadHint"
          data-shortcut="reload"
        >
          <i data-lucide="refresh-cw" class="size-3.5"></i>
        </button>
      </li>
    </ul>
    <ul
      class="menu w-full grow gap-1 [&_button]:flex"
      data-project-target="resources"
    ></ul>
    <ul class="menu w-full text-base-content/70">
      <li>
        <button
          type="button"
          data-project-target="glossary"
          onclick={() => glossaryDialog.open()}
        ></button>
      </li>
    </ul>
    <GlossaryDialog bind:this={glossaryDialog} />
  </div>
</div>

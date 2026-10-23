<!--
  @component
  The Macros menu: each Macro this machine's Scripts register, run on the Current Resource with the
  Checked Segments. It reads the Scripts as it appears, as it opens, as the window comes back into
  focus, as after adding a Script in the file manager, and as a scan elsewhere finds them changed,
  so a Script added or edited since shows as it is now; it stays out of the way while no Script
  registers a Macro, and so cannot be opened.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import WandSparkles from "@lucide/svelte/icons/wand-sparkles";

  import { currentResource, type ProjectView } from "#/ipc/project.ts";
  import {
    runMacro,
    scanScripts,
    scriptMacros,
    type ScriptMacro,
  } from "#/ipc/scripts.ts";
  import { t } from "#/i18n.ts";
  import { closeMenu } from "#/ui/menu.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import { editingSession, editingState, taskRun } from "#/state/context.ts";
  import ScriptMenuItem from "#/components/ScriptMenuItem.svelte";

  let { project }: { project: ProjectView | null } = $props();

  const run = taskRun();
  const session = editingSession();
  const editing = editingState();
  let macros = $state.raw<ScriptMacro[]>([]);

  const hasSubtitle = $derived(currentResource(project)?.has_subtitle ?? false);

  async function readMacros(): Promise<void> {
    await attempt(t("script.unscanned"), async () => {
      macros = scriptMacros(await scanScripts(false));
    });
  }

  onMount(readMacros);

  async function start(
    macro: ScriptMacro,
    item: EventTarget | null,
  ): Promise<void> {
    closeMenu(item);
    if (run.isBusy) return;
    await run.perform(
      "script",
      async () => {
        await runMacro(macro, editing.checkedIndexes);
        // The Segments it wrote have moved, so the positions checked no longer point at them.
        session.uncheckAll();
      },
      macro.label,
    );
  }
</script>

<svelte:window onfocus={readMacros} onrust:scripts-changed={readMacros} />

{#if macros.length > 0}
  <div class="dropdown dropdown-end">
    <div
      tabindex="0"
      role="button"
      class="btn btn-sm"
      aria-label={t("toolbar.macros")}
      data-tooltip={t("toolbar.macros")}
      onfocus={readMacros}
    >
      <WandSparkles class="size-4" aria-hidden="true" /><span
        class="hidden @5xl:inline">{t("toolbar.macros")}</span
      >
      <ChevronDown class="size-4" aria-hidden="true" />
    </div>
    <ul
      tabindex="-1"
      class="menu dropdown-content z-10 w-max min-w-52 rounded-box bg-base-100 shadow-md"
    >
      {#each macros as macro (`${macro.script}:${macro.id}`)}
        <ScriptMenuItem
          label={macro.label}
          script={macro.script}
          disabled={!hasSubtitle || run.isBusy}
          choose={(item) => start(macro, item)}
        />
      {/each}
    </ul>
  </div>
{/if}

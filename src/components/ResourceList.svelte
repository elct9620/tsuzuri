<script lang="ts">
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import { onMount } from "svelte";

  import { selectResource, type ProjectView } from "../backend/project";
  import { isMacOS } from "../backend/system";
  import { t } from "../i18n";
  import { notifyFailure } from "../ui/notification.svelte";
  import { isShortcut } from "../ui/shortcuts";
  import { projectFeed } from "./context";
  import { reload } from "./project-actions";
  import type { ResourceDock } from "./resource-dock.svelte";

  interface Props {
    dock: ResourceDock;
    openGlossary: () => void;
  }

  let { dock, openGlossary }: Props = $props();

  const feed = projectFeed();
  let project = $state<ProjectView | null>(null);

  const glossaryLabel = $derived.by(() => {
    const glossary = project?.translation_glossary ?? null;
    return glossary === null
      ? t("resources.createGlossary")
      : t("resources.glossary", { count: glossary.term_count });
  });

  /**
   * Selects the Resource named `name`, putting the list away and telling the page from `row` as
   * `project:select` that one is being read.
   */
  async function select(row: HTMLElement, name: string): Promise<void> {
    dock.putAway();
    row.dispatchEvent(new CustomEvent("project:select", { bubbles: true }));
    try {
      await selectResource(name);
    } catch (error) {
      notifyFailure(t("resources.notSelected"), error);
      // Rust announces nothing when it could not select, so the editor is told to read what it holds.
      await feed.refresh();
    }
  }

  /**
   * Docks or undocks the list, or lays it over a narrow window's editor, or reloads the Project,
   * as the list's buttons do.
   */
  function actByShortcut(event: KeyboardEvent): void {
    const isMac = isMacOS();
    if (isShortcut(event, "resourceList", isMac)) {
      event.preventDefault();
      dock.toggle();
    } else if (isShortcut(event, "reload", isMac)) {
      event.preventDefault();
      void reload(feed);
    }
  }

  onMount(() => feed.follow((next) => (project = next)));
</script>

<svelte:window onkeydown={actByShortcut} />

<div class="drawer-side">
  <label
    for="resources-drawer"
    class="drawer-overlay"
    aria-label={t("resources.close")}
  ></label>
  <div class="flex min-h-full w-56 flex-col bg-base-300">
    <ul class="menu w-full pb-0">
      <li class="menu-title flex flex-row items-center justify-between">
        <span>{t("resources.title")}</span>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs"
          onclick={() => reload(feed)}
          aria-label={t("resources.reload")}
          data-tooltip={t("resources.reloadHint")}
          data-shortcut="reload"
        >
          <RefreshCw class="size-3.5" />
        </button>
      </li>
    </ul>
    <ul
      class="menu w-full grow gap-1 [&_button]:flex"
      aria-label={t("resources.title")}
    >
      {#each project?.resources ?? [] as resource (resource.name)}
        <li>
          <button
            type="button"
            class={[
              "flex-col items-start gap-1",
              resource.name === project?.current_resource && "menu-active",
            ]}
            data-tooltip={resource.name}
            onclick={({ currentTarget }) =>
              select(currentTarget, resource.name)}
          >
            <span class="line-clamp-2 break-all">{resource.name}</span>
            {#if !resource.has_media || !resource.has_subtitle || resource.translation_languages.length > 0}
              <span class="flex items-center gap-1">
                {#if !resource.has_media}
                  <span
                    class="badge badge-sm badge-outline"
                    data-tooltip={t("resources.subtitleOnlyHint")}
                    >{t("resources.subtitleOnly")}</span
                  >
                {/if}
                {#if !resource.has_subtitle}
                  <span
                    class="status status-warning"
                    data-tooltip={t("resources.noSubtitle")}
                  ></span>
                {/if}
                {#each resource.translation_languages as code (code)}
                  <span class="badge badge-sm">{code}</span>
                {/each}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
    <ul class="menu w-full text-base-content/70">
      <li>
        <button type="button" onclick={openGlossary}>{glossaryLabel}</button>
      </li>
    </ul>
  </div>
</div>

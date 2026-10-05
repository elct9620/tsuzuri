<script lang="ts">
  import type { RecentProjectView } from "../backend/project";
  import { interfaceLanguageCode, t } from "../i18n";
  import { projectFeed } from "./context";
  import { openRecent } from "./project-actions";

  interface Props {
    recentProjects: RecentProjectView[];
    openSettings: () => void;
  }

  let { recentProjects, openSettings }: Props = $props();

  const feed = projectFeed();
  const dateFormat = new Intl.DateTimeFormat(interfaceLanguageCode(), {
    dateStyle: "medium",
  });
</script>

<section class="hero flex-1" data-project-target="startScreen">
  <div class="hero-content flex-col text-center">
    <h1 class="text-2xl font-semibold">Tsuzuri</h1>
    <p class="text-base-content/70" data-i18n="start.title"></p>
    <div class="flex gap-2">
      <button
        type="button"
        class="btn btn-primary"
        data-action="project#openDirectory"
        data-i18n="toolbar.openDirectory"
      ></button>
      <button
        type="button"
        class="btn"
        data-action="project#openSrt"
        data-i18n="toolbar.openSrt"
      ></button>
      <button
        type="button"
        class="btn btn-ghost"
        onclick={openSettings}
        data-i18n="toolbar.settings"
      ></button>
    </div>
    {#if recentProjects.length > 0}
      <ul
        class="list w-full max-w-xl rounded-box bg-base-100 text-left shadow-md"
        aria-label={t("start.recentProjects")}
      >
        <li class="p-4 pb-2 text-xs tracking-wide opacity-60">
          {t("start.recentProjects")}
        </li>
        {#each recentProjects as project (project.directory)}
          <li class="list-row relative items-center hover:bg-base-200">
            <!-- The button's ::after covers the row, so the whole row opens the Project. -->
            <button
              type="button"
              class="list-col-grow min-w-0 cursor-pointer text-left after:absolute after:inset-0"
              onclick={({ currentTarget }) =>
                openRecent(feed, project.directory, currentTarget)}
            >
              <div class="truncate">{project.name}</div>
              <div class="truncate text-xs opacity-60">{project.directory}</div>
            </button>
            <time
              class="text-xs tabular-nums opacity-60"
              datetime={new Date(project.opened_at_ms).toISOString()}
              >{dateFormat.format(project.opened_at_ms)}</time
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

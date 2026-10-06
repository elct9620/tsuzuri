<script lang="ts">
  import type { RecentProjectView } from "#/ipc/project.ts";
  import { interfaceLanguageCode, t } from "#/i18n.ts";
  import { projectFeed } from "#/state/context.ts";
  import { openDirectory, openRecent, openSrt } from "#/actions/project.ts";

  interface Props {
    recentProjects: RecentProjectView[];
    openSettings: () => void;
  }

  let { recentProjects, openSettings }: Props = $props();

  const id = $props.id();
  const feed = projectFeed();
  const dateFormat = new Intl.DateTimeFormat(interfaceLanguageCode(), {
    dateStyle: "medium",
  });
</script>

<section class="hero flex-1" aria-labelledby="{id}-title">
  <div class="hero-content flex-col text-center">
    <h1 id="{id}-title" class="text-2xl font-semibold">Tsuzuri</h1>
    <p class="text-base-content/70">{t("start.title")}</p>
    <div class="flex gap-2">
      <button
        type="button"
        class="btn btn-primary"
        onclick={({ currentTarget }) => openDirectory(currentTarget)}
        >{t("toolbar.openDirectory")}</button
      >
      <button
        type="button"
        class="btn"
        onclick={({ currentTarget }) => openSrt(currentTarget)}
        >{t("toolbar.openSrt")}</button
      >
      <button type="button" class="btn btn-ghost" onclick={openSettings}
        >{t("toolbar.settings")}</button
      >
    </div>
    {#if recentProjects.length > 0}
      <ul
        class="list w-full max-w-xl rounded-box bg-base-100 text-left shadow-md"
        aria-label={t("start.recentProjects")}
      >
        <li class="p-4 pb-2 text-xs tracking-wide opacity-60">
          {t("start.recentProjects")}
        </li>
        {#each recentProjects as recentProject (recentProject.directory)}
          <li class="list-row relative items-center hover:bg-base-200">
            <!-- The button's ::after covers the row, so the whole row opens the Project. -->
            <button
              type="button"
              class="list-col-grow min-w-0 cursor-pointer text-left after:absolute after:inset-0"
              onclick={({ currentTarget }) =>
                openRecent(feed, recentProject.directory, currentTarget)}
            >
              <div class="truncate">{recentProject.name}</div>
              <div class="truncate text-xs opacity-60">
                {recentProject.directory}
              </div>
            </button>
            <time
              class="text-xs tabular-nums opacity-60"
              datetime={new Date(recentProject.opened_at_ms).toISOString()}
              >{dateFormat.format(recentProject.opened_at_ms)}</time
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

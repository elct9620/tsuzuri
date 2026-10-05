<script lang="ts">
  interface Props {
    openSettings: () => void;
  }

  let { openSettings }: Props = $props();
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
    <ul
      class="list w-full max-w-xl rounded-box bg-base-100 text-left shadow-md"
      data-recent-projects-target="list"
      hidden
    >
      <li
        class="p-4 pb-2 text-xs tracking-wide opacity-60"
        data-recent-projects-target="heading"
        data-i18n="start.recentProjects"
      ></li>
    </ul>
  </div>
</section>

<script lang="ts">
  import type { ModelSlot } from "../../backend/toolchain";

  interface Props {
    slot: ModelSlot;
    /** Chooses for the Project, falling back to the general setting, rather than for every Project. */
    isProjectSlot?: boolean;
  }

  let { slot, isProjectSlot = false }: Props = $props();
</script>

<li
  class="list-row items-center"
  data-controller="model-slot"
  data-model-slot-slot-value={slot}
  data-model-slot-is-project-slot-value={isProjectSlot ? "true" : undefined}
  data-model-slot-repository-outlet="#repository-dialog"
  data-action="rust:model-download-progress@window->model-slot#showProgress"
>
  <span class="flex w-32 items-center gap-1 font-medium">
    <span data-i18n="slots.{slot}"></span>
    <span
      tabindex="0"
      class="cursor-help text-base-content/50"
      data-i18n-tooltip={isProjectSlot
        ? "settings.projectModelHelp"
        : `settings.${slot}ModelHelp`}
      ><i data-lucide="info" class="size-3.5"></i></span
    >
  </span>
  <select
    class="select select-sm w-full"
    data-model-slot-target="menu"
    data-action="model-slot#chooseFromMenu"
    data-i18n-label="slots.{slot}"
  ></select>
  <div class="flex gap-2">
    <button
      type="button"
      class="btn btn-sm"
      data-slot={slot}
      data-action={isProjectSlot
        ? "project-settings#chooseModel"
        : "models#choose"}
      data-i18n="settings.chooseFile"
    ></button>
    <button
      type="button"
      class="btn btn-sm"
      data-action="model-slot#pickFromRepository"
      data-i18n="models.repository"
    ></button>
  </div>
  <span
    class="list-col-wrap col-[2/span_2] break-all text-xs text-base-content/70 [&.missing]:text-error"
    data-model-slot-target="status"
    data-project-settings-target={isProjectSlot ? "projectModel" : undefined}
    data-models-target={isProjectSlot ? undefined : "status"}
    data-slot={slot}
    data-i18n={isProjectSlot ? "models.followsGeneral" : "models.notChosen"}
  ></span>
  <div
    class="list-col-wrap col-[2/span_2] flex items-center gap-2"
    data-model-slot-target="download"
    hidden
  >
    <progress
      class="progress progress-primary w-full"
      max="100"
      data-model-slot-target="downloadBar"
    ></progress>
    <span
      class="text-xs whitespace-nowrap"
      data-model-slot-target="downloadLabel"
    ></span>
    <button
      type="button"
      class="btn btn-ghost btn-xs"
      data-action="model-slot#cancelDownload"
      data-i18n="models.cancelDownload"
    ></button>
  </div>
</li>

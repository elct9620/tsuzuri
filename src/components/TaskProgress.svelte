<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  import type { Phase, PipelineProgress } from "../backend/progress";
  import { t } from "../i18n";
  import { phaseLabel, type TaskKind } from "../ui/progress";
  import { taskRun } from "./context";

  /** The Phases each task goes through, in the order Rust enters them. */
  const PHASES_BY_TASK: Record<TaskKind, Phase[]> = {
    transcription: ["prepare", "convert", "load", "transcribe"],
    translation: ["prepare", "load", "detect", "translate"],
    diarization: ["prepare", "convert", "load", "diarize"],
  };

  const run = taskRun();

  /** Where a step stands from the Phase running: before it negative, at it zero, after it positive. */
  function offsetFromRunning(phases: Phase[], index: number): number {
    if (run.reachedPhase === null) return 1;
    return index - phases.indexOf(run.reachedPhase);
  }

  function show(event: CustomEvent<PipelineProgress>): void {
    run.show(event.detail);
  }
</script>

<svelte:window onrust:pipeline-progress={show} />

<div class="contents">
  {#if run.task !== null}
    {@const phases = PHASES_BY_TASK[run.task]}
    <div class="dropdown dropdown-end">
      <div tabindex="0" role="button" class="btn btn-sm">
        <span class="loading loading-spinner loading-xs"></span>
        <span class="max-w-28 truncate tabular-nums @5xl:max-w-none"
          >{run.summary}</span
        >
        <ChevronDown class="size-4" />
      </div>
      <div
        tabindex="-1"
        class="dropdown-content card card-sm z-20 w-96 bg-base-100 shadow-md"
      >
        <div class="card-body">
          <ul class="steps w-full text-xs">
            {#each phases as phase, index (phase)}
              {@const offset = offsetFromRunning(phases, index)}
              <li
                class={["step", offset <= 0 && "step-primary"]}
                aria-current={offset === 0 ? "step" : undefined}
              >
                {#if offset === 0}
                  <span class="step-icon"
                    ><span class="loading loading-spinner loading-xs"
                    ></span></span
                  >
                {:else if offset < 0}
                  <span class="step-icon"><Check class="size-3" /></span>
                {/if}{phaseLabel(phase)}
              </li>
            {/each}
          </ul>
          <p class="whitespace-pre-line text-sm text-base-content/70">
            {run.status}
          </p>
          {#if run.hasBar}
            <progress
              class="progress progress-primary w-full"
              max="100"
              value={run.percent}
            ></progress>
          {/if}
          <div class="card-actions justify-end">
            <button
              type="button"
              class="btn btn-sm"
              onclick={() => run.cancel()}>{t("work.cancelTask")}</button
            >
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!--
  @component
  The Speaker dialog, naming many Segments at once, and the writing of a Speaker a Segment's menu
  names, which that menu asks for as `speakers:name` on the window. Either way a new name is
  offered to the Translation Glossary. The checked bar opens the dialog for the Checked Segments
  by `segment-changes:speakers`.
-->
<script lang="ts">
  import { flushSync, onMount } from "svelte";

  import {
    type ProjectView,
    saveTranslationGlossary,
    type Segment,
    translationGlossaryTable,
  } from "../backend/project";
  import type { Outcome } from "../editor";
  import { t } from "../i18n";
  import {
    type Notification,
    notify,
    notifyEdit,
    notifyFailure,
  } from "../ui/notification.svelte";
  import { speakerNames } from "../ui/speakers";
  import { editingSession, projectFeed } from "./context";

  /** Which Segments the dialog names. */
  type SpeakerScope =
    "checked-segments" | "all-segments" | "unnamed-segments" | "named-segments";

  const feed = projectFeed();
  const session = editingSession();
  let dialog: HTMLDialogElement;
  /** The Project the editor shows, whose Segments and Translation Glossary name the Speakers. */
  let project = $state<ProjectView | null>(null);
  /** The Checked Segments when the dialog was opened for them. */
  let checkedIndexes = $state<number[]>([]);
  let scope = $state<SpeakerScope>("all-segments");
  /** The Speaker whose Segments are renamed. */
  let renamedSpeaker = $state("");
  /** The Speaker to set, none when left empty. */
  let newSpeaker = $state("");

  const speakers = $derived(speakerNames(project));

  /** Opens the dialog for the whole transcript. */
  export function open(): void {
    openFor([]);
  }

  /** Opens the dialog, offering the Checked Segments `indexes` when there are any. */
  function openFor(indexes: number[]): void {
    checkedIndexes = indexes;
    scope = indexes.length > 0 ? "checked-segments" : "all-segments";
    renamedSpeaker = speakers[0] ?? "";
    newSpeaker = "";
    flushSync();
    dialog.showModal();
  }

  /** Sets the Speaker typed of every Segment the chosen scope takes in, as one change. */
  async function apply(): Promise<void> {
    const indexes = scopeIndexes();
    const name = newSpeaker.trim();
    dialog.close();
    notifyNamed(await session.setSpeakers(indexes, name), name);
  }

  /** Writes the Speaker a Segment's menu names. */
  async function writeSpeaker({
    detail: { index, name },
  }: CustomEvent<{ index: number; name: string }>): Promise<void> {
    notifyNamed(await session.editText(index, "speaker", name), name);
  }

  /** The positions of the Segments the chosen scope takes in. */
  function scopeIndexes(): number[] {
    const chosenScope = scope;
    if (chosenScope === "checked-segments") return checkedIndexes;
    const isTaken: Record<
      Exclude<SpeakerScope, "checked-segments">,
      (segment: Segment) => boolean
    > = {
      "all-segments": () => true,
      "unnamed-segments": (segment) => !segment.speaker,
      "named-segments": (segment) => segment.speaker === renamedSpeaker,
    };
    return (project?.segments ?? []).flatMap((segment, index) =>
      isTaken[chosenScope](segment) ? [index] : [],
    );
  }

  /**
   * Says a Speaker was named, offering the name to the Translation Glossary in a Notification when
   * it names none such, or why it was not.
   */
  function notifyNamed(outcome: Outcome, name: string): void {
    const offer = speakerOffer(name);
    if (outcome.kind !== "written" || !offer) {
      notifyEdit(outcome);
      return;
    }
    notify({ title: t("edit.saved"), kind: "success", ...offer });
  }

  /** An offer to add the Speaker just named to the Translation Glossary, when it names none such. */
  function speakerOffer(
    name: string,
  ): Pick<Notification, "detail" | "action"> | undefined {
    const glossarySpeakers = project?.translation_glossary?.speakers ?? [];
    if (name === "" || glossarySpeakers.includes(name)) return undefined;
    return {
      detail: t("edit.newSpeaker", { name }),
      action: {
        label: t("edit.addSpeaker"),
        run: () => void addSpeaker(name),
      },
    };
  }

  /** Marks the term `name` in the Primary Language column as a Speaker, adding the term when the glossary has none. */
  async function addSpeaker(name: string): Promise<void> {
    try {
      const table = await translationGlossaryTable();
      const column = project ? table.languages.indexOf(project.language) : -1;
      const term = table.rows.find((row) => row.words[column] === name);
      const rows = term
        ? table.rows.map((row) =>
            row === term ? { ...row, is_speaker: true } : row,
          )
        : [
            ...table.rows,
            {
              words: table.languages.map((_, at) =>
                at === column ? name : "",
              ),
              is_speaker: true,
            },
          ];
      await saveTranslationGlossary(rows);
      notify({ title: t("edit.speakerAdded", { name }), kind: "success" });
    } catch (error) {
      notifyFailure(t("edit.speakerNotAdded"), error);
    }
  }

  onMount(() => feed.follow((next) => (project = next)));
</script>

<svelte:window
  onsegment-changes:speakers={() => openFor(session.checkedIndexes)}
  onspeakers:name={writeSpeaker}
/>

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box max-w-md">
    <h3 class="mb-2 text-lg font-bold">{t("edit.speakersTitle")}</h3>
    <fieldset class="fieldset gap-2 text-sm">
      <legend class="fieldset-legend">{t("edit.speakersScope")}</legend>
      {#if checkedIndexes.length > 0}
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="speaker-scope"
            value="checked-segments"
            class="radio radio-sm"
            bind:group={scope}
          />
          <span>{t("edit.checkedCount", { count: checkedIndexes.length })}</span
          >
        </label>
      {/if}
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="speaker-scope"
          value="all-segments"
          class="radio radio-sm"
          bind:group={scope}
        />
        <span>{t("edit.speakersEvery")}</span>
      </label>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="speaker-scope"
          value="unnamed-segments"
          class="radio radio-sm"
          bind:group={scope}
        />
        <span>{t("edit.speakersUnnamed")}</span>
      </label>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="speaker-scope"
          value="named-segments"
          class="radio radio-sm"
          bind:group={scope}
        />
        <span>{t("edit.speakersNamedBefore")}</span>
        <select
          class="select select-xs w-auto"
          aria-label={t("edit.speakersRenamed")}
          value={renamedSpeaker}
          onchange={({ currentTarget }) =>
            (renamedSpeaker = currentTarget.value)}
        >
          {#each speakers as speaker (speaker)}
            <option value={speaker}>{speaker}</option>
          {/each}
        </select>
        <span>{t("edit.speakersNamedAfter")}</span>
      </label>
    </fieldset>
    <fieldset class="fieldset gap-2 text-sm">
      <legend class="fieldset-legend">{t("edit.speakersTo")}</legend>
      <input
        class="input input-sm"
        aria-label={t("edit.speakersTo")}
        placeholder={t("edit.speakersNone")}
        bind:value={newSpeaker}
      />
      <div class="flex flex-wrap gap-1">
        {#each speakers as speaker (speaker)}
          <button
            type="button"
            class="btn btn-xs"
            onclick={() => (newSpeaker = speaker)}>{speaker}</button
          >
        {/each}
      </div>
    </fieldset>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.cancel")}</button>
      </form>
      <button type="button" class="btn btn-primary" onclick={apply}
        >{t("edit.apply")}</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

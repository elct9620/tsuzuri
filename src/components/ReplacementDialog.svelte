<!--
  @component
  The replace dialog: what to find across the Current Resource's original or the translation it
  shows, what to put in its place, and whether it is a regular expression, which Rust reads. It
  keeps what was typed, so the same replacement is one Enter away the next time.
-->
<script lang="ts">
  import { flushSync } from "svelte";
  import Modal from "#/components/Modal.svelte";

  import { isMacOS } from "#/ipc/system.ts";
  import type { CursorField } from "#/editor/index.ts";
  import { t } from "#/i18n.ts";
  import { notify, notifyFailure } from "#/state/notification.svelte.ts";
  import { isEditorCovered } from "#/ui/editor-cover.ts";
  import { isComposingKey, isShortcut } from "#/ui/shortcuts.ts";
  import { selectedText } from "#/ui/text-fields.ts";
  import { editingSession, projectFeed } from "#/state/context.ts";

  const feed = projectFeed();
  const session = editingSession();
  let dialog: Modal;
  let patternInput: HTMLInputElement;
  let pattern = $state("");
  let substitute = $state("");
  let field = $state<CursorField>("text");
  let isRegex = $state(false);
  /** Whether a translation is shown to replace in, as of opening. */
  let hasTranslation = $state(false);

  /** Opens the dialog by the replace shortcut while a Project is open. */
  function openByShortcut(event: KeyboardEvent): void {
    if (
      !isShortcut(event, "replace", isMacOS()) ||
      isEditorCovered() ||
      feed.project === null
    )
      return;
    event.preventDefault();
    open();
  }

  /** Opens the dialog, looking for the range the Cursor selects, if any. */
  export function open(): void {
    const selection = selectedText(session.cursor);
    if (selection !== "") pattern = selection;
    hasTranslation = Boolean(session.transcript?.shownTranslation);
    if (!hasTranslation) field = "text";
    flushSync();
    dialog.showModal();
    patternInput.focus();
    patternInput.select();
  }

  /** Replaces on Enter, unless the key ends a composition. */
  function applyByEnter(event: KeyboardEvent): void {
    if (event.key !== "Enter" || isComposingKey(event)) return;
    event.preventDefault();
    void apply();
  }

  /** Replaces every match as one change, keeping the dialog open when nothing is replaced. */
  async function apply(): Promise<void> {
    if (pattern === "") return;
    const outcome = await session.replaceText(field, {
      pattern,
      substitute,
      is_regex: isRegex,
    });
    if (outcome.kind === "failed") {
      notifyFailure(t("replace.failed"), outcome.error);
      return;
    }
    if (outcome.count === 0) {
      notify({ title: t("replace.nothing"), kind: "warning" });
      return;
    }
    dialog.close();
    notify({
      title: t("replace.done", { count: outcome.count }),
      kind: "success",
    });
  }
</script>

<svelte:window onkeydown={openByShortcut} />

<Modal
  bind:this={dialog}
  title={t("replace.title")}
  boxClass="max-w-md"
  dismissLabel={t("work.cancel")}
>
  <fieldset class="fieldset gap-2 text-sm">
    <label class="flex items-center gap-2">
      <span class="w-16">{t("replace.pattern")}</span>
      <input
        class="input input-sm grow"
        bind:this={patternInput}
        bind:value={pattern}
        onkeydown={applyByEnter}
      />
    </label>
    <label class="flex items-center gap-2">
      <span class="w-16">{t("replace.substitute")}</span>
      <input
        class="input input-sm grow"
        placeholder={t("replace.substituteNone")}
        bind:value={substitute}
        onkeydown={applyByEnter}
      />
    </label>
    <div class="flex items-center gap-4">
      <span class="w-16">{t("replace.field")}</span>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="replacement-field"
          value="text"
          class="radio radio-sm"
          checked={field === "text"}
          onchange={() => (field = "text")}
        />
        <span>{t("replace.original")}</span>
      </label>
      <label class="flex items-center gap-2">
        <input
          type="radio"
          name="replacement-field"
          value="translation"
          class="radio radio-sm"
          disabled={!hasTranslation}
          checked={field === "translation"}
          onchange={() => (field = "translation")}
        />
        <span>{t("replace.translation")}</span>
      </label>
    </div>
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        class="checkbox checkbox-sm"
        bind:checked={isRegex}
      />
      <span>{t("replace.regex")}</span>
      <span class="text-base-content/60">{t("replace.groups")}</span>
    </label>
  </fieldset>
  {#snippet actions()}
    <button type="button" class="btn btn-primary" onclick={apply}
      >{t("replace.apply")}</button
    >
  {/snippet}
</Modal>

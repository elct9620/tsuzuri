<!--
  @component
  The translation options both the translate and the transcribe dialogs offer, so the two always
  offer the same choices; the dialog holds what is chosen.
-->
<script lang="ts">
  import type { Language, TranslationGlossaryView } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import { fileName } from "#/ui/file-name.ts";
  import type { TranslationChoices } from "#/state/translation-choices.svelte.ts";

  interface Props {
    choices: TranslationChoices;
    /** The Project's `glossary.csv`, named with how many terms it holds. */
    glossary: TranslationGlossaryView | null;
  }

  let { choices, glossary }: Props = $props();

  let summaryWordsInput = $state<HTMLInputElement>();

  const glossaryLabel = $derived(
    glossary === null
      ? t("translate.glossaryNone")
      : t("translate.glossaryLoaded", {
          file: fileName(glossary.file),
          count: glossary.term_count,
        }),
  );

  /** Whether every option chosen is complete, pointing at the first that is not. */
  export function reportValidity(): boolean {
    return !choices.hasSummary || (summaryWordsInput?.reportValidity() ?? true);
  }

  function chooseLanguage(event: Event & { currentTarget: HTMLSelectElement }) {
    choices.language = event.currentTarget.value as Language;
  }
</script>

<p class="flex flex-wrap items-center gap-2">
  <span>{t("work.into")}</span>
  <select
    class="select select-sm w-auto"
    aria-label={t("work.into")}
    value={choices.language}
    disabled={choices.isLanguageFixed}
    onchange={chooseLanguage}
  >
    <option value="en" lang="en">English</option>
    <option value="ja" lang="ja">日本語</option>
    <option value="zh-TW" lang="zh-TW">繁體中文</option>
  </select>
</p>
<p class="flex items-center gap-2">
  <span>{t("translate.glossary")}</span>
  <span>{glossaryLabel}</span>
</p>
<p class="flex flex-wrap items-center gap-4">
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      bind:checked={choices.hasSelfReview}
    />
    <span>{t("translate.selfReview")}</span>
  </label>
</p>
{#if !choices.isLanguageFixed}
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      bind:checked={choices.hasSummary}
    />
    <span>{t("translate.rollingSummary")}</span>
    <input
      type="number"
      min="1"
      step="1"
      required
      class="input input-sm validator w-20"
      aria-label={t("translate.words")}
      bind:value={choices.summaryWords}
      bind:this={summaryWordsInput}
    />
    <span>{t("translate.words")}</span>
  </label>
{/if}
{#if choices.isCleanupOffered}
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      bind:checked={choices.isSimplifiedCleaned}
    />
    <span>{t("cleanup.action")}</span>
  </label>
{/if}

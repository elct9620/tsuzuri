<!--
  @component
  The translation options both the translate and the transcribe dialogs offer, so the two always
  offer the same choices; each dialog shows them afresh as it opens.
-->
<script lang="ts">
  import {
    TRADITIONAL_CHINESE,
    currentResource,
    type ProjectView,
    type TranslationGlossaryView,
  } from "../backend/project";
  import {
    translationSettings,
    type TranslationOptions,
  } from "../backend/translation";
  import { t } from "../i18n";
  import { fileName } from "../ui/file_name";

  interface Props {
    /** Told whether the Language chosen is already translated; the dialog warns of it, since only it knows what else starting overwrites. */
    onoverwrite: (isOverwriting: boolean) => void;
  }

  let { onoverwrite }: Props = $props();

  let summaryWordsInput = $state<HTMLInputElement>();
  /** The code of the Language to translate into. */
  let language = $state("en");
  /** Whether the Language is kept to the translation shown, as when only some Segments are translated. */
  let isLanguageFixed = $state(false);
  let glossary = $state<TranslationGlossaryView | null>(null);
  let hasSelfReview = $state(false);
  let hasSummary = $state(false);
  /** The Rolling Summary's word limit, none while its field is empty. */
  let summaryWords = $state<number | null>(100);
  let isSimplifiedCleaned = $state(false);
  /** The Languages the Current Resource is already translated into. */
  let translatedLanguages: string[] = [];

  const glossaryLabel = $derived(
    glossary === null
      ? t("translate.glossaryNone")
      : t("translate.glossaryLoaded", {
          file: fileName(glossary.file),
          count: glossary.term_count,
        }),
  );

  /**
   * Shows the Project's glossary and starts from the Language it was last translated into, or
   * keeps to `fixedLanguage` with no Rolling Summary when only some Segments are translated into
   * the translation shown.
   */
  export function show(
    project: ProjectView,
    fixedLanguage: string | null = null,
  ): void {
    glossary = project.translation_glossary;
    const shownLanguage = fixedLanguage ?? project.translation_language;
    if (shownLanguage !== null) language = shownLanguage;
    isLanguageFixed = fixedLanguage !== null;
    if (isLanguageFixed) hasSummary = false;
    translatedLanguages = currentResource(project)?.translation_languages ?? [];
    void checkCleanupAsSaved();
    reportOverwrite();
  }

  /** Whether every option chosen is complete, pointing at the first that is not. */
  export function reportValidity(): boolean {
    return !hasSummary || (summaryWordsInput?.reportValidity() ?? true);
  }

  /** The Language to translate into and the options to translate with. */
  export function choices(): {
    language: string;
    options: TranslationOptions;
  } {
    return {
      language,
      options: {
        has_self_review: hasSelfReview,
        summary_word_limit: hasSummary ? Number(summaryWords) : null,
        is_simplified_cleaned:
          language === TRADITIONAL_CHINESE && isSimplifiedCleaned,
      },
    };
  }

  /** Starts the cleanup checked as the translation settings say; left as it is when they cannot be read. */
  async function checkCleanupAsSaved(): Promise<void> {
    try {
      isSimplifiedCleaned = (await translationSettings()).is_simplified_cleaned;
    } catch {
      // The settings panel tells of settings that cannot be read.
    }
  }

  function reportOverwrite(): void {
    onoverwrite(translatedLanguages.includes(language));
  }

  function chooseLanguage(event: Event & { currentTarget: HTMLSelectElement }) {
    language = event.currentTarget.value;
    reportOverwrite();
  }
</script>

<p class="flex flex-wrap items-center gap-2">
  <span>{t("work.into")}</span>
  <select
    class="select select-sm w-auto"
    aria-label={t("work.into")}
    value={language}
    disabled={isLanguageFixed}
    onchange={chooseLanguage}
  >
    <option value="en">English</option>
    <option value="ja">日本語</option>
    <option value="zh-TW">繁體中文</option>
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
      bind:checked={hasSelfReview}
    />
    <span>{t("translate.selfReview")}</span>
  </label>
</p>
{#if !isLanguageFixed}
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      bind:checked={hasSummary}
    />
    <span>{t("translate.rollingSummary")}</span>
    <input
      type="number"
      min="1"
      step="1"
      required
      class="input input-sm validator w-20"
      aria-label={t("translate.words")}
      bind:value={summaryWords}
      bind:this={summaryWordsInput}
    />
    <span>{t("translate.words")}</span>
  </label>
{/if}
{#if language === TRADITIONAL_CHINESE}
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      bind:checked={isSimplifiedCleaned}
    />
    <span>{t("cleanup.action")}</span>
  </label>
{/if}

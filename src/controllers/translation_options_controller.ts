import { Controller } from "@hotwired/stimulus";

import { t, translatePage } from "../i18n";
import {
  currentResource,
  type ProjectView,
  type TranslationGlossaryView,
} from "../backend/project";
import {
  translationSettings,
  type TranslationOptions,
} from "../backend/translation";
import { fileName } from "../ui/file_name";

function glossaryLabel(glossary: TranslationGlossaryView | null): string {
  if (glossary === null) return t("translate.glossaryNone");
  const file = fileName(glossary.file);
  return t("translate.glossaryLoaded", { file, count: glossary.term_count });
}

/**
 * The translation options both the translate and the transcribe dialogs offer, laid out once in
 * the page's `#translation-options` template so the two always offer the same choices.
 */
export default class TranslationOptionsController extends Controller {
  static targets = [
    "language",
    "glossary",
    "speakerLabels",
    "selfReview",
    "summary",
    "summaryWords",
    "summaryChoice",
    "simplifiedCleaned",
    "cleanupChoice",
  ];

  declare readonly languageTarget: HTMLSelectElement;
  /** Names the Project's `glossary.csv` and how many terms it holds. */
  declare readonly glossaryTarget: HTMLElement;
  declare readonly speakerLabelsTarget: HTMLInputElement;
  declare readonly selfReviewTarget: HTMLInputElement;
  declare readonly summaryTarget: HTMLInputElement;
  declare readonly summaryWordsTarget: HTMLInputElement;
  /** The Rolling Summary's row, left out where only some Segments are translated. */
  declare readonly summaryChoiceTarget: HTMLElement;
  declare readonly simplifiedCleanedTarget: HTMLInputElement;
  /** The cleanup's row, offered only for a translation into `zh-TW`. */
  declare readonly cleanupChoiceTarget: HTMLElement;

  /** The Languages the Current Resource is already translated into. */
  private translatedLanguages: string[] = [];

  initialize(): void {
    const template = document.querySelector<HTMLTemplateElement>(
      "template#translation-options",
    );
    if (template === null) return;
    this.element.append(template.content.cloneNode(true));
    translatePage(this.element);
  }

  /**
   * Shows the Project's glossary and starts from the Language it was last translated into, or
   * keeps to `fixedLanguage` with no Rolling Summary when only some Segments are translated into
   * the translation shown.
   */
  show(project: ProjectView, fixedLanguage: string | null = null): void {
    this.glossaryTarget.textContent = glossaryLabel(
      project.translation_glossary,
    );
    const language = fixedLanguage ?? project.translation_language;
    if (language !== null) this.languageTarget.value = language;
    this.languageTarget.disabled = fixedLanguage !== null;
    this.summaryChoiceTarget.hidden = fixedLanguage !== null;
    if (fixedLanguage !== null) this.summaryTarget.checked = false;
    this.translatedLanguages =
      currentResource(project)?.translation_languages ?? [];
    this.offerCleanup();
    void this.checkCleanupAsSaved();
    this.reportOverwrite();
  }

  /** Offers the cleanup only while the Language chosen is `zh-TW`. */
  offerCleanup(): void {
    this.cleanupChoiceTarget.hidden = this.language !== "zh-TW";
  }

  /** Starts the cleanup checked as the translation settings say; left as it is when they cannot be read. */
  private async checkCleanupAsSaved(): Promise<void> {
    try {
      this.simplifiedCleanedTarget.checked = (
        await translationSettings()
      ).is_simplified_cleaned;
    } catch {
      // The settings panel tells of settings that cannot be read.
    }
  }

  /**
   * Tells the dialog around it whether the Language chosen is already translated; the dialog
   * warns of it, since only the dialog knows what else starting overwrites.
   */
  reportOverwrite(): void {
    const isOverwriting = this.translatedLanguages.includes(this.language);
    this.dispatch("overwrite", { detail: { isOverwriting } });
  }

  /** The code of the Language to translate into. */
  get language(): string {
    return this.languageTarget.value;
  }

  /** Whether every option chosen is complete, pointing at the first that is not. */
  reportValidity(): boolean {
    return (
      !this.summaryTarget.checked || this.summaryWordsTarget.reportValidity()
    );
  }

  get options(): TranslationOptions {
    return {
      has_speaker_labels: this.speakerLabelsTarget.checked,
      has_self_review: this.selfReviewTarget.checked,
      summary_word_limit: this.summaryTarget.checked
        ? Number(this.summaryWordsTarget.value)
        : null,
      is_simplified_cleaned:
        this.language === "zh-TW" && this.simplifiedCleanedTarget.checked,
    };
  }
}

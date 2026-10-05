/**
 * The translation options a task dialog holds while it is open, which the TranslationOptions
 * Svelte Component offers for the dialog to start a translation with.
 */

import {
  TRADITIONAL_CHINESE,
  currentResource,
  type Language,
  type ProjectView,
} from "../backend/project";
import {
  translationSettings,
  type TranslationOptions,
} from "../backend/translation";

export class TranslationChoices {
  /** The code of the Language to translate into. */
  language = $state<Language>("en");
  /** Whether the Language is kept to the translation shown, as when only some Segments are translated. */
  isLanguageFixed = $state(false);
  hasSelfReview = $state(false);
  hasSummary = $state(false);
  /** The Rolling Summary's word limit, none while its field is empty. */
  summaryWords = $state<number | null>(100);
  isSimplifiedCleaned = $state(false);

  /**
   * Starts again from the Language the Project was last translated into, or keeps to
   * `fixedLanguage` with no Rolling Summary when only some Segments are translated into the
   * translation shown; the cleanup starts as the translation settings say.
   */
  reset(project: ProjectView, fixedLanguage: Language | null = null): void {
    const language = fixedLanguage ?? project.translation_language;
    if (language !== null) this.language = language;
    this.isLanguageFixed = fixedLanguage !== null;
    if (this.isLanguageFixed) this.hasSummary = false;
    void this.#checkCleanupAsSaved();
  }

  /** Whether the Current Resource of `project` is already translated into the Language chosen. */
  isTranslated(project: ProjectView | null): boolean {
    return (currentResource(project)?.translation_languages ?? []).includes(
      this.language,
    );
  }

  /** Whether the cleanup is offered, which it is only for a translation into `zh-TW`. */
  get isCleanupOffered(): boolean {
    return this.language === TRADITIONAL_CHINESE;
  }

  /** The options to translate with. */
  get options(): TranslationOptions {
    return {
      has_self_review: this.hasSelfReview,
      summary_word_limit: this.hasSummary ? Number(this.summaryWords) : null,
      is_simplified_cleaned: this.isCleanupOffered && this.isSimplifiedCleaned,
    };
  }

  /** Left as it is when the translation settings cannot be read; the settings panel tells of that. */
  async #checkCleanupAsSaved(): Promise<void> {
    try {
      this.isSimplifiedCleaned = (
        await translationSettings()
      ).is_simplified_cleaned;
    } catch {
      // Kept as it was.
    }
  }
}

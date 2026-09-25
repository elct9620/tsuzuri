import { Controller } from "@hotwired/stimulus";

import { t, translatePage } from "../i18n";
import type { ProjectView, TranslationGlossaryView } from "../backend/project";
import type { TranslationOptions } from "../backend/translation";

function glossaryLabel(glossary: TranslationGlossaryView | null): string {
  if (glossary === null) return t("translate.glossaryNone");
  const file = glossary.file.split(/[\\/]/).pop() ?? glossary.file;
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
  ];

  declare readonly languageTarget: HTMLSelectElement;
  /** Names the Project's `glossary.csv` and how many terms it holds. */
  declare readonly glossaryTarget: HTMLElement;
  declare readonly speakerLabelsTarget: HTMLInputElement;
  declare readonly selfReviewTarget: HTMLInputElement;
  declare readonly summaryTarget: HTMLInputElement;
  declare readonly summaryWordsTarget: HTMLInputElement;

  initialize(): void {
    const template = document.querySelector<HTMLTemplateElement>(
      "template#translation-options",
    );
    if (template === null) return;
    this.element.append(template.content.cloneNode(true));
    translatePage(this.element);
  }

  /** Shows the Project's glossary and starts from the Language it was last translated into. */
  show(project: ProjectView): void {
    this.glossaryTarget.textContent = glossaryLabel(
      project.translation_glossary,
    );
    if (project.translation_language !== null)
      this.languageTarget.value = project.translation_language;
  }

  /** The code of the Language to translate into. */
  get language(): string {
    return this.languageTarget.value;
  }

  get options(): TranslationOptions {
    return {
      has_speaker_labels: this.speakerLabelsTarget.checked,
      has_self_review: this.selfReviewTarget.checked,
      summary_word_limit: this.summaryTarget.checked
        ? Number(this.summaryWordsTarget.value)
        : null,
    };
  }
}

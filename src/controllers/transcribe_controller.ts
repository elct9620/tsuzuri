import { Controller } from "@hotwired/stimulus";

import {
  currentResource,
  type ProjectView,
  type ProjectFeed,
  type SegmentSpan,
} from "../backend/project";
import { modelSettings } from "../backend/toolchain";
import { transcribe, type TranscriptionScope } from "../backend/transcription";
import { retranslate, translate } from "../backend/translation";
import { t } from "../i18n";
import { fileName } from "../ui/file_name";
import { notify, notifyTranslation } from "../ui/notification";
import { factorItems, phaseItems } from "../ui/progress";
import { formatTime } from "../ui/time";
import type ProgressController from "./progress_controller";
import type TranslationOptionsController from "./translation_options_controller";

/**
 * The transcribe dialog: it transcribes the Current Resource into its original subtitle, whole or
 * from a Segment onward or over a span of them.
 */
export default class TranscribeController extends Controller {
  static targets = [
    "openButton",
    "dialog",
    "title",
    "scopeField",
    "scope",
    "language",
    "translationChoice",
    "translationToggle",
    "overwriteWarning",
    "overwriteMessage",
    "startButton",
    "model",
  ];
  static outlets = ["progress", "translation-options"];

  /** The toolbar button, usable only for a Current Resource with a media file. */
  declare readonly openButtonTarget: HTMLButtonElement;
  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly titleTarget: HTMLElement;
  /** The row naming the Audio Window, shown only when not the whole media file. */
  declare readonly scopeFieldTarget: HTMLElement;
  declare readonly scopeTarget: HTMLElement;
  /** Names the Primary Language it is transcribed in. */
  declare readonly languageTarget: HTMLElement;
  /** Offers translating afterwards, which within an Audio Window needs a translation shown. */
  declare readonly translationChoiceTarget: HTMLElement;
  /** Whether to translate the Transcript once transcribed, with the translation options it shows. */
  declare readonly translationToggleTarget: HTMLInputElement;
  /** Warns of what starting overwrites: the original subtitle, the translation, or both. */
  declare readonly overwriteWarningTarget: HTMLElement;
  declare readonly overwriteMessageTarget: HTMLElement;
  declare readonly startButtonTarget: HTMLButtonElement;
  /** Names the file of the transcription Model it runs with, the Project Model when there is one. */
  declare readonly modelTarget: HTMLElement;
  declare readonly progressOutlet: ProgressController;
  declare readonly translationOptionsOutlet: TranslationOptionsController;
  declare readonly translationOptionsOutletElement: HTMLElement;

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;
  private project: ProjectView | null = null;
  /** Whether the Language the translation options have chosen is already translated. */
  private isTranslationOverwriting = false;
  private transcriptionScope: TranscriptionScope = { kind: "whole" };

  connect(): void {
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
  }

  async open(): Promise<void> {
    this.transcriptionScope = { kind: "whole" };
    await this.showDialog();
  }

  /** Opens the dialog to transcribe within `scope`; bound to `segment-changes:retranscribe`. */
  async openForScope({
    detail,
  }: CustomEvent<{ scope: TranscriptionScope }>): Promise<void> {
    this.transcriptionScope = detail.scope;
    await this.showDialog();
  }

  private async showDialog(): Promise<void> {
    const isWhole = this.transcriptionScope.kind === "whole";
    const shownTranslation = this.project?.shown_translation ?? null;
    this.titleTarget.textContent = t(
      isWhole ? "toolbar.transcribe" : "transcribe.again",
    );
    this.scopeFieldTarget.hidden = isWhole;
    this.scopeTarget.textContent = this.scopeLabel();
    this.translationChoiceTarget.hidden = !isWhole && shownTranslation === null;
    if (this.translationChoiceTarget.hidden)
      this.translationToggleTarget.checked = false;
    if (this.project !== null) {
      this.languageTarget.textContent = t(`languages.${this.project.language}`);
      this.translationOptionsOutlet.show(
        this.project,
        isWhole ? null : shownTranslation,
      );
    }
    this.showTranslationOptions();
    this.dialogTarget.showModal();
    const path =
      this.project?.options.models.transcription ??
      (await modelSettings())?.transcription.path ??
      null;
    this.modelTarget.textContent =
      path === null ? t("models.notChosen") : fileName(path);
  }

  async start(): Promise<void> {
    const progress = this.progressOutlet;
    if (
      progress.isBusy ||
      (this.translationToggleTarget.checked &&
        !this.translationOptionsOutlet.reportValidity())
    )
      return;
    this.dialogTarget.close();
    progress.begin("transcription");
    try {
      const transcription = await transcribe(
        this.transcriptionScope.kind !== "whole" ||
          (currentResource(this.project)?.has_subtitle ?? false),
        this.transcriptionScope,
      );
      notify({
        title: t("transcribe.done"),
        kind: "success",
        items: [
          [
            t("transcribe.audio"),
            t("phases.seconds", {
              seconds: transcription.audio_seconds.toFixed(1),
            }),
          ],
          ...factorItems(
            transcription.transcribe_seconds,
            transcription.audio_seconds,
          ),
          ...phaseItems(transcription.phases),
        ],
      });
      if (this.translationToggleTarget.checked)
        await this.translateAfterwards(transcription.written_span);
      progress.finish();
    } catch (error) {
      progress.fail(error);
    }
  }

  /**
   * Translates what the transcription wrote with the options the dialog shows: the whole subtitle,
   * or within an Audio Window the Segments it wrote again, none when it wrote none.
   */
  private async translateAfterwards(span: SegmentSpan | null): Promise<void> {
    const choices = this.translationOptionsOutlet;
    if (this.transcriptionScope.kind === "whole") {
      this.progressOutlet.begin("translation");
      notifyTranslation(await translate(choices.language, choices.options));
    } else if (span !== null) {
      const indexes = Array.from(
        { length: span.last - span.first + 1 },
        (_, at) => span.first + at,
      );
      this.progressOutlet.begin("translation");
      notifyTranslation(await retranslate(indexes, choices.options));
    }
  }

  showTranslationOptions(): void {
    this.translationOptionsOutletElement.hidden =
      !this.translationToggleTarget.checked;
    this.showOverwrite();
  }

  /** Follows whether the Language the translation options have chosen is already translated. */
  followTranslation({ detail }: CustomEvent<{ isOverwriting: boolean }>): void {
    this.isTranslationOverwriting = detail.isOverwriting;
    this.showOverwrite();
  }

  /** Warns once of all that starting overwrites, and names the start button for it. */
  private showOverwrite(): void {
    const hasSubtitle = currentResource(this.project)?.has_subtitle ?? false;
    const isTranslationOverwritten =
      this.translationToggleTarget.checked && this.isTranslationOverwriting;
    const warning =
      this.transcriptionScope.kind !== "whole"
        ? "transcribe.overwriteScope"
        : hasSubtitle
          ? isTranslationOverwritten
            ? "transcribe.overwriteBoth"
            : "transcribe.overwrite"
          : isTranslationOverwritten
            ? "translate.overwrite"
            : null;
    this.overwriteWarningTarget.hidden = warning === null;
    this.overwriteMessageTarget.textContent =
      warning === null ? "" : t(warning);
    this.startButtonTarget.textContent = t(
      warning === null ? "transcribe.start" : "transcribe.overwriteAndStart",
    );
  }

  /** Names the Audio Window by the times of the Segments it starts and ends at. */
  private scopeLabel(): string {
    const segments = this.project?.segments ?? [];
    switch (this.transcriptionScope.kind) {
      case "whole":
        return "";
      case "rest":
        return t("transcribe.scopeRest", {
          time: formatTime(
            segments[this.transcriptionScope.first]?.start_ms ?? 0,
          ),
        });
      case "span": {
        const span = segments.slice(
          this.transcriptionScope.first,
          this.transcriptionScope.last + 1,
        );
        return t("transcribe.scopeSpan", {
          start: formatTime(span[0]?.start_ms ?? 0),
          end: formatTime(
            Math.max(0, ...span.map((segment) => segment.end_ms)),
          ),
        });
      }
    }
  }

  private show(project: ProjectView | null): void {
    this.project = project;
    this.openButtonTarget.disabled = !(
      currentResource(project)?.has_media ?? false
    );
  }
}

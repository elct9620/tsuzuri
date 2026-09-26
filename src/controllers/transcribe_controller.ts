import { Controller } from "@hotwired/stimulus";

import {
  currentResource,
  followProject,
  type ProjectView,
  type UnlistenFn,
} from "../backend/project";
import { modelSettings } from "../backend/toolchain";
import { transcribe } from "../backend/transcription";
import { translate } from "../backend/translation";
import { t } from "../i18n";
import { notify, notifyTranslation } from "../ui/notification";
import { phaseItems } from "../ui/progress";
import type ProgressController from "./progress_controller";
import type TranslationOptionsController from "./translation_options_controller";

/** The transcribe dialog: it transcribes the Current Resource into its original subtitle. */
export default class TranscribeController extends Controller {
  static targets = [
    "open",
    "dialog",
    "language",
    "translate",
    "overwrite",
    "overwriteMessage",
    "start",
    "model",
  ];
  static outlets = ["progress", "translation-options"];

  /** The toolbar button, usable only for a Current Resource with a media file. */
  declare readonly openTarget: HTMLButtonElement;
  declare readonly dialogTarget: HTMLDialogElement;
  /** Names the Primary Language it is transcribed in. */
  declare readonly languageTarget: HTMLElement;
  /** Whether to translate the Transcript once transcribed, with the translation options it shows. */
  declare readonly translateTarget: HTMLInputElement;
  /** Warns of what starting overwrites: the original subtitle, the translation, or both. */
  declare readonly overwriteTarget: HTMLElement;
  declare readonly overwriteMessageTarget: HTMLElement;
  declare readonly startTarget: HTMLButtonElement;
  /** Names the transcription Model's file. */
  declare readonly modelTarget: HTMLElement;
  declare readonly progressOutlet: ProgressController;
  declare readonly translationOptionsOutlet: TranslationOptionsController;
  declare readonly translationOptionsOutletElement: HTMLElement;

  private unlisten?: UnlistenFn;
  private project: ProjectView | null = null;
  /** Whether the Language the translation options have chosen is already translated. */
  private isTranslationOverwriting = false;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
  }

  async open(): Promise<void> {
    if (this.project !== null) {
      this.languageTarget.textContent = t(`languages.${this.project.language}`);
      this.translationOptionsOutlet.show(this.project);
    }
    this.showTranslationOptions();
    this.dialogTarget.showModal();
    const models = await modelSettings();
    const path = models?.transcription.path ?? null;
    this.modelTarget.textContent =
      path === null
        ? t("models.notChosen")
        : (path.split(/[\\/]/).pop() ?? path);
  }

  async start(): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy) return;
    this.dialogTarget.close();
    progress.begin("transcribe");
    try {
      const transcription = await transcribe(
        currentResource(this.project)?.has_subtitle ?? false,
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
          [
            t("transcribe.factor"),
            (
              transcription.transcribe_seconds / transcription.audio_seconds
            ).toFixed(2),
          ],
          ...phaseItems(transcription.phases),
        ],
      });
      if (this.translateTarget.checked) {
        const choices = this.translationOptionsOutlet;
        progress.begin("translate");
        notifyTranslation(await translate(choices.language, choices.options));
      }
      progress.finish();
    } catch (error) {
      progress.fail(error);
    }
  }

  showTranslationOptions(): void {
    this.translationOptionsOutletElement.hidden = !this.translateTarget.checked;
    this.showOverwrite();
  }

  followTranslation({ detail }: CustomEvent<{ isOverwriting: boolean }>): void {
    this.isTranslationOverwriting = detail.isOverwriting;
    this.showOverwrite();
  }

  /** Warns once of all that starting overwrites, and names the start button for it. */
  private showOverwrite(): void {
    const hasSubtitle = currentResource(this.project)?.has_subtitle ?? false;
    const isTranslationOverwritten =
      this.translateTarget.checked && this.isTranslationOverwriting;
    const warning = hasSubtitle
      ? isTranslationOverwritten
        ? "transcribe.overwriteBoth"
        : "transcribe.overwrite"
      : isTranslationOverwritten
        ? "translate.overwrite"
        : null;
    this.overwriteTarget.hidden = warning === null;
    this.overwriteMessageTarget.textContent =
      warning === null ? "" : t(warning);
    this.startTarget.textContent = t(
      warning === null ? "transcribe.start" : "transcribe.overwriteAndStart",
    );
  }

  private show(project: ProjectView | null): void {
    this.project = project;
    this.openTarget.disabled = !(currentResource(project)?.has_media ?? false);
  }
}

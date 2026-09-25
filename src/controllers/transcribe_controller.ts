import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { t } from "../i18n";
import { phasesSummary, type PhaseTiming } from "../progress";
import { currentResource, followProject, type ProjectView } from "../project";
import type ProgressController from "./progress_controller";
import { translateProject } from "./translate_controller";
import type TranslationOptionsController from "./translation_options_controller";

export interface Transcription {
  audio_seconds: number;
  transcribe_seconds: number;
  phases: PhaseTiming[];
}

interface ModelSettingsView {
  transcription: { path: string | null };
}

/** The transcribe dialog: it transcribes the Current Resource into its original subtitle. */
export default class TranscribeController extends Controller {
  static targets = [
    "open",
    "dialog",
    "language",
    "translate",
    "overwrite",
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
  /** Warns that the original subtitle will be overwritten. */
  declare readonly overwriteTarget: HTMLElement;
  declare readonly startTarget: HTMLButtonElement;
  /** Names the transcription Model's file. */
  declare readonly modelTarget: HTMLElement;
  declare readonly progressOutlet: ProgressController;
  declare readonly translationOptionsOutlet: TranslationOptionsController;
  declare readonly translationOptionsOutletElement: HTMLElement;

  private unlisten?: UnlistenFn;
  private project: ProjectView | null = null;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
  }

  async open(): Promise<void> {
    const hasSubtitle = currentResource(this.project)?.has_subtitle ?? false;
    this.overwriteTarget.hidden = !hasSubtitle;
    this.startTarget.textContent = t(
      hasSubtitle ? "transcribe.overwriteAndStart" : "transcribe.start",
    );
    if (this.project !== null) {
      this.languageTarget.textContent = t(`languages.${this.project.language}`);
      this.translationOptionsOutlet.show(this.project);
    }
    this.showTranslationOptions();
    this.dialogTarget.showModal();
    const models = await invoke<ModelSettingsView | null>("model_settings");
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
      const transcription = await invoke<Transcription>("transcribe", {
        overwrite: currentResource(this.project)?.has_subtitle ?? false,
      });
      const factor =
        transcription.transcribe_seconds / transcription.audio_seconds;
      const lines = [
        t("transcribe.done", {
          audio: transcription.audio_seconds.toFixed(1),
          seconds: transcription.transcribe_seconds.toFixed(1),
          factor: factor.toFixed(2),
        }),
        t("transcribe.transcribePhases", {
          phases: phasesSummary(transcription.phases),
        }),
      ];
      if (this.translateTarget.checked) {
        const choices = this.translationOptionsOutlet;
        progress.begin("translate");
        const translation = await translateProject(
          choices.language,
          choices.options,
        );
        lines.push(
          t("transcribe.translatePhases", {
            phases: phasesSummary(translation.phases),
          }),
        );
      }
      progress.finish(lines);
    } catch (error) {
      progress.fail(error);
    }
  }

  showTranslationOptions(): void {
    this.translationOptionsOutletElement.hidden = !this.translateTarget.checked;
  }

  private show(project: ProjectView | null): void {
    this.project = project;
    this.openTarget.disabled = !(currentResource(project)?.has_media ?? false);
  }
}

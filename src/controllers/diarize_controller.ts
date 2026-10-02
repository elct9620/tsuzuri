import { Controller } from "@hotwired/stimulus";

import { diarize } from "../backend/diarization";
import {
  currentResource,
  type ProjectFeed,
  type ProjectView,
} from "../backend/project";
import { modelSettings } from "../backend/toolchain";
import { t } from "../i18n";
import { sourceFileName } from "../ui/models";
import { notify } from "../ui/notification";
import { factorItems, phaseItems } from "../ui/progress";
import type ProgressController from "./progress_controller";

/** The diarize dialog: it gives the Current Resource's Segments the Speakers heard in its media file. */
export default class DiarizeController extends Controller {
  static targets = [
    "openButton",
    "dialog",
    "model",
    "overwriteWarning",
    "startButton",
  ];
  static outlets = ["progress"];

  /** The toolbar button, usable only for a Current Resource with a media file and a subtitle. */
  declare readonly openButtonTarget: HTMLButtonElement;
  declare readonly dialogTarget: HTMLDialogElement;
  /** Names the file of the diarization Model it runs with. */
  declare readonly modelTarget: HTMLElement;
  /** Warns that the Speakers the Segments carry are replaced. */
  declare readonly overwriteWarningTarget: HTMLElement;
  declare readonly startButtonTarget: HTMLButtonElement;
  declare readonly progressOutlet: ProgressController;

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;
  private project: ProjectView | null = null;

  connect(): void {
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
  }

  async open(): Promise<void> {
    const hasSpeakers = (this.project?.segments ?? []).some(
      (segment) => (segment.speaker ?? null) !== null,
    );
    this.overwriteWarningTarget.hidden = !hasSpeakers;
    this.startButtonTarget.textContent = t(
      hasSpeakers ? "diarize.overwriteAndStart" : "diarize.start",
    );
    this.dialogTarget.showModal();
    const source = (await modelSettings())?.diarization.source ?? null;
    this.modelTarget.textContent =
      source === null ? t("models.notChosen") : sourceFileName(source);
  }

  async start(): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy) return;
    this.dialogTarget.close();
    progress.begin("diarization");
    try {
      const diarization = await diarize();
      notify({
        title: t("diarize.done"),
        kind: "success",
        items: [
          [
            t("transcribe.audio"),
            t("phases.seconds", {
              seconds: diarization.audio_seconds.toFixed(1),
            }),
          ],
          ...factorItems(
            diarization.diarize_seconds,
            diarization.audio_seconds,
          ),
          ...phaseItems(diarization.phases),
        ],
      });
      progress.finish();
    } catch (error) {
      progress.fail(error);
    }
  }

  private show(project: ProjectView | null): void {
    this.project = project;
    const resource = currentResource(project);
    this.openButtonTarget.disabled = !(
      (resource?.has_media ?? false) &&
      (resource?.has_subtitle ?? false)
    );
  }
}

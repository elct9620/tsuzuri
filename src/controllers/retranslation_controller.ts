import { Controller } from "@hotwired/stimulus";

import type { ProjectView } from "../backend/project";
import { retranslate } from "../backend/translation";
import { notifyTranslation } from "../ui/notification";
import type ProgressController from "./progress_controller";

/** Translates chosen Segments again into the translation shown, one row's or the selection's. */
export default class RetranslationController extends Controller {
  static targets = ["selection"];
  static outlets = ["progress"];

  /** The selection bar's button, usable only while a translation is shown. */
  declare readonly selectionTarget: HTMLButtonElement;
  declare readonly progressOutlet: ProgressController;

  follow({ detail }: CustomEvent<{ project: ProjectView | null }>): void {
    this.selectionTarget.disabled =
      (detail.project?.shown_translation ?? null) === null;
  }

  async translateSegment({
    params,
  }: {
    params: { index: number };
  }): Promise<void> {
    await this.translate([params.index]);
  }

  async translateSelection({
    detail,
  }: CustomEvent<{ indexes: number[] }>): Promise<void> {
    await this.translate(detail.indexes);
  }

  private async translate(indexes: number[]): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy) return;
    progress.begin("translate");
    try {
      notifyTranslation(await retranslate(indexes));
      progress.finish();
    } catch (error) {
      progress.fail(error);
    }
  }
}

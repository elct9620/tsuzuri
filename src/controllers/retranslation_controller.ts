import { Controller } from "@hotwired/stimulus";

import type { ProjectView } from "../backend/project";
import { retranslate } from "../backend/translation";
import type { EditingSession } from "../editor";
import { notifyTranslation } from "../ui/notification";
import type ProgressController from "./progress_controller";

/** Translates chosen Segments again into the translation shown, one row's or the Checked Segments. */
export default class RetranslationController extends Controller {
  static targets = ["checkedButton"];
  static outlets = ["progress"];

  declare readonly session: EditingSession;
  /** The button on the bar for Checked Segments, offered only while a translation is shown. */
  declare readonly checkedButtonTarget: HTMLButtonElement;
  declare readonly progressOutlet: ProgressController;

  follow({ detail }: CustomEvent<{ project: ProjectView | null }>): void {
    this.checkedButtonTarget.hidden =
      (detail.project?.shown_translation ?? null) === null;
  }

  async translateSegment({
    params,
  }: {
    params: { index: number };
  }): Promise<void> {
    await this.translate([params.index]);
  }

  async translateChecked(): Promise<void> {
    await this.translate(this.session.checkedIndexes);
  }

  private async translate(indexes: number[]): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy) return;
    progress.begin("translation");
    try {
      notifyTranslation(await retranslate(indexes));
      progress.finish();
    } catch (error) {
      progress.fail(error);
    }
  }
}

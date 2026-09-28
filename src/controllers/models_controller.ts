import { Controller } from "@hotwired/stimulus";
import { open } from "../backend/dialog";
import {
  chooseModel,
  modelSettings,
  type ModelSettingsView,
  type ModelSlot,
} from "../backend/toolchain";
import { t } from "../i18n";
import { MODEL_EXTENSIONS } from "../ui/models";
import { notifyFailure } from "../ui/notification";

export default class ModelsController extends Controller {
  static targets = ["status"];

  declare readonly statusTargets: HTMLElement[];

  async connect(): Promise<void> {
    try {
      this.show(await modelSettings());
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  }

  async choose(event: Event): Promise<void> {
    const slot = (event.currentTarget as HTMLElement).dataset.slot as ModelSlot;
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Model", extensions: MODEL_EXTENSIONS[slot] }],
    });
    if (path === null) return;

    try {
      this.show(await chooseModel(slot, { kind: "file", path }));
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }

  private show(settings: ModelSettingsView): void {
    for (const status of this.statusTargets) {
      const { path, has_file } = settings[status.dataset.slot as ModelSlot];
      status.textContent =
        path === null
          ? t("models.notChosen")
          : has_file
            ? path
            : t("models.missing", { path });
      status.classList.toggle("missing", path !== null && !has_file);
    }
  }
}

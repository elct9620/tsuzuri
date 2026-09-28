import { Controller } from "@hotwired/stimulus";
import { open } from "../backend/dialog";
import {
  chooseModel,
  modelSettings,
  type ModelSettingsView,
  type ModelSlot,
  type ModelSource,
} from "../backend/toolchain";
import { t } from "../i18n";
import { sourceName, type ModelChoice } from "../ui/models";
import { notifyFailure } from "../ui/notification";
import type ModelSlotController from "./model_slot_controller";

export default class ModelsController extends Controller {
  static targets = ["status"];
  static outlets = ["model-slot"];

  declare readonly statusTargets: HTMLElement[];
  /** The rows choosing each slot's Model. */
  declare readonly modelSlotOutlets: ModelSlotController[];
  private settings: ModelSettingsView | null = null;

  async connect(): Promise<void> {
    try {
      this.show(await modelSettings());
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  }

  async choose(event: Event): Promise<void> {
    const slot = (event.currentTarget as HTMLElement).dataset.slot as ModelSlot;
    if (this.settings === null) return;
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Model", extensions: this.settings[slot].extensions }],
    });
    if (path !== null) await this.record(slot, { kind: "file", path });
  }

  /** Records the Model Source a slot's row chose. */
  async chooseSource({ detail }: CustomEvent<ModelChoice>): Promise<void> {
    if (detail.source !== null) await this.record(detail.slot, detail.source);
  }

  modelSlotOutletConnected(row: ModelSlotController): void {
    if (this.settings !== null)
      row.showSource(this.settings[row.slotValue].source);
  }

  private async record(slot: ModelSlot, source: ModelSource): Promise<void> {
    try {
      this.show(await chooseModel(slot, source));
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }

  private show(settings: ModelSettingsView): void {
    this.settings = settings;
    for (const status of this.statusTargets) {
      const { source, path, has_file } =
        settings[status.dataset.slot as ModelSlot];
      status.textContent =
        source === null || path === null
          ? t("models.notChosen")
          : has_file
            ? path
            : source.kind === "repository"
              ? t("models.downloadAgain", { name: sourceName(source) })
              : t("models.missing", { path });
      status.classList.toggle("missing", path !== null && !has_file);
    }
    for (const row of this.modelSlotOutlets)
      row.showSource(settings[row.slotValue].source);
  }
}

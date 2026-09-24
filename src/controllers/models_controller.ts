import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { t } from "../i18n";

type ModelSlot = "transcription" | "translation";

interface SlotView {
  path: string | null;
  exists: boolean;
}

type ModelSettingsView = Record<ModelSlot, SlotView>;

const MODEL_EXTENSIONS: Record<ModelSlot, string[]> = {
  transcription: ["bin"],
  translation: ["gguf"],
};

export default class ModelsController extends Controller {
  static targets = ["status"];

  declare readonly statusTargets: HTMLElement[];

  async connect(): Promise<void> {
    this.render(await invoke<ModelSettingsView>("model_settings"));
  }

  async choose(event: Event): Promise<void> {
    const slot = (event.currentTarget as HTMLElement).dataset.slot as ModelSlot;
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Model", extensions: MODEL_EXTENSIONS[slot] }],
    });
    if (path === null) return;

    this.render(
      await invoke<ModelSettingsView>("choose_model", { slot, path }),
    );
  }

  private render(settings: ModelSettingsView): void {
    for (const status of this.statusTargets) {
      const { path, exists } = settings[status.dataset.slot as ModelSlot];
      status.textContent =
        path === null
          ? t("models.notChosen")
          : exists
            ? path
            : t("models.missing", { path });
      status.classList.toggle("missing", path !== null && !exists);
    }
  }
}

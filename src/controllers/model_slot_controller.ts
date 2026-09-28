import { Controller } from "@hotwired/stimulus";
import {
  cancelModelDownload,
  downloadModel,
  presetModels,
  type DownloadProgress,
  type ModelSlot,
  type ModelSource,
  type PresetModel,
} from "../backend/toolchain";
import { t } from "../i18n";
import {
  isSameSource,
  presetLabel,
  sizeLabel,
  sourceFileName,
  type HubFile,
  type ModelChoice,
} from "../ui/models";
import { notifyFailure } from "../ui/notification";
import { menuOption } from "../ui/options";
import type RepositoryController from "./repository_controller";

/** Menu value of the slot's own Model, one no Preset Model is. */
const OWN_MODEL = "own";
/** Menu value of following the general settings, which only a Project's slot offers. */
const GENERAL_MODEL = "general";

/**
 * One Model Slot's row: a menu of its Preset Models, and the download a pick from it or from a
 * Repository starts. The Model is chosen only once downloaded, announced as `model-slot:choose`
 * for the settings page holding the slot to record.
 */
export default class ModelSlotController extends Controller {
  static targets = [
    "menu",
    "status",
    "download",
    "downloadBar",
    "downloadLabel",
  ];
  static values = { slot: String, isProjectSlot: Boolean };
  static outlets = ["repository"];

  declare readonly menuTarget: HTMLSelectElement;
  declare readonly statusTarget: HTMLElement;
  declare readonly downloadTarget: HTMLElement;
  declare readonly downloadBarTarget: HTMLProgressElement;
  declare readonly downloadLabelTarget: HTMLElement;
  declare readonly slotValue: ModelSlot;
  declare readonly isProjectSlotValue: boolean;
  declare readonly repositoryOutlet: RepositoryController;

  private presets: PresetModel[] = [];
  private source: ModelSource | null = null;
  private pendingDownload: HubFile | null = null;

  async connect(): Promise<void> {
    try {
      this.presets = (await presetModels()).filter(
        (preset) => preset.slot === this.slotValue,
      );
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
    this.showMenu();
  }

  /** Shows `source` as the slot's Model, or none chosen. */
  showSource(source: ModelSource | null): void {
    this.source = source;
    this.showMenu();
  }

  async chooseFromMenu(): Promise<void> {
    const { value } = this.menuTarget;
    if (value === GENERAL_MODEL) {
      this.announce(null);
      return;
    }
    const preset = this.presets[Number(value)];
    if (preset?.source.kind !== "repository") return;
    const { repo, file, commit } = preset.source;
    await this.download({ repo, file }, commit);
  }

  async pickFromRepository(): Promise<void> {
    const hubFile = await this.repositoryOutlet.pick(this.slotValue);
    if (hubFile !== null) await this.download(hubFile, null);
  }

  showProgress({ detail }: CustomEvent<DownloadProgress>): void {
    const target = this.pendingDownload;
    if (target?.repo !== detail.repo || target.file !== detail.file) return;
    if (detail.total === null) {
      this.downloadBarTarget.removeAttribute("value");
      this.downloadLabelTarget.textContent = sizeLabel(detail.downloaded);
      return;
    }
    const percent = Math.floor((detail.downloaded * 100) / detail.total);
    this.downloadBarTarget.value = percent;
    this.downloadLabelTarget.textContent = `${percent}%`;
  }

  async cancelDownload(): Promise<void> {
    const target = this.pendingDownload;
    if (target !== null) await cancelModelDownload(target.repo, target.file);
  }

  /** Downloads `target` at `revision`, the main branch when none, and chooses it once it is there. */
  private async download(
    target: HubFile,
    revision: string | null,
  ): Promise<void> {
    this.pendingDownload = target;
    this.showDownloading(true);
    try {
      this.announce(await downloadModel(target.repo, target.file, revision));
    } catch (error) {
      notifyFailure(t("models.notDownloaded"), error);
      this.showMenu();
    } finally {
      this.pendingDownload = null;
      this.showDownloading(false);
    }
  }

  private announce(source: ModelSource | null): void {
    const choice: ModelChoice = { slot: this.slotValue, source };
    this.dispatch("choose", { detail: choice });
  }

  private showDownloading(isDownloading: boolean): void {
    this.downloadBarTarget.removeAttribute("value");
    this.downloadLabelTarget.textContent = "";
    this.downloadTarget.hidden = !isDownloading;
    this.statusTarget.hidden = isDownloading;
    this.menuTarget.disabled = isDownloading;
  }

  /** Lists the Preset Models by name, with the slot's Model selected. */
  private showMenu(): void {
    const menu = this.menuTarget;
    const firstOption = this.isProjectSlotValue
      ? menuOption(GENERAL_MODEL, t("models.followsGeneral"))
      : Object.assign(menuOption("", t("models.notChosen")), {
          disabled: true,
        });
    const groups = new Map<string, HTMLOptGroupElement>();
    this.presets.forEach((preset, index) => {
      let group = groups.get(preset.name);
      if (group === undefined) {
        group = Object.assign(document.createElement("optgroup"), {
          label: preset.name,
        });
        groups.set(preset.name, group);
      }
      group.append(menuOption(String(index), presetLabel(preset)));
    });
    const presetIndex = this.presets.findIndex(
      (preset) =>
        this.source !== null && isSameSource(preset.source, this.source),
    );
    const ownOption =
      this.source !== null && presetIndex === -1
        ? [
            Object.assign(
              menuOption(
                OWN_MODEL,
                t("models.own", { name: sourceFileName(this.source) }),
              ),
              { disabled: true },
            ),
          ]
        : [];
    menu.replaceChildren(firstOption, ...ownOption, ...groups.values());
    menu.value =
      presetIndex !== -1
        ? String(presetIndex)
        : this.source !== null
          ? OWN_MODEL
          : firstOption.value;
  }
}

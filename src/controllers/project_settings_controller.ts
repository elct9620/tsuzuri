import { Controller } from "@hotwired/stimulus";

import { message, open } from "../backend/dialog";
import {
  setPrimaryLanguage,
  setProjectOptions,
  type ProjectFeed,
  type ProjectModels,
  type ProjectOptions,
  type ProjectView,
  type TranscriptionOverrides,
} from "../backend/project";
import { modelSettings, type ModelSource } from "../backend/toolchain";
import { t } from "../i18n";
import type ModelSlotController from "./model_slot_controller";
import { failureKind, failureMessage } from "../ui/failure";
import { fileName } from "../ui/file_name";
import { sourceName, type ModelChoice } from "../ui/models";

/** The Project's own page of the settings, shown while a Project is open; what it sets lives in Rust. */
export default class ProjectSettingsController extends Controller {
  static targets = [
    "settings",
    "nameField",
    "projectTab",
    "generalTab",
    "language",
    "bilingualOrder",
    "bilingualAutosave",
    "overwriteBackup",
    "transcriptionSetting",
    "projectModel",
  ];
  static outlets = ["model-slot"];

  /** The Project's own settings and their tab, shown only while one is open. */
  declare readonly settingsTargets: HTMLElement[];
  /** The Project Name typed in the settings, the directory's name as its placeholder. */
  declare readonly nameFieldTarget: HTMLInputElement;
  declare readonly projectTabTarget: HTMLInputElement;
  declare readonly generalTabTarget: HTMLInputElement;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly bilingualOrderTarget: HTMLSelectElement;
  declare readonly bilingualAutosaveTarget: HTMLInputElement;
  declare readonly overwriteBackupTarget: HTMLInputElement;
  /** One per Transcription Setting named by `data-setting`: follow the general settings, `on` or `off`. */
  declare readonly transcriptionSettingTargets: HTMLSelectElement[];
  /** Names the Project Model of the slot in `data-slot`, or that the slot follows the general settings. */
  declare readonly projectModelTargets: HTMLElement[];
  /** The rows choosing each slot's Project Model. */
  declare readonly modelSlotOutlets: ModelSlotController[];

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;
  private options: ProjectOptions | null = null;

  connect(): void {
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
  }

  async setLanguage(): Promise<void> {
    await this.report(() => setPrimaryLanguage(this.languageTarget.value));
  }

  async setOptions(): Promise<void> {
    await this.saveOptions({});
  }

  async chooseModel({ currentTarget }: Event): Promise<void> {
    const slot = (currentTarget as HTMLElement).dataset
      .slot as keyof ProjectModels;
    const path = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Model", extensions: (await modelSettings())[slot].extensions },
      ],
    });
    if (path !== null) await this.saveModel(slot, { kind: "file", path });
  }

  /** Records the Model Source a slot's row chose, or none to follow the general settings. */
  async chooseSource({ detail }: CustomEvent<ModelChoice>): Promise<void> {
    await this.saveModel(detail.slot as keyof ProjectModels, detail.source);
  }

  modelSlotOutletConnected(row: ModelSlotController): void {
    if (this.options !== null)
      row.showSource(this.options.models[row.slotValue as keyof ProjectModels]);
  }

  private async saveModel(
    slot: keyof ProjectModels,
    source: ModelSource | null,
  ): Promise<void> {
    if (this.options === null) return;
    await this.saveOptions({
      models: { ...this.options.models, [slot]: source },
    });
  }

  /** Sets the Project Options as the settings show them, with `changes` in their place. */
  private async saveOptions(changes: Partial<ProjectOptions>): Promise<void> {
    if (this.options === null) return;
    const options: ProjectOptions = {
      name: this.nameFieldTarget.value || null,
      bilingual_order: this.bilingualOrderTarget
        .value as ProjectOptions["bilingual_order"],
      is_bilingual_autosaved: this.bilingualAutosaveTarget.checked,
      is_overwrite_backed_up: this.overwriteBackupTarget.checked,
      models: this.options.models,
      transcription: this.transcriptionOverrides(this.options.transcription),
      ...changes,
    };
    await this.report(() => setProjectOptions(options));
  }

  /** `overrides` with each Transcription Setting as its select shows it. */
  private transcriptionOverrides(
    overrides: TranscriptionOverrides,
  ): TranscriptionOverrides {
    overrides = { ...overrides };
    for (const select of this.transcriptionSettingTargets)
      overrides[select.dataset.setting as keyof TranscriptionOverrides] =
        select.value === "" ? null : select.value === "on";
    return overrides;
  }

  /** Runs `action`, showing why it failed. */
  private async report(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const kind = failureKind(error) === "warning" ? "warning" : "error";
      await message(failureMessage(error), { kind });
    }
  }

  private show(project: ProjectView | null): void {
    this.showSettingsOf(project);
    this.options = project?.options ?? null;
    if (project === null) return;
    this.nameFieldTarget.value = project.options.name ?? "";
    this.nameFieldTarget.placeholder = fileName(project.directory);
    this.languageTarget.value = project.language;
    this.bilingualOrderTarget.value = project.options.bilingual_order;
    this.bilingualAutosaveTarget.checked =
      project.options.is_bilingual_autosaved;
    this.overwriteBackupTarget.checked = project.options.is_overwrite_backed_up;
    this.showTranscriptionOverrides(project.options.transcription);
    this.showProjectModels(project.options.models);
  }

  private showTranscriptionOverrides(overrides: TranscriptionOverrides): void {
    for (const select of this.transcriptionSettingTargets) {
      const value =
        overrides[select.dataset.setting as keyof TranscriptionOverrides];
      select.value = value === null ? "" : value ? "on" : "off";
    }
  }

  private showProjectModels(models: ProjectModels): void {
    for (const status of this.projectModelTargets) {
      const source = models[status.dataset.slot as keyof ProjectModels];
      status.textContent =
        source === null ? t("models.followsGeneral") : sourceName(source);
    }
    for (const row of this.modelSlotOutlets)
      row.showSource(models[row.slotValue as keyof ProjectModels]);
  }

  /** The Project's own settings while one is open, opened at their tab when it has just opened. */
  private showSettingsOf(project: ProjectView | null): void {
    const hasOpened = project !== null && this.projectTabTarget.hidden;
    for (const settings of this.settingsTargets)
      settings.hidden = project === null;
    if (project === null) this.generalTabTarget.checked = true;
    if (hasOpened) this.projectTabTarget.checked = true;
  }
}

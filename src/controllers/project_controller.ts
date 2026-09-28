import { Controller } from "@hotwired/stimulus";

import { message, open, SRT_FILTERS } from "../backend/dialog";
import {
  openProject,
  type OpenCommand,
  refreshProject,
  reloadProject,
  selectResource,
  setPrimaryLanguage,
  setProjectOptions,
  type ProjectModels,
  type ProjectOptions,
  type ProjectView,
  type ResourceView,
  type ProjectFeed,
  type TranscriptionOverrides,
} from "../backend/project";
import { modelSettings, type ModelSource } from "../backend/toolchain";
import { interfaceLanguageCode, t } from "../i18n";
import type ModelSlotController from "./model_slot_controller";
import { failureKind, failureMessage } from "../ui/failure";
import { fileName } from "../ui/file_name";
import { closeMenu } from "../ui/menu";
import { notify } from "../ui/notification";
import { sourceName, type ModelChoice } from "../ui/models";

function resourceItem(
  resource: ResourceView,
  isCurrent: boolean,
): HTMLLIElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "project#select";
  button.dataset.name = resource.name;
  button.dataset.tooltip = resource.name;
  button.className = "flex-col items-start gap-1";
  button.classList.toggle("menu-active", isCurrent);
  const name = document.createElement("span");
  name.className = "line-clamp-2 break-all";
  name.textContent = resource.name;
  button.append(name);
  const marks: HTMLElement[] = [];
  if (!resource.has_media) {
    const kind = document.createElement("span");
    kind.className = "badge badge-sm badge-outline";
    kind.dataset.kind = "subtitle";
    kind.textContent = t("resources.subtitleOnly");
    kind.dataset.tooltip = t("resources.subtitleOnlyHint");
    marks.push(kind);
  }
  if (!resource.has_subtitle) {
    const status = document.createElement("span");
    status.className = "status status-warning";
    status.dataset.tooltip = t("resources.noSubtitle");
    marks.push(status);
  }
  for (const code of resource.translation_languages) {
    const badge = document.createElement("span");
    badge.className = "badge badge-sm";
    badge.textContent = code;
    marks.push(badge);
  }
  if (marks.length > 0) {
    const row = document.createElement("span");
    row.className = "flex items-center gap-1";
    row.append(...marks);
    button.append(row);
  }
  const item = document.createElement("li");
  item.append(button);
  return item;
}

/** The Project's actions and the Resource list; what they make lives in Rust. */
export default class ProjectController extends Controller {
  static targets = [
    "startScreen",
    "workspace",
    "name",
    "resources",
    "glossary",
    "settings",
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

  /** Shown while no Project is open. */
  declare readonly startScreenTarget: HTMLElement;
  /** The toolbar and editor of an open Project. */
  declare readonly workspaceTarget: HTMLElement;
  declare readonly nameTarget: HTMLElement;
  declare readonly resourcesTarget: HTMLUListElement;
  declare readonly glossaryTarget: HTMLElement;
  /** The Project's own settings and their tab, shown only while one is open. */
  declare readonly settingsTargets: HTMLElement[];
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

  /**
   * Says a subtitle changed elsewhere was read in and where what Tsuzuri held of it was kept;
   * bound to `rust:changed-elsewhere-kept`.
   */
  notifyChangedElsewhereKept(): void {
    notify({
      title: t("versions.changedElsewhereKept"),
      detail: t("versions.changedElsewhereKeptDetail"),
      kind: "warning",
    });
  }

  async openDirectory({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const path = await open({ multiple: false, directory: true });
    if (path !== null) await this.run("open_project", path);
  }

  async openSrt({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const path = await open({
      multiple: false,
      directory: false,
      filters: SRT_FILTERS,
    });
    if (path !== null) await this.run("open_srt", path);
  }

  /**
   * Opens the Recent Project whose directory the row or menu item names. Rust drops one whose
   * directory is gone and announces nothing, so the Recent Projects are told to read again.
   */
  async openRecent({
    currentTarget,
    params,
  }: Event & { params: { directory: string } }): Promise<void> {
    closeMenu(currentTarget);
    const isOpened = await this.run("open_project", params.directory);
    if (!isOpened) await refreshProject();
  }

  async select({ currentTarget }: Event): Promise<void> {
    const name = (currentTarget as HTMLElement).dataset.name;
    this.dispatch("select");
    const isSelected = await this.report(() => selectResource(name));
    // Rust announces nothing when it could not select, so the editor is told to read what it holds.
    if (!isSelected) await refreshProject();
  }

  /**
   * Reads the Project's directory again, for files added or changed elsewhere. The field being
   * typed in is left first, so its text is sent to be written before the directory is read.
   */
  async reload(): Promise<void> {
    if (this.feed.project === null) return;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await this.report(() => reloadProject());
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

  /** Opens `path` with the Interface Language for a directory that records none, answering whether it opened. */
  private run(command: OpenCommand, path: string): Promise<boolean> {
    return this.report(() =>
      openProject(command, path, interfaceLanguageCode()),
    );
  }

  /** Runs `action`, showing why it failed, and answers whether it succeeded. */
  private async report(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      const kind = failureKind(error) === "warning" ? "warning" : "error";
      await message(failureMessage(error), { kind });
      return false;
    }
  }

  private show(project: ProjectView | null): void {
    this.startScreenTarget.hidden = project !== null;
    this.workspaceTarget.hidden = project === null;
    this.showSettingsOf(project);
    this.options = project?.options ?? null;
    if (project === null) return;
    this.nameTarget.textContent = fileName(project.directory);
    this.resourcesTarget.replaceChildren(
      ...project.resources.map((resource) =>
        resourceItem(resource, resource.name === project.current_resource),
      ),
    );
    const glossary = project.translation_glossary;
    this.glossaryTarget.textContent =
      glossary === null
        ? t("resources.createGlossary")
        : t("resources.glossary", { count: glossary.term_count });
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

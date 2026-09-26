import { Controller } from "@hotwired/stimulus";

import { message, open } from "../backend/dialog";
import {
  openProject,
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
import { interfaceLanguageCode, t } from "../i18n";
import { failureMessage } from "../ui/failure";
import { closeMenu } from "../ui/menu";
import { MODEL_EXTENSIONS } from "../ui/models";

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
    "start",
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
    "followModel",
  ];

  /** Shown while no Project is open. */
  declare readonly startTarget: HTMLElement;
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
  /** Offered for the slot in `data-slot` only while it has a Project Model. */
  declare readonly followModelTargets: HTMLElement[];

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;
  private options: ProjectOptions | null = null;

  connect(): void {
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
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
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path !== null) await this.run("open_srt", path);
  }

  async select({ currentTarget }: Event): Promise<void> {
    const name = (currentTarget as HTMLElement).dataset.name;
    this.dispatch("select");
    const isSelected = await this.report(() => selectResource(name));
    // Rust announces nothing when it could not select, so the editor is told to read what it holds.
    if (!isSelected) await refreshProject();
  }

  /** Reads the Project's directory again, for files added or changed elsewhere. */
  async reload(): Promise<void> {
    if (this.feed.project === null) return;
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
      filters: [{ name: "Model", extensions: MODEL_EXTENSIONS[slot] }],
    });
    if (path !== null) await this.saveModel(slot, path);
  }

  async followModel({ currentTarget }: Event): Promise<void> {
    const slot = (currentTarget as HTMLElement).dataset
      .slot as keyof ProjectModels;
    await this.saveModel(slot, null);
  }

  private async saveModel(
    slot: keyof ProjectModels,
    path: string | null,
  ): Promise<void> {
    if (this.options === null) return;
    await this.saveOptions({
      models: { ...this.options.models, [slot]: path },
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

  /** Opens `path` with the Interface Language for a directory that records none. */
  private async run(
    command: "open_project" | "open_srt",
    path: string,
  ): Promise<void> {
    await this.report(() =>
      openProject(command, path, interfaceLanguageCode()),
    );
  }

  /** Runs `action`, showing why it failed, and answers whether it succeeded. */
  private async report(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      await message(failureMessage(error), { kind: "error" });
      return false;
    }
  }

  private show(project: ProjectView | null): void {
    this.startTarget.hidden = project !== null;
    this.workspaceTarget.hidden = project === null;
    this.showSettingsOf(project);
    this.options = project?.options ?? null;
    if (project === null) return;
    this.nameTarget.textContent =
      project.directory.split(/[\\/]/).pop() ?? project.directory;
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
      const path = models[status.dataset.slot as keyof ProjectModels];
      status.textContent = path ?? t("models.followsGeneral");
    }
    for (const follow of this.followModelTargets)
      follow.hidden =
        models[follow.dataset.slot as keyof ProjectModels] === null;
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

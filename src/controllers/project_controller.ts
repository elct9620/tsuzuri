import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { message, open } from "@tauri-apps/plugin-dialog";

import { failureMessage } from "../failure";
import { interfaceLanguageCode, t } from "../i18n";
import { closeMenu } from "../menu";
import { followProject, type ProjectView, type ResourceView } from "../project";

function resourceItem(
  resource: ResourceView,
  isCurrent: boolean,
): HTMLLIElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "project#select";
  button.dataset.name = resource.name;
  button.classList.toggle("menu-active", isCurrent);
  const name = document.createElement("span");
  name.className = "grow truncate";
  name.textContent = resource.name;
  button.append(name);
  if (!resource.has_subtitle) {
    const status = document.createElement("span");
    status.className = "status status-warning";
    status.title = t("resources.noSubtitle");
    button.append(status);
  }
  for (const code of resource.translation_languages) {
    const badge = document.createElement("span");
    badge.className = "badge badge-sm";
    badge.textContent = code;
    button.append(badge);
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
    "language",
  ];

  /** Shown while no Project is open. */
  declare readonly startTarget: HTMLElement;
  /** The toolbar and editor of an open Project. */
  declare readonly workspaceTarget: HTMLElement;
  declare readonly nameTarget: HTMLElement;
  declare readonly resourcesTarget: HTMLUListElement;
  declare readonly glossaryTarget: HTMLElement;
  /** The Project's own settings, shown only while one is open. */
  declare readonly settingsTarget: HTMLElement;
  declare readonly languageTarget: HTMLSelectElement;

  private unlisten?: UnlistenFn;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
  }

  async openDirectory({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const path = await open({ multiple: false, directory: true });
    if (path !== null) await this.run("open_project", { path });
  }

  async openSrt({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path !== null) await this.run("open_srt", { path });
  }

  async select({ currentTarget }: Event): Promise<void> {
    const name = (currentTarget as HTMLElement).dataset.name;
    await this.report(() => invoke("select_resource", { name }));
  }

  async setLanguage(): Promise<void> {
    await this.report(() =>
      invoke("set_primary_language", { language: this.languageTarget.value }),
    );
  }

  /** Opens `path` with the Interface Language for a directory that records none. */
  private async run(command: string, args: { path: string }): Promise<void> {
    await this.report(() =>
      invoke(command, { ...args, language: interfaceLanguageCode() }),
    );
  }

  private async report(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      await message(failureMessage(error), { kind: "error" });
    }
  }

  private show(project: ProjectView | null): void {
    this.startTarget.hidden = project !== null;
    this.workspaceTarget.hidden = project === null;
    this.settingsTarget.hidden = project === null;
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
        ? t("translate.glossaryNone")
        : t("resources.glossary", { count: glossary.term_count });
    this.languageTarget.value = project.language;
  }
}

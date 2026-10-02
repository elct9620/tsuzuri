import { Controller } from "@hotwired/stimulus";

import { message, open, SRT_FILTERS } from "../backend/dialog";
import {
  openProject,
  type OpenCommand,
  reloadProject,
  selectResource,
  setProjectOptions,
  takeRequestedSrt,
  type ProjectView,
  type ResourceView,
  type ProjectFeed,
} from "../backend/project";
import { interfaceLanguageCode, t } from "../i18n";
import { failureKind, failureMessage } from "../ui/failure";
import { closeMenu } from "../ui/menu";
import { notify } from "../ui/notification";

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
  ];

  /** Shown while no Project is open. */
  declare readonly startScreenTarget: HTMLElement;
  /** The toolbar and editor of an open Project. */
  declare readonly workspaceTarget: HTMLElement;
  /** The Project Name in the toolbar, typed over to rename the Project; its default value is the name shown. */
  declare readonly nameTarget: HTMLInputElement;
  declare readonly resourcesTarget: HTMLUListElement;
  declare readonly glossaryTarget: HTMLElement;

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;

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

  /** Opens the SRT file the system asked to open, as one chosen here; bound to `rust:srt-requested`. */
  async openRequestedSrt(): Promise<void> {
    const path = await takeRequestedSrt();
    if (path !== null) await this.run("openSrt", path);
  }

  async openDirectory({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const path = await open({ multiple: false, directory: true });
    if (path !== null) await this.run("openProject", path);
  }

  async openSrt({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const path = await open({
      multiple: false,
      directory: false,
      filters: SRT_FILTERS,
    });
    if (path !== null) await this.run("openSrt", path);
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
    const isOpened = await this.run("openProject", params.directory);
    if (!isOpened) await this.feed.refresh();
  }

  async select({ currentTarget }: Event): Promise<void> {
    const name = (currentTarget as HTMLElement).dataset.name!;
    this.dispatch("select");
    const isSelected = await this.report(() => selectResource(name));
    // Rust announces nothing when it could not select, so the editor is told to read what it holds.
    if (!isSelected) await this.feed.refresh();
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

  async rename(): Promise<void> {
    const project = this.feed.project;
    if (project === null) return;
    const name = this.nameTarget.value || null;
    await this.report(() => setProjectOptions({ ...project.options, name }));
  }

  /** Leaves the toolbar's name field, which writes a name typed there. */
  leaveName(): void {
    this.nameTarget.blur();
  }

  /** Puts back the name shown before typing and leaves the field without writing. */
  discardName(): void {
    this.nameTarget.value = this.nameTarget.defaultValue;
    this.nameTarget.blur();
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
    document.title = project === null ? "Tsuzuri" : `${project.name} - Tsuzuri`;
    if (project === null) return;
    this.nameTarget.value = this.nameTarget.defaultValue = project.name;
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
  }
}

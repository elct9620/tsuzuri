import { Controller } from "@hotwired/stimulus";

import { open, SRT_FILTERS } from "../backend/dialog";
import {
  openProject,
  type OpenCommand,
  reloadProject,
  setProjectOptions,
  takeRequestedSrt,
  type ProjectView,
  type ProjectFeed,
} from "../backend/project";
import { interfaceLanguageCode, t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notify, notifyFailure } from "../ui/notification.svelte";

/** The Project's actions and the toolbar's name; what they make lives in Rust. */
export default class ProjectController extends Controller {
  static targets = ["startScreen", "workspace", "name"];

  /** Shown while no Project is open. */
  declare readonly startScreenTarget: HTMLElement;
  /** The toolbar and editor of an open Project. */
  declare readonly workspaceTarget: HTMLElement;
  /** The Project Name in the toolbar, typed over to rename the Project; its default value is the name shown. */
  declare readonly nameTarget: HTMLInputElement;

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

  /**
   * Reads the Project's directory again, for files added or changed elsewhere. The field being
   * typed in is left first, so its text is sent to be written before the directory is read.
   */
  async reload(): Promise<void> {
    if (this.feed.project === null) return;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await this.report("resources.notReloaded", () => reloadProject());
  }

  async rename(): Promise<void> {
    const project = this.feed.project;
    if (project === null) return;
    const name = this.nameTarget.value || null;
    await this.report("toolbar.notRenamed", () =>
      setProjectOptions({ ...project.options, name }),
    );
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
    return this.report("toolbar.notOpened", () =>
      openProject(command, path, interfaceLanguageCode()),
    );
  }

  /** Runs `action`, saying under `title` why it failed, and answers whether it succeeded. */
  private async report(
    title: string,
    action: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      notifyFailure(t(title), error);
      return false;
    }
  }

  private show(project: ProjectView | null): void {
    this.startScreenTarget.hidden = project !== null;
    this.workspaceTarget.hidden = project === null;
    document.title = project === null ? "Tsuzuri" : `${project.name} - Tsuzuri`;
    if (project === null) return;
    this.nameTarget.value = this.nameTarget.defaultValue = project.name;
  }
}

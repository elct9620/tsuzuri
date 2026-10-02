import { Controller } from "@hotwired/stimulus";

import { isMacOS } from "../backend/system";
import { rememberFlag, rememberedFlag } from "../ui/choices";
import { showFold } from "../ui/fold";
import { isShortcut } from "../ui/shortcuts";

type Orientation = "landscape" | "portrait";

/** Where the webview remembers the Resource list docked or not, once for each orientation. */
const DOCKED_KEY_BY_ORIENTATION: Record<Orientation, string> = {
  landscape: "tsuzuri.resource-list-docked.landscape",
  portrait: "tsuzuri.resource-list-docked.portrait",
};

/**
 * A window turned upright shows more Segments and needs its width for them, so only a landscape one
 * docks the list until the user chooses.
 */
const DEFAULT_DOCKING_BY_ORIENTATION: Record<Orientation, boolean> = {
  landscape: true,
  portrait: false,
};

function screenOrientation(): Orientation {
  return matchMedia("(orientation: portrait)").matches
    ? "portrait"
    : "landscape";
}

/**
 * Docks the Resource list beside a wide window, as chosen for the way the screen is held; a narrow
 * window never docks it and lays it over the editor from its own button instead.
 */
export default class ResourceListController extends Controller {
  static targets = ["toggle", "overlayButton", "dockButton", "dockIcon"];

  /** The drawer's checkbox, checked while the list is laid over the editor. */
  declare readonly toggleTarget: HTMLInputElement;
  /** Lays the list over the editor; shown only where the window is too narrow to dock it. */
  declare readonly overlayButtonTarget: HTMLElement;
  declare readonly dockButtonTarget: HTMLElement;
  declare readonly dockIconTarget: HTMLElement;

  connect(): void {
    this.showDocking();
  }

  /** Takes the choice made for the orientation the screen has turned to. */
  follow(): void {
    this.showDocking();
  }

  /** Takes the list off the editor once a Resource is chosen from it; bound to `project:select`. */
  putAway(): void {
    this.toggleTarget.checked = false;
  }

  toggleDocked(): void {
    const orientation = screenOrientation();
    rememberFlag(
      DOCKED_KEY_BY_ORIENTATION[orientation],
      !this.isDocked(orientation),
    );
    this.showDocking();
  }

  /** Bound to `keydown@window`: docks or undocks the list, or lays it over a narrow window's editor. */
  toggleByShortcut(event: KeyboardEvent): void {
    if (!isShortcut(event, "resourceList", isMacOS())) return;
    event.preventDefault();
    if (this.isNarrow) this.toggleTarget.checked = !this.toggleTarget.checked;
    else this.toggleDocked();
  }

  private get isNarrow(): boolean {
    return getComputedStyle(this.overlayButtonTarget).display !== "none";
  }

  private isDocked(orientation: Orientation): boolean {
    return rememberedFlag(
      DOCKED_KEY_BY_ORIENTATION[orientation],
      DEFAULT_DOCKING_BY_ORIENTATION[orientation],
    );
  }

  private showDocking(): void {
    const isListDocked = this.isDocked(screenOrientation());
    this.element.toggleAttribute("data-is-docked", isListDocked);
    showFold(this.dockButtonTarget, this.dockIconTarget, !isListDocked);
  }
}

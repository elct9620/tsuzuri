/**
 * Whether the Resource list is docked beside the editor or laid over it, which the drawer, the
 * toolbar's buttons and the list itself all show.
 */

import { MediaQuery } from "svelte/reactivity";

import { rememberFlag, rememberedFlag } from "#/ui/choices.ts";

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

/**
 * Docks the Resource list beside a wide window, as chosen for the way the screen is held; a narrow
 * window never docks it, and its own button lays the list over the editor instead. Which of the two
 * the window allows is the stylesheet's to say, by which button it shows.
 */
export class ResourceDock {
  /** Lays the list over the editor; shown only where the window is too narrow to dock it. */
  overlayButton = $state<HTMLElement>();
  /** Whether the list is laid over the editor now, as the drawer's checkbox holds. */
  isOverlaid = $state(false);

  readonly #portraitQuery = new MediaQuery("(orientation: portrait)");
  readonly #dockingByOrientation = $state<Record<Orientation, boolean>>({
    landscape: rememberedFlag(
      DOCKED_KEY_BY_ORIENTATION.landscape,
      DEFAULT_DOCKING_BY_ORIENTATION.landscape,
    ),
    portrait: rememberedFlag(
      DOCKED_KEY_BY_ORIENTATION.portrait,
      DEFAULT_DOCKING_BY_ORIENTATION.portrait,
    ),
  });

  get isDocked(): boolean {
    return this.#dockingByOrientation[this.#orientation];
  }

  toggleDocked(): void {
    const orientation = this.#orientation;
    const isDocked = !this.#dockingByOrientation[orientation];
    this.#dockingByOrientation[orientation] = isDocked;
    rememberFlag(DOCKED_KEY_BY_ORIENTATION[orientation], isDocked);
  }

  /** Does what the toolbar's button shown now does: lays the list over a narrow window, or docks it. */
  toggle(): void {
    if (this.#isNarrow) this.isOverlaid = !this.isOverlaid;
    else this.toggleDocked();
  }

  /** Takes the list off the editor, once a Resource is chosen from it. */
  putAway(): void {
    this.isOverlaid = false;
  }

  get #orientation(): Orientation {
    return this.#portraitQuery.current ? "portrait" : "landscape";
  }

  get #isNarrow(): boolean {
    return (
      this.overlayButton !== undefined &&
      getComputedStyle(this.overlayButton).display !== "none"
    );
  }
}

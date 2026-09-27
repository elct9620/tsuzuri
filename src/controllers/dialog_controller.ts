import { Controller } from "@hotwired/stimulus";

/** Opens a dialog that needs nothing prepared first, such as the settings, and says it opened for what reads its state anew. */
export default class DialogController extends Controller {
  static targets = ["dialog"];

  declare readonly dialogTarget: HTMLDialogElement;

  open(): void {
    this.dialogTarget.showModal();
    this.dispatch("opened");
  }
}

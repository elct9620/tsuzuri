import { Controller } from "@hotwired/stimulus";
import type { EditCommand } from "../backend/project";
import { isTextField, type EditingSession } from "../editor";
import { notifyEdit } from "../ui/notification";

/**
 * Routes a key event by whether it was typed in a text field: `:typing` routes only those,
 * `:!typing` only the others, so an undo shortcut in a field stays the field's own.
 */
export function typingOption({
  event,
  value,
}: {
  event: Event;
  value: boolean;
}): boolean {
  return isTextField(event.target) === value;
}

/** Sends Undo and Redo to the text field in focus, which keeps its own typing, or else to the Project. */
export default class UndoController extends Controller {
  declare readonly session: EditingSession;

  /** Undo or Redo chosen from the Edit menu; bound to `rust:edit-command`. */
  applyEditCommand({ detail: command }: CustomEvent<EditCommand>): void {
    if (command === "select-all") return;
    if (isTextField(document.activeElement)) {
      document.execCommand(command);
    } else {
      void this.applyToProject(command);
    }
  }

  /** Ctrl/⌘+Z where no menu takes it first; bound with `:!typing:prevent`. */
  undoInProject(): void {
    void this.applyToProject("undo");
  }

  /** Ctrl/⌘+Shift+Z or Ctrl/⌘+Y where no menu takes them first; bound with `:!typing:prevent`. */
  redoInProject(): void {
    void this.applyToProject("redo");
  }

  private async applyToProject(
    command: Exclude<EditCommand, "select-all">,
  ): Promise<void> {
    const outcome = await (command === "undo"
      ? this.session.undo()
      : this.session.redo());
    if (outcome.kind === "failed")
      notifyEdit(outcome, {
        failure: command === "undo" ? "edit.notUndone" : "edit.notRedone",
      });
  }
}

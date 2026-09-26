import { Controller } from "@hotwired/stimulus";
import {
  followEditCommands,
  type EditCommand,
  type UnlistenFn,
} from "../backend/project";
import { isField, type EditingSession } from "../editor";
import { notifyEdit } from "../ui/notification";

/** The input types holding typed text, whose own history an undo in them belongs to. */
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel"]);

function isTextField(element: EventTarget | null): boolean {
  return (
    isField(element) ||
    (element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type))
  );
}

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

  private unlisten?: UnlistenFn;

  async connect(): Promise<void> {
    this.unlisten = await followEditCommands((command) => {
      if (isTextField(document.activeElement)) {
        document.execCommand(command);
      } else {
        void this.applyToProject(command);
      }
    });
  }

  disconnect(): void {
    this.unlisten?.();
  }

  /** Ctrl/⌘+Z where no menu takes it first; bound with `:!typing:prevent`. */
  undoInProject(): void {
    void this.applyToProject("undo");
  }

  /** Ctrl/⌘+Shift+Z or Ctrl/⌘+Y where no menu takes them first; bound with `:!typing:prevent`. */
  redoInProject(): void {
    void this.applyToProject("redo");
  }

  private async applyToProject(command: EditCommand): Promise<void> {
    const outcome = await (command === "undo"
      ? this.session.undo()
      : this.session.redo());
    if (outcome.kind === "failed")
      notifyEdit(outcome, {
        failure: command === "undo" ? "edit.notUndone" : "edit.notRedone",
      });
  }
}

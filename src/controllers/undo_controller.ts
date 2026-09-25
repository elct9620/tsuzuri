import { Controller } from "@hotwired/stimulus";
import {
  followEditCommands,
  redo,
  undo,
  type EditCommand,
  type UnlistenFn,
} from "../backend/project";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

/** The input types holding typed text, whose own history an undo in them belongs to. */
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel"]);

function isTextField(element: EventTarget | null): boolean {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type))
  );
}

/** Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo; ⌘ stands for Ctrl where the menu leaves it. */
function editCommand(event: KeyboardEvent): EditCommand | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

/** Sends Undo and Redo to the text field in focus, which keeps its own typing, or else to the Project. */
export default class UndoController extends Controller {
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

  /** The shortcuts where no menu takes them first; a text field keeps its own. */
  press(event: KeyboardEvent): void {
    const command = editCommand(event);
    if (command === null || isTextField(event.target)) return;
    event.preventDefault();
    void this.applyToProject(command);
  }

  private async applyToProject(command: EditCommand): Promise<void> {
    try {
      await (command === "undo" ? undo() : redo());
    } catch (error) {
      notifyFailure(
        t(command === "undo" ? "edit.notUndone" : "edit.notRedone"),
        error,
      );
    }
  }
}

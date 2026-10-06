<script lang="ts">
  import type { EditCommand } from "#/backend/project.ts";
  import { isMacOS } from "#/backend/system.ts";
  import { isTextField } from "#/editor/index.ts";
  import { notifyEdit } from "#/ui/notification.svelte.ts";
  import { isShortcut } from "#/ui/shortcuts.ts";
  import { editingSession } from "#/components/context.ts";

  const session = editingSession();

  /** Undo or Redo chosen from the Edit menu. */
  function applyEditCommand({
    detail: command,
  }: CustomEvent<EditCommand>): void {
    if (command !== "undo" && command !== "redo") return;
    if (isTextField(document.activeElement)) {
      document.execCommand(command);
    } else {
      void applyToProject(command);
    }
  }

  /** Undo or Redo by its keys where no menu takes them first; a text field keeps them for its own typing. */
  function applyByShortcut(event: KeyboardEvent): void {
    if (isTextField(event.target)) return;
    const isMac = isMacOS();
    const command = isShortcut(event, "undo", isMac)
      ? "undo"
      : isShortcut(event, "redo", isMac)
        ? "redo"
        : undefined;
    if (!command) return;
    event.preventDefault();
    void applyToProject(command);
  }

  async function applyToProject(command: "undo" | "redo"): Promise<void> {
    const outcome = await (command === "undo"
      ? session.undo()
      : session.redo());
    if (outcome.kind === "failed")
      notifyEdit(outcome, {
        failure: command === "undo" ? "edit.notUndone" : "edit.notRedone",
      });
  }
</script>

<!--
  Sends Undo and Redo to the text field in focus, which keeps its own typing, or else to the
  Project. It draws nothing.
-->
<svelte:window
  onkeydown={applyByShortcut}
  onrust:edit-command={applyEditCommand}
/>

/**
 * Whether the editor is covered, by a modal open or by the settings page shown, so its keys and
 * the Edit menu leave the Project alone: the user is working on something else and cannot see
 * the Segments a key would change.
 */
export function isEditorCovered(): boolean {
  return (
    document.querySelector(
      "dialog[open], [data-covers-editor]:not([hidden])",
    ) !== null
  );
}

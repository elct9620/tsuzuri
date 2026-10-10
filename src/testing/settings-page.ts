/** The titles of the settings' sections shown under `root`, leaving out those hidden. */
export function shownSectionTitles(root: ParentNode): string[] {
  return [...root.querySelectorAll("fieldset")]
    .filter((group) => group.closest("[hidden]") === null)
    .map((group) => group.querySelector("legend")?.textContent ?? "");
}

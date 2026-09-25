/** The page's `#translation-options` template, reduced to the fields a test reads and sets. */
export const translationOptionsTemplate = `
  <template id="translation-options">
    <select data-translation-options-target="language" data-action="translation-options#showOverwrite">
      <option value="en">English</option>
      <option value="ja" selected>日本語</option>
    </select>
    <span data-translation-options-target="glossary"></span>
    <input type="checkbox" data-translation-options-target="speakerLabels">
    <input type="checkbox" data-translation-options-target="selfReview">
    <input type="checkbox" data-translation-options-target="summary">
    <input type="number" value="100" data-translation-options-target="summaryWords">
    <div data-translation-options-target="overwrite" hidden></div>
  </template>
`;

/** One of the translation options inside the element `scope` selects. */
export function translationOption<T extends HTMLElement>(
  scope: string,
  name: string,
): T {
  return document.querySelector<T>(
    `${scope} [data-translation-options-target="${name}"]`,
  )!;
}

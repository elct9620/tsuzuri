/** The TranslationOptions Svelte Component's markup, reduced to the fields a test reads and sets. */
export const translationOptions = `
  <select data-translation-options-target="language" data-action="translation-options#reportOverwrite translation-options#offerCleanup">
    <option value="en">English</option>
    <option value="ja" selected>日本語</option>
    <option value="zh-TW">繁體中文</option>
  </select>
  <span data-translation-options-target="glossary"></span>
  <input type="checkbox" data-translation-options-target="selfReview">
  <label data-translation-options-target="summaryChoice">
    <input type="checkbox" data-translation-options-target="summary">
    <input type="number" value="100" min="1" step="1" required data-translation-options-target="summaryWords">
  </label>
  <label data-translation-options-target="cleanupChoice">
    <input type="checkbox" data-translation-options-target="simplifiedCleaned">
  </label>
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

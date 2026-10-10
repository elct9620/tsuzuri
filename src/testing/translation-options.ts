import { screen, within } from "@testing-library/svelte";

/** The Language the translation options translate into. */
export function languageSelect(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", {
    hidden: true,
    name: "譯成",
  });
}

/** Chooses `language` to translate into, as picking it from the list does. */
export function chooseLanguage(language: string): void {
  const select = languageSelect();
  select.value = language;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * The translation option checked by the box named `name` in the dialog open, or none while it is
 * not offered; a menu elsewhere on the page may name a box alike.
 */
export function optionCheckbox(name: string | RegExp): HTMLInputElement | null {
  return within(
    document.querySelector<HTMLElement>("dialog[open]")!,
  ).queryByRole<HTMLInputElement>("checkbox", {
    hidden: true,
    name,
  });
}

/** Types `words` as the Rolling Summary's word limit. */
export function setSummaryWords(words: string): void {
  const field = screen.getByRole<HTMLInputElement>("spinbutton", {
    hidden: true,
    name: "字",
  });
  field.value = words;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

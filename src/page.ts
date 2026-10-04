/**
 * The page's markup, written by Svelte inside the `<body>` that `index.html` gives it.
 */

import { mount } from "svelte";

import App from "./App.svelte";
import { translatePage } from "./i18n";
import { showIcons } from "./ui/icons";

/**
 * Writes the page into `target`, then its text in the Interface Language and its icons: both are
 * read from the markup once, so they come after it is written.
 */
export function drawPage(target: Element = document.body): void {
  mount(App, { target });
  translatePage(target);
  showIcons(target);
}

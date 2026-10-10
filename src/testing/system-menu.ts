/**
 * What a test reads of the menus of the system the webview makes through Tauri's menu plugin.
 */

/** One item of a menu as `plugin:menu|new` receives it: a predefined item, or a choice and its handler. */
export interface MenuItemSent {
  item?: string;
  id?: string;
  text?: string;
  enabled?: boolean;
  accelerator?: string;
  handler?: { onmessage: (id: string) => void };
}

/** The text of each item of `items`, or the name of a predefined one. */
export const menuTexts = (items: MenuItemSent[]) =>
  items.map((item) => item.text ?? item.item);

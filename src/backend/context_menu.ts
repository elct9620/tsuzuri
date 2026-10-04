import { Menu } from "@tauri-apps/api/menu";

/** One choice of a menu of the system, run once it is picked. */
export interface MenuChoice {
  text: string;
  isEnabled: boolean;
  /** The keys that press the same choice, as `Ctrl+Alt+Enter`, shown beside it. */
  accelerator?: string;
  run: () => void;
}

/** The clipboard commands the system applies to the text field holding focus, named in the Interface Language. */
export interface ClipboardTexts {
  cut: string;
  copy: string;
  paste: string;
}

/**
 * Opens `choices` as a menu of the system where the pointer is, after the clipboard commands for a
 * text field when `clipboard` names them. It takes the place of the page's own menu, which a
 * `contextmenu` listener keeps from opening.
 */
export async function popUpMenu(
  choices: MenuChoice[],
  clipboard: ClipboardTexts | null,
): Promise<void> {
  const clipboardItems = clipboard
    ? [
        { item: "Cut" as const, text: clipboard.cut },
        { item: "Copy" as const, text: clipboard.copy },
        { item: "Paste" as const, text: clipboard.paste },
        { item: "Separator" as const },
      ]
    : [];
  const menu = await Menu.new({
    items: [
      ...clipboardItems,
      ...choices.map(({ text, isEnabled, accelerator, run }, at) => ({
        id: `choice-${at}`,
        text,
        enabled: isEnabled,
        accelerator,
        action: run,
      })),
    ],
  });
  await menu.popup();
}

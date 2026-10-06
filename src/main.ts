import { assemble } from "#/assembly.ts";
import { locale } from "#/ipc/system.ts";
import { setInterfaceLanguage } from "#/i18n.ts";
import { drawPage } from "#/page.ts";

/**
 * Svelte Components write text as they mount, so the language is settled before the page is
 * drawn. The page is drawn with the Project feed and the editing session `assemble` makes, after
 * the session that reads each Project first, and only then is the Project read.
 */
async function start(): Promise<void> {
  await setInterfaceLanguage(await locale());
  const assembly = assemble();
  drawPage(assembly.feed, assembly.session);
  await assembly.start();
}

void start();

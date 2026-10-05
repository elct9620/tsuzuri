import { Application } from "@hotwired/stimulus";

import { assemble } from "./assembly";
import { locale } from "./backend/system";
import { setInterfaceLanguage } from "./i18n";
import { drawPage } from "./page";

/**
 * Controllers write text as they connect, so the language is settled and the page drawn before any
 * of them starts. `assemble` hands each of them the Project feed and the editing session, and the
 * page is drawn with the same feed, after the session that reads each Project first.
 */
async function start(): Promise<void> {
  await setInterfaceLanguage(await locale());
  const application = new Application();
  const assembly = assemble(application, {});
  drawPage(assembly.feed, assembly.session);
  await application.start();
  await assembly.start();
}

void start();

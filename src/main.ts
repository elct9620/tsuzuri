import { Application } from "@hotwired/stimulus";
import { locale } from "@tauri-apps/plugin-os";

import ComponentsController from "./controllers/components_controller";
import ModelsController from "./controllers/models_controller";
import TabsController from "./controllers/tabs_controller";
import TranscribeController from "./controllers/transcribe_controller";
import TranscriptController from "./controllers/transcript_controller";
import TranslateController from "./controllers/translate_controller";
import { setInterfaceLanguage, translatePage } from "./i18n";

/** Controllers write text as they connect, so the language is settled before any of them starts. */
async function start(): Promise<void> {
  await setInterfaceLanguage(await locale());
  translatePage();
  const application = Application.start();
  application.register("components", ComponentsController);
  application.register("models", ModelsController);
  application.register("tabs", TabsController);
  application.register("transcribe", TranscribeController);
  application.register("transcript", TranscriptController);
  application.register("translate", TranslateController);
}

void start();

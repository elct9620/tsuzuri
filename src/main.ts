import { Application } from "@hotwired/stimulus";

import { locale } from "./backend/system";
import ComparisonController from "./controllers/comparison_controller";
import ComponentsController from "./controllers/components_controller";
import DialogController from "./controllers/dialog_controller";
import GlossaryController from "./controllers/glossary_controller";
import ModelsController from "./controllers/models_controller";
import ProgressController from "./controllers/progress_controller";
import ProjectController from "./controllers/project_controller";
import SegmentChangesController from "./controllers/segment_changes_controller";
import TooltipController from "./controllers/tooltip_controller";
import TranscribeController from "./controllers/transcribe_controller";
import TranscriptController from "./controllers/transcript_controller";
import TranslateController from "./controllers/translate_controller";
import TranslationOptionsController from "./controllers/translation_options_controller";
import TranslationSettingsController from "./controllers/translation_settings_controller";
import UndoController from "./controllers/undo_controller";
import VersionsController from "./controllers/versions_controller";
import { setInterfaceLanguage, translatePage } from "./i18n";

/** Controllers write text as they connect, so the language is settled before any of them starts. */
async function start(): Promise<void> {
  await setInterfaceLanguage(await locale());
  translatePage();
  const application = Application.start();
  application.register("comparison", ComparisonController);
  application.register("components", ComponentsController);
  application.register("dialog", DialogController);
  application.register("glossary", GlossaryController);
  application.register("models", ModelsController);
  application.register("progress", ProgressController);
  application.register("project", ProjectController);
  application.register("segment-changes", SegmentChangesController);
  application.register("tooltip", TooltipController);
  application.register("transcribe", TranscribeController);
  application.register("transcript", TranscriptController);
  application.register("translate", TranslateController);
  application.register("translation-options", TranslationOptionsController);
  application.register("translation-settings", TranslationSettingsController);
  application.register("undo", UndoController);
  application.register("versions", VersionsController);
}

void start();

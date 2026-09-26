import { Application } from "@hotwired/stimulus";

import { assemble } from "./assembly";
import { locale } from "./backend/system";
import ComparisonController from "./controllers/comparison_controller";
import ComponentsController from "./controllers/components_controller";
import DialogController from "./controllers/dialog_controller";
import FieldController, {
  composingOption,
} from "./controllers/field_controller";
import GlossaryController from "./controllers/glossary_controller";
import LogsController from "./controllers/logs_controller";
import ModelsController from "./controllers/models_controller";
import NotificationController from "./controllers/notification_controller";
import PreviewController from "./controllers/preview_controller";
import ProgressController from "./controllers/progress_controller";
import ProjectController from "./controllers/project_controller";
import ReplacementController from "./controllers/replacement_controller";
import RetranslationController from "./controllers/retranslation_controller";
import SegmentChangesController from "./controllers/segment_changes_controller";
import ShortcutsController from "./controllers/shortcuts_controller";
import SpeakersController from "./controllers/speakers_controller";
import TimelineController, {
  controlOption,
} from "./controllers/timeline_controller";
import TooltipController from "./controllers/tooltip_controller";
import TranscribeController from "./controllers/transcribe_controller";
import TranscriptController from "./controllers/transcript_controller";
import TranscriptionSettingsController from "./controllers/transcription_settings_controller";
import TranslateController from "./controllers/translate_controller";
import TranslationOptionsController from "./controllers/translation_options_controller";
import TranslationSettingsController from "./controllers/translation_settings_controller";
import UndoController, { typingOption } from "./controllers/undo_controller";
import VersionsController from "./controllers/versions_controller";
import { setInterfaceLanguage, translatePage } from "./i18n";
import { showIcons } from "./ui/icons";

/**
 * Controllers write text as they connect, so the language is settled before any of them starts;
 * `assemble` then hands each of them the Project feed and the editing session.
 */
async function start(): Promise<void> {
  await setInterfaceLanguage(await locale());
  translatePage();
  showIcons();
  const application = Application.start();
  application.registerActionOption("composing", composingOption);
  application.registerActionOption("control", controlOption);
  application.registerActionOption("typing", typingOption);
  await assemble(application, {
    comparison: ComparisonController,
    components: ComponentsController,
    dialog: DialogController,
    field: FieldController,
    glossary: GlossaryController,
    logs: LogsController,
    models: ModelsController,
    notification: NotificationController,
    preview: PreviewController,
    progress: ProgressController,
    project: ProjectController,
    replacement: ReplacementController,
    retranslation: RetranslationController,
    "segment-changes": SegmentChangesController,
    shortcuts: ShortcutsController,
    speakers: SpeakersController,
    timeline: TimelineController,
    tooltip: TooltipController,
    transcribe: TranscribeController,
    transcript: TranscriptController,
    "transcription-settings": TranscriptionSettingsController,
    translate: TranslateController,
    "translation-options": TranslationOptionsController,
    "translation-settings": TranslationSettingsController,
    undo: UndoController,
    versions: VersionsController,
  }).start();
}

void start();

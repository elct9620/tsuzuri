import { Application } from "@hotwired/stimulus";

import { assemble } from "./assembly";
import { locale } from "./backend/system";
import AboutController from "./controllers/about_controller";
import CleanupController from "./controllers/cleanup_controller";
import ComparisonController from "./controllers/comparison_controller";
import ComponentsController from "./controllers/components_controller";
import DialogController from "./controllers/dialog_controller";
import FieldController, {
  composingOption,
} from "./controllers/field_controller";
import GlossaryController from "./controllers/glossary_controller";
import LicensesController from "./controllers/licenses_controller";
import LogsController from "./controllers/logs_controller";
import ModelSlotController from "./controllers/model_slot_controller";
import ModelsController from "./controllers/models_controller";
import NotificationController from "./controllers/notification_controller";
import PreviewController from "./controllers/preview_controller";
import ProgressController from "./controllers/progress_controller";
import ProjectController from "./controllers/project_controller";
import ProjectSettingsController from "./controllers/project_settings_controller";
import RecentProjectsController from "./controllers/recent_projects_controller";
import RepositoryController from "./controllers/repository_controller";
import ReplacementController from "./controllers/replacement_controller";
import ResourceListController from "./controllers/resource_list_controller";
import SearchController from "./controllers/search_controller";
import SegmentChangesController from "./controllers/segment_changes_controller";
import ShortcutsController from "./controllers/shortcuts_controller";
import SpeakersController from "./controllers/speakers_controller";
import SponsorshipController from "./controllers/sponsorship_controller";
import TimeFieldController from "./controllers/time_field_controller";
import TimelineController, {
  controlOption,
} from "./controllers/timeline_controller";
import TooltipController from "./controllers/tooltip_controller";
import DiarizeController from "./controllers/diarize_controller";
import TranscribeController from "./controllers/transcribe_controller";
import TranscriptController from "./controllers/transcript_controller";
import TranscriptionSettingsController from "./controllers/transcription_settings_controller";
import TranslateController from "./controllers/translate_controller";
import TranslationOptionsController from "./controllers/translation_options_controller";
import TranslationSettingsController from "./controllers/translation_settings_controller";
import UndoController, { typingOption } from "./controllers/undo_controller";
import UpdatesController from "./controllers/updates_controller";
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
    about: AboutController,
    comparison: ComparisonController,
    components: ComponentsController,
    dialog: DialogController,
    field: FieldController,
    glossary: GlossaryController,
    licenses: LicensesController,
    logs: LogsController,
    "model-slot": ModelSlotController,
    models: ModelsController,
    notification: NotificationController,
    preview: PreviewController,
    progress: ProgressController,
    project: ProjectController,
    "project-settings": ProjectSettingsController,
    "recent-projects": RecentProjectsController,
    replacement: ReplacementController,
    repository: RepositoryController,
    "resource-list": ResourceListController,
    cleanup: CleanupController,
    search: SearchController,
    diarize: DiarizeController,
    "segment-changes": SegmentChangesController,
    shortcuts: ShortcutsController,
    speakers: SpeakersController,
    sponsorship: SponsorshipController,
    "time-field": TimeFieldController,
    timeline: TimelineController,
    tooltip: TooltipController,
    transcribe: TranscribeController,
    transcript: TranscriptController,
    "transcription-settings": TranscriptionSettingsController,
    translate: TranslateController,
    "translation-options": TranslationOptionsController,
    "translation-settings": TranslationSettingsController,
    undo: UndoController,
    updates: UpdatesController,
    versions: VersionsController,
  }).start();
}

void start();

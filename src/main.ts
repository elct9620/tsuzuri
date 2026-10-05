import { Application } from "@hotwired/stimulus";

import { assemble } from "./assembly";
import { locale } from "./backend/system";
import CleanupController from "./controllers/cleanup_controller";
import ComparisonController from "./controllers/comparison_controller";
import FieldController, {
  composingOption,
} from "./controllers/field_controller";
import PreviewController from "./controllers/preview_controller";
import ProjectController from "./controllers/project_controller";
import RecentProjectsController from "./controllers/recent_projects_controller";
import SearchController from "./controllers/search_controller";
import SegmentChangesController, {
  typingOption,
} from "./controllers/segment_changes_controller";
import SpeakersController from "./controllers/speakers_controller";
import TimeFieldController from "./controllers/time_field_controller";
import TimelineController, {
  controlOption,
} from "./controllers/timeline_controller";
import TranscriptController from "./controllers/transcript_controller";
import VersionsController from "./controllers/versions_controller";
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
  application.registerActionOption("composing", composingOption);
  application.registerActionOption("control", controlOption);
  application.registerActionOption("typing", typingOption);
  const assembly = assemble(application, {
    comparison: ComparisonController,
    field: FieldController,
    preview: PreviewController,
    project: ProjectController,
    "recent-projects": RecentProjectsController,
    cleanup: CleanupController,
    search: SearchController,
    "segment-changes": SegmentChangesController,
    speakers: SpeakersController,
    "time-field": TimeFieldController,
    timeline: TimelineController,
    transcript: TranscriptController,
    versions: VersionsController,
  });
  drawPage(assembly.feed, assembly.session);
  await application.start();
  await assembly.start();
}

void start();

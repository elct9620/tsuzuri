import { Application } from "@hotwired/stimulus";

import { assemble } from "./assembly";
import { locale } from "./backend/system";
import CleanupController from "./controllers/cleanup-controller";
import ComparisonController from "./controllers/comparison-controller";
import FieldController, {
  composingOption,
} from "./controllers/field-controller";
import PreviewController from "./controllers/preview-controller";
import SegmentChangesController, {
  typingOption,
} from "./controllers/segment-changes-controller";
import SpeakersController from "./controllers/speakers-controller";
import TimeFieldController from "./controllers/time-field-controller";
import TimelineController, {
  controlOption,
} from "./controllers/timeline-controller";
import TranscriptController from "./controllers/transcript-controller";
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
    cleanup: CleanupController,
    "segment-changes": SegmentChangesController,
    speakers: SpeakersController,
    "time-field": TimeFieldController,
    timeline: TimelineController,
    transcript: TranscriptController,
  });
  drawPage(assembly.feed, assembly.session);
  await application.start();
  await assembly.start();
}

void start();

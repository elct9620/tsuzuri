import { Application } from "@hotwired/stimulus";
import ModeTabsController from "./controllers/mode_tabs_controller";

const application = Application.start();
application.register("mode-tabs", ModeTabsController);

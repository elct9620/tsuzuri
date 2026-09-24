import { Application } from "@hotwired/stimulus";
import ModeTabsController from "./controllers/mode_tabs_controller";
import ModelsController from "./controllers/models_controller";

const application = Application.start();
application.register("mode-tabs", ModeTabsController);
application.register("models", ModelsController);

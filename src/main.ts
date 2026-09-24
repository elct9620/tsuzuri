import { Application } from "@hotwired/stimulus";
import ComponentsController from "./controllers/components_controller";
import ModeTabsController from "./controllers/mode_tabs_controller";
import ModelsController from "./controllers/models_controller";

const application = Application.start();
application.register("components", ComponentsController);
application.register("mode-tabs", ModeTabsController);
application.register("models", ModelsController);

import { Controller } from "@hotwired/stimulus";

import { open } from "../backend/dialog";
import {
  chooseLogDirectory,
  logDirectory,
  openLogDirectory,
  type LogDirectory,
} from "../backend/logs";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

/** Where the log is written: shown, chosen anew for the next launch, and opened. */
export default class LogsController extends Controller {
  static targets = ["path", "pending"];

  declare readonly pathTarget: HTMLElement;
  /** Says a directory chosen takes effect after a restart, while it differs from the one in use. */
  declare readonly pendingTarget: HTMLElement;

  async connect(): Promise<void> {
    try {
      this.show(await logDirectory());
    } catch (error) {
      notifyFailure(t("settings.logsUnreadable"), error);
    }
  }

  async choose(): Promise<void> {
    const path = await open({ multiple: false, directory: true });
    if (path === null) return;
    try {
      this.show(await chooseLogDirectory(path));
    } catch (error) {
      notifyFailure(t("settings.logsNotChosen"), error);
    }
  }

  async openDirectory(): Promise<void> {
    try {
      await openLogDirectory();
    } catch (error) {
      notifyFailure(t("settings.logsNotOpened"), error);
    }
  }

  private show(directory: LogDirectory): void {
    this.pathTarget.textContent = directory.in_use;
    this.pathTarget.title = directory.in_use;
    this.pendingTarget.hidden = directory.chosen === directory.in_use;
    this.pendingTarget.textContent = t("settings.logsAfterRestart", {
      path: directory.chosen,
    });
  }
}

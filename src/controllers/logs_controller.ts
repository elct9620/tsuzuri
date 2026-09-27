import { Controller } from "@hotwired/stimulus";

import { open } from "../backend/dialog";
import {
  chooseDebugLog,
  chooseLogDirectory,
  debugLog,
  logDirectory,
  openLogDirectory,
  type DebugLog,
  type LogDirectory,
} from "../backend/logs";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

/** Where the log is written and whether it holds the Debug Log: shown, chosen anew for the next launch, and opened. */
export default class LogsController extends Controller {
  static targets = [
    "path",
    "pendingHint",
    "debugLogToggle",
    "debugLogPendingHint",
  ];

  declare readonly pathTarget: HTMLElement;
  /** Says a directory chosen takes effect after a restart, while it differs from the one in use. */
  declare readonly pendingHintTarget: HTMLElement;
  /** Shows whether the Debug Log is chosen for the next launch. */
  declare readonly debugLogToggleTarget: HTMLInputElement;
  /** Says the Debug Log chosen takes effect after a restart, while it differs from this launch's. */
  declare readonly debugLogPendingHintTarget: HTMLElement;

  async connect(): Promise<void> {
    try {
      this.show(await logDirectory());
      this.showDebugLog(await debugLog());
    } catch (error) {
      notifyFailure(t("settings.logsUnreadable"), error);
    }
  }

  async chooseDebugLog(): Promise<void> {
    try {
      this.showDebugLog(
        await chooseDebugLog(this.debugLogToggleTarget.checked),
      );
    } catch (error) {
      notifyFailure(t("settings.debugLogNotChosen"), error);
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
    this.pendingHintTarget.hidden = directory.next_launch === directory.in_use;
    this.pendingHintTarget.textContent = t("settings.logsAfterRestart", {
      path: directory.next_launch,
    });
  }

  private showDebugLog(debugLog: DebugLog): void {
    this.debugLogToggleTarget.checked = debugLog.is_written_next_launch;
    this.debugLogPendingHintTarget.hidden =
      debugLog.is_written_next_launch === debugLog.is_written_now;
    this.debugLogPendingHintTarget.textContent = t(
      debugLog.is_written_next_launch
        ? "settings.debugLogOnAfterRestart"
        : "settings.debugLogOffAfterRestart",
    );
  }
}

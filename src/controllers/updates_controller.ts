import { Controller } from "@hotwired/stimulus";

import {
  checkForUpdate,
  checkForUpdateAtLaunch,
  chooseLaunchCheck,
  installUpdate,
  updateSettings,
  type AppUpdate,
  type UpdateProgress,
} from "../backend/updates";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification";

/** App Updates: looked for at launch and under About, offered to the user, and installed behind a window that stays until Tsuzuri restarts. */
export default class UpdatesController extends Controller {
  static targets = [
    "checkButton",
    "checkingSpinner",
    "status",
    "updateButton",
    "launchCheckToggle",
    "dialog",
    "dialogTitle",
    "progressBar",
    "progressText",
  ];

  declare readonly checkButtonTarget: HTMLButtonElement;
  declare readonly checkingSpinnerTarget: HTMLElement;
  /** Says whether the running release is the latest, or names the App Update found. */
  declare readonly statusTarget: HTMLElement;
  declare readonly updateButtonTarget: HTMLButtonElement;
  declare readonly launchCheckToggleTarget: HTMLInputElement;
  /** The window shown while an App Update installs, which the user cannot close. */
  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly dialogTitleTarget: HTMLElement;
  declare readonly progressBarTarget: HTMLProgressElement;
  declare readonly progressTextTarget: HTMLElement;

  /** The App Update the last check found. */
  private foundUpdate: AppUpdate | null = null;

  async connect(): Promise<void> {
    try {
      this.launchCheckToggleTarget.checked = (
        await updateSettings()
      ).has_launch_check;
      this.offer(await checkForUpdateAtLaunch());
    } catch (error) {
      notifyFailure(t("settings.updateNotChecked"), error);
    }
  }

  async check(): Promise<void> {
    this.checkButtonTarget.disabled = true;
    this.checkingSpinnerTarget.hidden = false;
    try {
      this.show(await checkForUpdate());
    } catch (error) {
      notifyFailure(t("settings.updateNotChecked"), error);
    } finally {
      this.checkButtonTarget.disabled = false;
      this.checkingSpinnerTarget.hidden = true;
    }
  }

  async install(): Promise<void> {
    if (!this.foundUpdate) return;
    this.dialogTitleTarget.textContent = t("settings.updating", {
      releaseNumber: this.foundUpdate.release_number,
    });
    this.progressBarTarget.removeAttribute("value");
    this.progressTextTarget.textContent = t("settings.updateStarting");
    this.dialogTarget.showModal();
    try {
      await installUpdate();
    } catch (error) {
      this.dialogTarget.close();
      notifyFailure(t("settings.updateNotInstalled"), error);
    }
  }

  showProgress({ detail }: CustomEvent<UpdateProgress>): void {
    if (detail.total) {
      const percent = Math.floor((detail.downloaded * 100) / detail.total);
      this.progressBarTarget.value = percent;
      this.progressTextTarget.textContent = t("settings.updateDownloading", {
        percent,
      });
      return;
    }
    this.progressBarTarget.removeAttribute("value");
    this.progressTextTarget.textContent = t("settings.updateDownloaded", {
      megabytes: Math.floor(detail.downloaded / BYTES_PER_MEGABYTE),
    });
  }

  /** Keeps the install window open against Esc: Tsuzuri restarts when it is done. */
  refuseClose(event: Event): void {
    event.preventDefault();
  }

  async chooseLaunchCheck(): Promise<void> {
    try {
      this.launchCheckToggleTarget.checked = (
        await chooseLaunchCheck(this.launchCheckToggleTarget.checked)
      ).has_launch_check;
    } catch (error) {
      notifyFailure(t("settings.launchCheckNotChosen"), error);
    }
  }

  /** Offers an App Update the launch check found under About and in a Notification; finding none says nothing, since nobody asked. */
  private offer(update: AppUpdate | null): void {
    if (!update) return;
    this.show(update);
    notify({
      title: t("settings.updateFound", {
        releaseNumber: update.release_number,
      }),
      kind: "success",
      action: { label: t("settings.update"), run: () => void this.install() },
    });
  }

  private show(update: AppUpdate | null): void {
    this.foundUpdate = update;
    this.statusTarget.textContent = update
      ? t("settings.updateFound", { releaseNumber: update.release_number })
      : t("settings.latestRelease");
    this.updateButtonTarget.hidden = !update;
  }
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

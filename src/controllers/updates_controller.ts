import { Controller } from "@hotwired/stimulus";

import { appBuild } from "../backend/about";
import {
  checkForRollback,
  checkForUpdate,
  checkForUpdateAtLaunch,
  chooseLaunchCheck,
  chooseUpdateChannel,
  installUpdate,
  updateSettings,
  type AppUpdate,
  type UpdateChannel,
  type UpdateProgress,
  type UpdateSettings,
} from "../backend/updates";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification";

/** App Updates: looked for at launch and from the settings, offered to the user, and installed behind a window that stays until Tsuzuri restarts. */
export default class UpdatesController extends Controller {
  static targets = [
    "checkButton",
    "checkingSpinner",
    "status",
    "updateButton",
    "launchCheckToggle",
    "channelRow",
    "channelSelect",
    "rollbackButton",
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
  /** The Update Channel setting, which an rpm install does not have. */
  declare readonly channelRowTarget: HTMLElement;
  declare readonly channelSelectTarget: HTMLSelectElement;
  /** Installs the current stable release on a Preview build whose channel went back to Stable. */
  declare readonly rollbackButtonTarget: HTMLButtonElement;
  /** The window shown while an App Update installs, which the user cannot close. */
  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly dialogTitleTarget: HTMLElement;
  declare readonly progressBarTarget: HTMLProgressElement;
  declare readonly progressTextTarget: HTMLElement;

  /** The App Update the last check found. */
  private foundUpdate: AppUpdate | null = null;

  /** Whether the running Tsuzuri is a Preview build, the only one a Rollback leads back from. */
  private isPreviewBuild = false;

  async connect(): Promise<void> {
    try {
      const build = await appBuild();
      this.isPreviewBuild = build.is_preview_build;
      this.channelRowTarget.hidden = !build.has_preview_channel;
      this.showSettings(await updateSettings());
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

  async rollBack(): Promise<void> {
    this.rollbackButtonTarget.disabled = true;
    try {
      this.show(await checkForRollback());
      await this.install();
    } catch (error) {
      notifyFailure(t("settings.updateNotChecked"), error);
    } finally {
      this.rollbackButtonTarget.disabled = false;
    }
  }

  async install(): Promise<void> {
    if (!this.foundUpdate) return;
    this.dialogTitleTarget.textContent = t(
      this.foundUpdate.is_preview_build
        ? "settings.updatingToPreview"
        : "settings.updating",
      { releaseName: this.foundUpdate.release_name },
    );
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
      this.showSettings(
        await chooseLaunchCheck(this.launchCheckToggleTarget.checked),
      );
    } catch (error) {
      notifyFailure(t("settings.launchCheckNotChosen"), error);
    }
  }

  async chooseChannel(): Promise<void> {
    try {
      this.showSettings(
        await chooseUpdateChannel(
          this.channelSelectTarget.value as UpdateChannel,
        ),
      );
    } catch (error) {
      notifyFailure(t("settings.updateChannelNotChosen"), error);
    }
  }

  /** Shows the update settings, offering a Rollback only where it leads back: a Preview build on the Stable channel. */
  private showSettings(settings: UpdateSettings): void {
    this.launchCheckToggleTarget.checked = settings.has_launch_check;
    this.channelSelectTarget.value = settings.channel;
    this.rollbackButtonTarget.hidden = !(
      this.isPreviewBuild && settings.channel === "stable"
    );
  }

  /** Offers an App Update the launch check found in the settings and in a Notification; finding none says nothing, since nobody asked. */
  private offer(update: AppUpdate | null): void {
    if (!update) return;
    this.show(update);
    notify({
      title: updateFoundMessage(update),
      kind: "success",
      action: { label: t("settings.update"), run: () => void this.install() },
    });
  }

  private show(update: AppUpdate | null): void {
    this.foundUpdate = update;
    this.statusTarget.textContent = update
      ? updateFoundMessage(update)
      : t("settings.latestRelease");
    this.updateButtonTarget.hidden = !update;
  }
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** What the settings and the launch Notification say of a found App Update, by its Release Name. */
function updateFoundMessage(update: AppUpdate): string {
  return t(
    update.is_preview_build ? "settings.previewFound" : "settings.updateFound",
    { releaseName: update.release_name },
  );
}

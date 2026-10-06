/**
 * The App Update found last, shared by the settings that look for one, the Notification that
 * offers one found at launch, and the window that stays while one installs.
 */

import { installUpdate, type AppUpdate } from "#/backend/updates.ts";
import { t } from "#/i18n.ts";
import { notify, notifyFailure } from "#/ui/notification.svelte.ts";

/** What the settings and the launch Notification say of a found App Update, by its Release Name. */
export function updateFoundMessage(update: AppUpdate): string {
  return t(
    update.is_preview_build ? "settings.previewFound" : "settings.updateFound",
    { releaseName: update.release_name },
  );
}

export class AppUpdates {
  /** The App Update the last check found, or none. */
  foundUpdate = $state<AppUpdate | null>(null);
  /** Whether a check has answered, so the settings say what it found. */
  hasChecked = $state(false);
  /** The App Update installing now, shown in a window the user cannot close. */
  installingUpdate = $state<AppUpdate | null>(null);

  /** Takes what a check found. */
  show(update: AppUpdate | null): void {
    this.foundUpdate = update;
    this.hasChecked = true;
  }

  /** Offers an App Update the launch check found, in the settings and a Notification; finding none says nothing, since nobody asked. */
  offer(update: AppUpdate | null): void {
    if (!update) return;
    this.show(update);
    notify({
      title: updateFoundMessage(update),
      kind: "success",
      action: { label: t("settings.update"), run: () => void this.install() },
    });
  }

  /** Installs the App Update found; Tsuzuri restarts once it is done, so only a refusal returns. */
  async install(): Promise<void> {
    if (!this.foundUpdate) return;
    this.installingUpdate = this.foundUpdate;
    try {
      await installUpdate();
    } catch (error) {
      this.installingUpdate = null;
      notifyFailure(t("settings.updateNotInstalled"), error);
    }
  }
}

import { Controller } from "@hotwired/stimulus";

import { openReleases } from "../backend/about";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

/** Where About leads: the License Notice in full, and the releases carrying ffmpeg's source. */
export default class LicensesController extends Controller {
  static targets = ["dialog", "notice", "missingHint"];

  declare readonly dialogTarget: HTMLDialogElement;
  /** Shows the License Notice, read the first time the dialog opens. */
  declare readonly noticeTarget: HTMLIFrameElement;
  /** Says a development build carries no License Notice. */
  declare readonly missingHintTarget: HTMLElement;

  async showLicenses(): Promise<void> {
    this.dialogTarget.showModal();
    if (this.noticeTarget.srcdoc || !this.missingHintTarget.hidden) return;
    const notice = await licenseNotice();
    if (notice === null) {
      this.missingHintTarget.hidden = false;
      return;
    }
    this.noticeTarget.srcdoc = notice;
    this.noticeTarget.hidden = false;
  }

  async openSource(): Promise<void> {
    try {
      await openReleases();
    } catch (error) {
      notifyFailure(t("settings.releasesNotOpened"), error);
    }
  }
}

/**
 * The License Notice CI writes into the interface, or null for a build without one,
 * where the page answered in its place is not the notice.
 */
async function licenseNotice(): Promise<string | null> {
  try {
    const response = await fetch("LICENSE.html");
    if (!response.ok) return null;
    const text = await response.text();
    const page = new DOMParser().parseFromString(text, "text/html");
    return page.querySelector("section#tsuzuri") ? text : null;
  } catch {
    return null;
  }
}

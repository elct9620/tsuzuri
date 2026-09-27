import { Controller } from "@hotwired/stimulus";

import { appBuild, openReleases } from "../backend/about";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification";

/** The App Build under About, for a report to name, and where About leads: the License Notice in full, and the releases carrying ffmpeg's source. */
export default class AboutController extends Controller {
  static targets = ["build", "dialog", "notice", "missingHint"];

  declare readonly buildTarget: HTMLElement;

  declare readonly dialogTarget: HTMLDialogElement;
  /** Shows the License Notice, read the first time the dialog opens. */
  declare readonly noticeTarget: HTMLIFrameElement;
  /** Says a development build carries no License Notice. */
  declare readonly missingHintTarget: HTMLElement;

  /** The App Build as a report names it, in any Interface Language. */
  private buildLine = "";

  async connect(): Promise<void> {
    const build = await appBuild();
    const commit = build.commit.slice(0, SHORT_COMMIT_LENGTH);
    this.buildTarget.textContent = t("settings.appBuild", {
      releaseNumber: build.release_number,
      commit,
    });
    this.buildLine = `Tsuzuri ${build.release_number} (${commit})`;
  }

  async copyBuild(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.buildLine);
      notify({ title: t("settings.appBuildCopied"), kind: "success" });
    } catch (error) {
      notifyFailure(t("settings.appBuildNotCopied"), error);
    }
  }

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

/** How much of the commit is shown, as git abbreviates it. */
const SHORT_COMMIT_LENGTH = 7;

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

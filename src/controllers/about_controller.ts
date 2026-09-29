import { Controller } from "@hotwired/stimulus";

import { appBuild } from "../backend/about";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification";

/** The App Build atop the general settings, for a report to name and copy. */
export default class AboutController extends Controller {
  static targets = ["build"];

  declare readonly buildTarget: HTMLElement;

  /** The App Build as a report names it, in any Interface Language. */
  private buildLine = "";

  async connect(): Promise<void> {
    const build = await appBuild();
    const commit = build.commit.slice(0, SHORT_COMMIT_LENGTH);
    this.buildTarget.textContent = t("settings.appBuild", {
      releaseName: build.release_name,
      commit,
    });
    this.buildLine = `Tsuzuri ${build.release_name} (${commit})`;
  }

  async copyBuild(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.buildLine);
      notify({ title: t("settings.appBuildCopied"), kind: "success" });
    } catch (error) {
      notifyFailure(t("settings.appBuildNotCopied"), error);
    }
  }
}

/** How much of the commit is shown, as git abbreviates it. */
const SHORT_COMMIT_LENGTH = 7;

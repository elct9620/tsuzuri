import { Controller } from "@hotwired/stimulus";

import { appBuild } from "../backend/about";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification";
import { localTime } from "../ui/time";

/** The App Build atop the general settings, for a report to name and copy. */
export default class AboutController extends Controller {
  static targets = ["build"];

  declare readonly buildTarget: HTMLElement;

  /** The App Build as a report names it, in any Interface Language. */
  private buildLine = "";

  async connect(): Promise<void> {
    const build = await appBuild();
    const commit = build.commit.slice(0, SHORT_COMMIT_LENGTH);
    this.buildTarget.textContent = build.preview
      ? t("settings.previewBuild", {
          basedOn: build.preview.based_on,
          builtAt: localTime(build.preview.built_at),
          commit,
        })
      : t("settings.appBuild", {
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
}

/** How much of the commit is shown, as git abbreviates it. */
const SHORT_COMMIT_LENGTH = 7;

import { Controller } from "@hotwired/stimulus";

import { openSponsorship } from "../backend/about";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

/** Leads from About to the page where Tsuzuri can be sponsored. */
export default class SponsorshipController extends Controller {
  async open(): Promise<void> {
    try {
      await openSponsorship();
    } catch (error) {
      notifyFailure(t("settings.sponsorshipNotOpened"), error);
    }
  }
}

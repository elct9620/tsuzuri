<script lang="ts">
  import Heart from "@lucide/svelte/icons/heart";

  import { openReleases, openSponsorship } from "../../../backend/about";
  import { t } from "../../../i18n";
  import { notifyFailure } from "../../../ui/notification.svelte";

  interface Props {
    /** Opens the full License Notice. */
    openLicenses: () => void;
  }

  let { openLicenses }: Props = $props();

  async function openSource(): Promise<void> {
    try {
      await openReleases();
    } catch (error) {
      notifyFailure(t("settings.releasesNotOpened"), error);
    }
  }

  async function openSponsorshipPage(): Promise<void> {
    try {
      await openSponsorship();
    } catch (error) {
      notifyFailure(t("settings.sponsorshipNotOpened"), error);
    }
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.about")}</legend>
  <div class="flex flex-col gap-1 text-base-content/70">
    <p>{t("settings.license")}</p>
    <p>
      This software uses code of FFmpeg licensed under the LGPLv2.1.
      Transcription uses whisper.cpp and translation uses llama.cpp, both under
      the MIT License. Each is bundled with Tsuzuri and runs as a separate
      program, which an executable you choose or have installed can replace.
    </p>
    <p>
      Cleaning Simplified Chinese uses the dictionaries of OpenCC
      (github.com/BYVoid/OpenCC) by BYVoid and contributors, under the Apache
      License 2.0, compiled into Tsuzuri as they are released.
    </p>
  </div>
  <div class="flex gap-2">
    <button type="button" class="btn btn-sm" onclick={openLicenses}>
      {t("settings.fullLicenses")}
    </button>
    <button type="button" class="btn btn-sm" onclick={openSource}>
      {t("settings.sourceCode")}
    </button>
    <button type="button" class="btn btn-sm" onclick={openSponsorshipPage}>
      <Heart class="size-4" />
      <span>{t("settings.sponsor")}</span>
    </button>
  </div>
</fieldset>

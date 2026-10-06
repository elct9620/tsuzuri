<!--
  @component
  The Preview's caption controls: the language shown over the video, and a menu of its backdrop,
  the colour of a Dummy Video and the Speaker, as the CaptionChoices hold them.
-->
<script module lang="ts">
  import type {
    CaptionBackdrop,
    DummyVideoColour,
  } from "#/ui/preview-screen.ts";
  import type { CaptionLanguage } from "#/state/caption-choices.svelte.ts";

  const CAPTION_LANGUAGES: { value: CaptionLanguage; label: string }[] = [
    { value: "original", label: "preview.captionOriginal" },
    { value: "translation", label: "preview.captionTranslation" },
    { value: "bilingual", label: "preview.captionBilingual" },
  ];
  const CAPTION_BACKDROPS: { value: CaptionBackdrop; label: string }[] = [
    { value: "none", label: "preview.captionBackdropNone" },
    { value: "translucent", label: "preview.captionBackdropTranslucent" },
    { value: "opaque", label: "preview.captionBackdropOpaque" },
  ];
  const DUMMY_VIDEO_COLOURS: { value: DummyVideoColour; label: string }[] = [
    { value: "black", label: "preview.dummyVideoBlack" },
    { value: "white", label: "preview.dummyVideoWhite" },
  ];
</script>

<script lang="ts">
  import Captions from "@lucide/svelte/icons/captions";

  import { t } from "#/i18n.ts";
  import type { CaptionChoices } from "#/state/caption-choices.svelte.ts";

  let {
    choices,
    hasTranslation,
    hasPicture,
  }: {
    choices: CaptionChoices;
    /** Whether a translation is shown, without which only the original is offered. */
    hasTranslation: boolean;
    /** Whether the media has a picture, over which no Dummy Video is drawn. */
    hasPicture: boolean;
  } = $props();
</script>

<div class="ml-auto flex items-center gap-2">
  <div role="radiogroup" class="join" aria-label={t("preview.captionLanguage")}>
    {#each CAPTION_LANGUAGES as { value, label } (value)}
      <input
        type="radio"
        name="preview-caption"
        {value}
        class="join-item btn btn-xs"
        aria-label={t(label)}
        checked={choices.shownLanguage(hasTranslation) === value}
        disabled={!hasTranslation && value !== "original"}
        onchange={() => choices.chooseLanguage(value)}
      />
    {/each}
  </div>
  <div class="dropdown dropdown-end">
    <div
      tabindex="0"
      role="button"
      class="btn btn-square btn-xs"
      aria-label={t("preview.captionOptions")}
      data-tooltip={t("preview.captionOptions")}
    >
      <Captions class="size-4" aria-hidden="true" />
    </div>
    <div
      tabindex="-1"
      class="dropdown-content z-20 mt-1 w-32 bg-base-100 shadow-md"
    >
      <!-- The join sits inside, as its display would keep a closed menu over the buttons beside it -->
      <div
        role="radiogroup"
        class="join join-vertical w-full"
        aria-label={t("preview.captionBackdrop")}
      >
        {#each CAPTION_BACKDROPS as { value, label } (value)}
          <input
            type="radio"
            name="preview-backdrop"
            {value}
            class="join-item btn btn-sm"
            aria-label={t(label)}
            checked={choices.backdrop === value}
            onchange={() => choices.chooseBackdrop(value)}
          />
        {/each}
      </div>
      <p class="px-3 pt-2 text-sm">{t("preview.dummyVideo")}</p>
      <div
        role="radiogroup"
        class="join w-full pt-1"
        aria-label={t("preview.dummyVideo")}
      >
        {#each DUMMY_VIDEO_COLOURS as { value, label } (value)}
          <input
            type="radio"
            name="preview-dummy-video"
            {value}
            class="join-item btn flex-1 btn-sm"
            aria-label={t(label)}
            checked={choices.dummyVideoColour === value}
            disabled={hasPicture}
            onchange={() => choices.chooseDummyVideoColour(value)}
          />
        {/each}
      </div>
      <label class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <span>{t("preview.captionSpeaker")}</span>
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={choices.isSpeakerShown}
          onchange={(event) =>
            choices.toggleSpeaker(event.currentTarget.checked)}
        />
      </label>
    </div>
  </div>
</div>

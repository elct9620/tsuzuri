<!--
  @component
  The View menu's caption choices: the language shown over the video, its backdrop, the colour of a
  Dummy Video and the Speaker, as the CaptionChoices hold them.
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

<div class="flex flex-col gap-2">
  <div
    role="radiogroup"
    class="join w-full"
    aria-label={t("preview.captionLanguage")}
  >
    {#each CAPTION_LANGUAGES as { value, label } (value)}
      <input
        type="radio"
        name="preview-caption"
        {value}
        class="join-item btn flex-1 btn-sm"
        aria-label={t(label)}
        checked={choices.shownLanguage(hasTranslation) === value}
        disabled={!hasTranslation && value !== "original"}
        onchange={() => choices.chooseLanguage(value)}
      />
    {/each}
  </div>
  <span class="label">{t("preview.captionBackdrop")}</span>
  <div
    role="radiogroup"
    class="join w-full"
    aria-label={t("preview.captionBackdrop")}
  >
    {#each CAPTION_BACKDROPS as { value, label } (value)}
      <input
        type="radio"
        name="preview-backdrop"
        {value}
        class="join-item btn flex-1 btn-sm"
        aria-label={t(label)}
        checked={choices.backdrop === value}
        onchange={() => choices.chooseBackdrop(value)}
      />
    {/each}
  </div>
  <span class="label">{t("preview.dummyVideo")}</span>
  <div
    role="radiogroup"
    class="join w-full"
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
  <label class="label justify-between">
    <span>{t("preview.captionSpeaker")}</span>
    <input
      type="checkbox"
      class="toggle toggle-sm"
      checked={choices.isSpeakerShown}
      onchange={(event) => choices.toggleSpeaker(event.currentTarget.checked)}
    />
  </label>
</div>

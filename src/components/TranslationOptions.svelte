<p class="flex flex-wrap items-center gap-2">
  <span data-i18n="work.into"></span>
  <select
    class="select select-sm w-auto"
    data-translation-options-target="language"
    data-action="translation-options#reportOverwrite translation-options#offerCleanup"
  >
    <option value="en" selected>English</option>
    <option value="ja">日本語</option>
    <option value="zh-TW">繁體中文</option>
  </select>
</p>
<p class="flex items-center gap-2">
  <span data-i18n="translate.glossary"></span>
  <span data-translation-options-target="glossary"></span>
</p>
<p class="flex flex-wrap items-center gap-4">
  <label class="flex items-center gap-2">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      data-translation-options-target="selfReview"
    />
    <span data-i18n="translate.selfReview"></span>
  </label>
</p>
<label
  class="flex items-center gap-2"
  data-translation-options-target="summaryChoice"
>
  <input
    type="checkbox"
    class="checkbox checkbox-sm"
    data-translation-options-target="summary"
  />
  <span data-i18n="translate.rollingSummary"></span>
  <input
    type="number"
    min="1"
    step="1"
    value="100"
    required
    class="input input-sm validator w-20"
    data-translation-options-target="summaryWords"
  />
  <span data-i18n="translate.words"></span>
</label>
<label
  class="flex items-center gap-2"
  data-translation-options-target="cleanupChoice"
>
  <input
    type="checkbox"
    class="checkbox checkbox-sm"
    data-translation-options-target="simplifiedCleaned"
  />
  <span data-i18n="cleanup.action"></span>
</label>

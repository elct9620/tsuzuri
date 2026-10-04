<div
  class="@container flex flex-col gap-3 border-b border-base-300 p-3"
  data-preview-target="panel"
  hidden
>
  <div
    class="flex gap-3 data-has-picture:h-[min(30vh,calc((100cqw_-_var(--spacing)*3)*0.4*var(--picture-ratio)))] data-has-picture:min-h-40"
    data-preview-target="screenRow"
  >
    <div
      class="group relative min-w-0 flex-2 overflow-hidden rounded-box bg-black data-is-away:rounded-none data-[dummy-video=white]:bg-white"
      data-preview-target="screen"
    >
      <video
        class="size-full object-contain"
        preload="metadata"
        data-preview-target="media"
        data-timeline-target="media"
      ></video>
      <p
        class="pointer-events-none absolute inset-x-2 bottom-2 text-center text-sm text-white [text-shadow:0_1px_2px_black] group-data-is-away:bottom-[4vh] group-data-is-away:text-[4vh]"
      >
        <span
          class="rounded-sm px-1 py-0.5 whitespace-pre-line box-decoration-clone empty:hidden data-[backdrop=opaque]:bg-black data-[backdrop=translucent]:bg-black/60"
          data-preview-target="caption"
        ></span>
      </p>
      <div
        role="alert"
        class="alert alert-warning absolute inset-2 text-sm"
        data-preview-target="hint"
        hidden
      >
        <i data-lucide="triangle-alert" class="size-4"></i>
        <span data-i18n="preview.unplayable"></span>
      </div>
    </div>
    <div class="card card-sm card-border min-w-0 flex-3">
      <div class="card-body">
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="btn btn-circle"
            data-action="preview#togglePlayback"
            data-i18n-label="preview.play"
          >
            <span class="swap" data-preview-target="playbackIcon">
              <i data-lucide="pause" class="swap-on size-5"></i>
              <i data-lucide="play" class="swap-off size-5"></i>
            </span>
          </button>
          <button
            type="button"
            class="btn btn-square btn-sm"
            data-transcript-target="followButton"
            data-action="transcript#toggleFollowing"
            data-i18n-label="preview.following"
            data-i18n-tooltip="preview.followingHint"
            data-shortcut="following"
          >
            <i data-lucide="locate-fixed" class="size-4"></i>
          </button>
          <button
            type="button"
            class="btn btn-square btn-sm"
            data-timeline-target="aloneButton"
            data-action="timeline#togglePlayingAlone"
            data-i18n-label="preview.playingAlone"
            data-i18n-tooltip="preview.playingAloneHint"
          >
            <i data-lucide="arrow-right-to-line" class="size-4"></i>
          </button>
          <button
            type="button"
            class="btn btn-square btn-sm"
            aria-pressed="false"
            data-preview-target="videoWindowButton"
            data-action="preview#toggleVideoWindow"
            data-i18n-label="preview.videoWindow"
            data-i18n-tooltip="preview.videoWindowHint"
          >
            <i data-lucide="picture-in-picture-2" class="size-4"></i>
          </button>
          <span
            class="text-lg font-medium whitespace-nowrap tabular-nums"
            data-preview-target="time"
          ></span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-square btn-sm"
              aria-pressed="false"
              data-preview-target="muteButton"
              data-action="preview#toggleMute"
              data-i18n-label="preview.mute"
              data-i18n-tooltip="preview.muteHint"
            >
              <span class="swap" data-preview-target="muteIcon">
                <i data-lucide="volume-x" class="swap-on size-4"></i>
                <i data-lucide="volume-2" class="swap-off size-4"></i>
              </span>
            </button>
            <input
              type="range"
              min="0"
              max="100"
              class="range range-sm w-24"
              data-preview-target="volume"
              data-action="input->preview#setVolume"
              data-i18n-label="preview.volume"
            />
            <span
              class="w-10 text-right text-sm tabular-nums"
              data-preview-target="volumeLevel"
            ></span>
          </div>
          <div
            class="ml-auto flex items-center gap-2"
            data-preview-target="captionChoice"
          >
            <div
              role="radiogroup"
              class="join"
              data-i18n-label="preview.captionLanguage"
            >
              <input
                type="radio"
                name="preview-caption"
                value="original"
                class="join-item btn btn-xs"
                data-preview-target="captionLanguage"
                data-action="preview#chooseCaptionLanguage"
                data-i18n-label="preview.captionOriginal"
              />
              <input
                type="radio"
                name="preview-caption"
                value="translation"
                class="join-item btn btn-xs"
                data-preview-target="captionLanguage"
                data-action="preview#chooseCaptionLanguage"
                data-i18n-label="preview.captionTranslation"
              />
              <input
                type="radio"
                name="preview-caption"
                value="bilingual"
                class="join-item btn btn-xs"
                data-preview-target="captionLanguage"
                data-action="preview#chooseCaptionLanguage"
                data-i18n-label="preview.captionBilingual"
              />
            </div>
            <div class="dropdown dropdown-end">
              <div
                tabindex="0"
                role="button"
                class="btn btn-square btn-xs"
                data-i18n-label="preview.captionOptions"
                data-i18n-tooltip="preview.captionOptions"
              >
                <i data-lucide="captions" class="size-4"></i>
              </div>
              <div
                tabindex="-1"
                class="dropdown-content z-20 mt-1 w-32 bg-base-100 shadow-md"
              >
                <!-- The join sits inside, as its display would keep a closed menu over the buttons beside it -->
                <div
                  role="radiogroup"
                  class="join join-vertical w-full"
                  data-i18n-label="preview.captionBackdrop"
                >
                  <input
                    type="radio"
                    name="preview-backdrop"
                    value="none"
                    class="join-item btn btn-sm"
                    data-preview-target="captionBackdrop"
                    data-action="preview#chooseCaptionBackdrop"
                    data-i18n-label="preview.captionBackdropNone"
                  />
                  <input
                    type="radio"
                    name="preview-backdrop"
                    value="translucent"
                    class="join-item btn btn-sm"
                    data-preview-target="captionBackdrop"
                    data-action="preview#chooseCaptionBackdrop"
                    data-i18n-label="preview.captionBackdropTranslucent"
                  />
                  <input
                    type="radio"
                    name="preview-backdrop"
                    value="opaque"
                    class="join-item btn btn-sm"
                    data-preview-target="captionBackdrop"
                    data-action="preview#chooseCaptionBackdrop"
                    data-i18n-label="preview.captionBackdropOpaque"
                  />
                </div>
                <p class="px-3 pt-2 text-sm" data-i18n="preview.dummyVideo"></p>
                <div
                  role="radiogroup"
                  class="join w-full pt-1"
                  data-i18n-label="preview.dummyVideo"
                >
                  <input
                    type="radio"
                    name="preview-dummy-video"
                    value="black"
                    class="join-item btn flex-1 btn-sm"
                    data-preview-target="dummyVideoColour"
                    data-action="preview#chooseDummyVideoColour"
                    data-i18n-label="preview.dummyVideoBlack"
                  />
                  <input
                    type="radio"
                    name="preview-dummy-video"
                    value="white"
                    class="join-item btn flex-1 btn-sm"
                    data-preview-target="dummyVideoColour"
                    data-action="preview#chooseDummyVideoColour"
                    data-i18n-label="preview.dummyVideoWhite"
                  />
                </div>
                <label
                  class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span data-i18n="preview.captionSpeaker"></span>
                  <input
                    type="checkbox"
                    class="toggle toggle-sm"
                    data-preview-target="captionSpeaker"
                    data-action="preview#toggleCaptionSpeaker"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="contents" data-preview-target="currentSection">
          <div class="divider my-0"></div>
          <p
            class="text-sm text-base-content/60"
            data-preview-target="currentHint"
            data-i18n="preview.pickSegment"
          ></p>
          <div
            class="flex min-h-0 flex-col gap-1"
            data-preview-target="currentCard"
            hidden
          >
            <h3 class="card-title text-sm">
              <span data-i18n="preview.current"></span>
              <span class="badge badge-sm" data-preview-target="currentNumber"
              ></span>
              <span
                class="text-xs font-normal tabular-nums text-base-content/60"
                data-preview-target="currentTimes"
              ></span>
              <span
                class="badge badge-sm badge-neutral max-w-32 truncate"
                data-preview-target="currentSpeaker"
                hidden
              ></span>
            </h3>
            <p
              class="line-clamp-3 text-lg whitespace-pre-line"
              data-preview-target="currentText"
            ></p>
            <p
              class="line-clamp-2 whitespace-pre-line text-[color-mix(in_oklab,var(--color-info)_60%,var(--color-base-content))]"
              data-preview-target="currentTranslation"
            ></p>
            <p class="text-xs text-base-content/60">
              <kbd class="kbd kbd-xs" data-i18n="shortcuts.keys.space"></kbd>
              <span data-i18n="preview.playOn" data-timeline-target="spaceHint"
              ></span>
            </p>
            <p class="text-xs text-base-content/60">
              <kbd class="kbd kbd-xs" data-timeline-target="startKey"></kbd>
              <kbd class="kbd kbd-xs" data-timeline-target="endKey"></kbd>
              <span data-i18n="preview.setTimes"></span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    class="relative h-28 rounded-box border border-base-300 px-2 pt-2 pb-6"
    data-preview-target="timeline"
  >
    <div class="absolute top-1 right-1 z-10 flex items-center gap-1">
      <span
        class="badge badge-neutral badge-sm tabular-nums"
        data-timeline-target="times"
        hidden
      ></span>
      <button
        type="button"
        class="btn btn-square btn-xs"
        data-timeline-target="snapButton"
        data-action="timeline#toggleSnapping"
        data-i18n-label="preview.snapping"
        data-i18n-tooltip="preview.snappingHint"
      >
        <i data-lucide="magnet" class="size-3.5"></i>
      </button>
      <div class="join">
        <button
          type="button"
          class="btn btn-square btn-xs join-item"
          data-action="timeline#zoomOut"
          data-i18n-label="preview.zoomOut"
          data-i18n-tooltip="preview.zoomHint"
          data-shortcut="zoom"
        >
          <i data-lucide="zoom-out" class="size-3.5"></i>
        </button>
        <button
          type="button"
          class="btn btn-xs join-item tabular-nums"
          data-timeline-target="zoomLevel"
          data-action="timeline#resetZoom"
          data-i18n-tooltip="preview.resetZoom"
        ></button>
        <button
          type="button"
          class="btn btn-square btn-xs join-item"
          data-action="timeline#zoomIn"
          data-i18n-label="preview.zoomIn"
          data-i18n-tooltip="preview.zoomHint"
          data-shortcut="zoom"
        >
          <i data-lucide="zoom-in" class="size-3.5"></i>
        </button>
      </div>
    </div>
    <div
      class="h-full [--segment-even:color-mix(in_oklab,var(--color-base-content)_6%,transparent)] [--segment-odd:color-mix(in_oklab,var(--color-base-content)_12%,transparent)] [--segment-current:color-mix(in_oklab,var(--color-primary)_25%,transparent)] [--segment-range:color-mix(in_oklab,var(--color-secondary)_25%,transparent)]"
      data-timeline-target="waveform"
      tabindex="0"
      data-action="wheel->timeline#scrollOrZoom:prevent pointerdown->timeline#drawOver:capture click->timeline#ignoreClickOver:capture keydown.left->timeline#stepBack:prevent keydown.right->timeline#stepForward:prevent"
    ></div>
  </div>
</div>

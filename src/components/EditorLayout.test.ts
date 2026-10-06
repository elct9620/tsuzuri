// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { clearMocks, mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assemble } from "#/assembly.ts";
import { setInterfaceLanguage } from "#/i18n.ts";
import { mockPageMount } from "#/testing/page.ts";
import { pageContext } from "#/state/context.ts";
import { CaptionChoices } from "#/state/caption-choices.svelte.ts";
import { Playback } from "#/state/playback.svelte.ts";
import { PreviewFold } from "#/state/preview-fold.svelte.ts";
import { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
import { ViewChoices } from "#/state/view-choices.svelte.ts";
import EditorLayout from "#/components/EditorLayout.svelte";

describe("EditorLayout", () => {
  let playback: Playback;

  const grid = () => document.querySelector<HTMLElement>("[data-layout]")!;

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    mockPageMount();
    mockConvertFileSrc("macos");
    const assembly = assemble();
    playback = new Playback();
    render(EditorLayout, {
      props: {
        project: null,
        layout: "v3",
        playback,
        fold: new PreviewFold(),
        captionChoices: new CaptionChoices(),
        viewChoices: new ViewChoices(),
        placeholders: new ResourcePlaceholders(),
      },
      context: pageContext(assembly.feed, assembly.session),
    });
  });

  afterEach(() => {
    cleanup();
    clearMocks();
  });

  it("stands the player in a side column in Layout V3", () => {
    expect(grid().hasAttribute("data-has-side-column")).toBe(true);
  });

  // @behavior LY-016
  it("lays out no side column while the video is in the Video Window", () => {
    playback.isVideoAway = true;
    flushSync();

    expect(grid().hasAttribute("data-has-side-column")).toBe(false);
  });
});

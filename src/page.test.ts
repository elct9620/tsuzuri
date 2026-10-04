// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { setInterfaceLanguage, t } from "./i18n";
import { drawPage } from "./page";

describe("drawPage", () => {
  // Each part is found by what its controller or module reads, so a Svelte Component left out of
  // the page leaves nothing for them to read.
  it.each([
    ["start screen", '[data-project-target="startScreen"]'],
    ["toolbar", '[data-controller="transcribe"]'],
    ["editor bar", '[data-controller="versions"]'],
    ["preview", '[data-preview-target="panel"]'],
    [
      "transcribe dialog's translation options",
      '#transcribe-options [data-translation-options-target="language"]',
    ],
    [
      "translate dialog's translation options",
      '#translate-options [data-translation-options-target="language"]',
    ],
    ["Segment list", '[data-transcript-target="list"]'],
    ["resource list", '[data-controller="glossary"]'],
    ["settings dialog", '[data-dialog-target="dialog"]'],
    ["Project settings", '[data-project-settings-target="nameField"]'],
    [
      "Project's transcription settings",
      '[data-project-settings-target="transcriptionSetting"]',
    ],
    ["Project's Models", "#project-models"],
    ["version and updates", '[data-controller="about"]'],
    ["Components", '[data-controller="components"]'],
    ["translation settings", '[data-controller="translation-settings"]'],
    ["transcription settings", '[data-controller="transcription-settings"]'],
    ["general Models", "#general-models"],
    ["repository dialog", "#repository-dialog"],
    ["logs", '[data-controller="logs"]'],
    ["about", '[data-controller="licenses"]'],
    ["preferences", '[data-controller="preferences"]'],
    ["shortcuts dialog", '[data-shortcuts-target="dialog"]'],
    ["updates dialog", '[data-updates-target="dialog"]'],
    ["notification stack", "[data-notifications]"],
    ["tooltip bubble", '[data-tooltip-target="bubble"]'],
  ])("writes the %s", (_part, selector) => {
    const page = document.createElement("div");

    drawPage(page);

    expect(page.querySelector(selector)).not.toBeNull();
  });

  it.each(["#transcribe-options", "#translate-options"])(
    "writes the translation options in %s in the interface language",
    async (options) => {
      const page = document.createElement("div");
      await setInterfaceLanguage("zh-TW");

      drawPage(page);

      expect(
        page.querySelector(`${options} [data-i18n="work.into"]`)!.textContent,
      ).toBe(t("work.into"));
    },
  );
});

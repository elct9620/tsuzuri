// @vitest-environment happy-dom
import { within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setInterfaceLanguage, t } from "./i18n";
import { drawPage } from "./page";
import { mockPageMount } from "./test_page";

describe("drawPage", () => {
  beforeEach(() => {
    mockPageMount();
  });

  afterEach(() => {
    clearMocks();
  });

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
    ["general Models", "#general-models"],
    ["repository dialog", "#repository-dialog"],
    ["shortcuts dialog", '[data-shortcuts-target="dialog"]'],
    ["updates dialog", '[data-updates-target="dialog"]'],
    ["notification stack", "[data-notifications]"],
    ["tooltip bubble", '[data-tooltip-target="bubble"]'],
  ])("writes the %s", (_part, selector) => {
    const page = document.createElement("div");

    drawPage(page);

    expect(page.querySelector(selector)).not.toBeNull();
  });

  // A general setting whose Svelte Component reads for itself is found by the name of its group
  // under the general tab, since the Project tab names some groups the same.
  it.each([
    ["version and updates", "settings.versionAndUpdates"],
    ["about", "settings.about"],
    ["transcription settings", "settings.transcription"],
    ["translation settings", "settings.translation"],
    ["Components", "settings.components"],
    ["logs", "settings.logs"],
  ])("writes the %s in the general settings", async (_part, name) => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawPage(page);

    const generalTab = within(page).getByRole("radio", {
      hidden: true,
      name: t("settings.general"),
    }).nextElementSibling as HTMLElement;
    expect(
      within(generalTab).queryByRole("group", { hidden: true, name: t(name) }),
    ).not.toBeNull();
  });

  it("writes the Choice Landings in the preferences tab", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawPage(page);

    const preferencesTab = within(page).getByRole("radio", {
      hidden: true,
      name: t("settings.preferences"),
    }).nextElementSibling as HTMLElement;
    expect(
      within(preferencesTab).queryByRole("group", {
        hidden: true,
        name: t("preferences.choosing"),
      }),
    ).not.toBeNull();
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

  it.each([
    [
      "#project-models",
      [
        ["transcription", "true", "projectModel", undefined],
        ["translation", "true", "projectModel", undefined],
      ],
    ],
    [
      "#general-models",
      [
        ["transcription", undefined, undefined, "status"],
        ["vad", undefined, undefined, "status"],
        ["translation", undefined, undefined, "status"],
        ["diarization", undefined, undefined, "status"],
      ],
    ],
  ])(
    "writes the Model Slots of %s for the controller that reads them",
    (list, expected) => {
      const page = document.createElement("div");

      drawPage(page);

      const slots = [
        ...page.querySelectorAll<HTMLElement>(
          `${list} [data-controller="model-slot"]`,
        ),
      ].map((slot) => {
        const status = slot.querySelector<HTMLElement>(
          '[data-model-slot-target="status"]',
        )!;
        return [
          slot.dataset.modelSlotSlotValue,
          slot.dataset.modelSlotIsProjectSlotValue,
          status.dataset.projectSettingsTarget,
          status.dataset.modelsTarget,
        ];
      });
      expect(slots).toEqual(expected);
    },
  );
});

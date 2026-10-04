// @vitest-environment happy-dom
import { within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectFeed } from "./backend/project";
import { setInterfaceLanguage, t } from "./i18n";
import { drawPage } from "./page";
import { mockPageMount } from "./test_page";
import { projectOf, resourceOf } from "./test_project";

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
    ["toolbar", '[data-project-target="name"]'],
    ["editor bar", '[data-controller="versions"]'],
    ["preview", '[data-preview-target="panel"]'],
    ["Segment list", '[data-transcript-target="list"]'],
    ["resource list", '[data-project-target="resources"]'],
    ["glossary entry", '[data-project-target="glossary"]'],
    ["settings dialog", '[data-dialog-target="dialog"]'],
    ["shortcuts dialog", '[data-shortcuts-target="dialog"]'],
    ["updates dialog", '[data-updates-target="dialog"]'],
    ["notification stack", "[data-notifications]"],
    ["tooltip bubble", '[data-tooltip-target="bubble"]'],
  ])("writes the %s", (_part, selector) => {
    const page = document.createElement("div");

    drawPage(new ProjectFeed(), page);

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
    ["Models", "settings.models"],
  ])("writes the %s in the general settings", async (_part, name) => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawPage(new ProjectFeed(), page);

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

    drawPage(new ProjectFeed(), page);

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

  // A task's toolbar button and dialog are found by the name the button carries.
  it.each([
    ["transcribe", "toolbar.transcribe"],
    ["translate", "toolbar.translate"],
    ["diarize", "toolbar.diarize"],
  ])("writes the %s button in the toolbar", async (_part, name) => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawPage(new ProjectFeed(), page);

    expect(
      within(page).queryByRole("button", { hidden: true, name: t(name) }),
    ).not.toBeNull();
  });

  it("writes the translation options in the translate dialog", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawPage(new ProjectFeed(), page);

    expect(
      within(page).queryByRole("combobox", {
        hidden: true,
        name: t("work.into"),
      }),
    ).not.toBeNull();
  });

  it("writes the progress a task started from the toolbar reports to", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");
    mockIPC((command) => {
      if (command === "app_build")
        return { release_name: "v0.2.0", commit: "7649ca4" };
      if (command === "current_project")
        return projectOf({ resources: [resourceOf({ has_media: true })] });
      if (command === "model_settings") return null;
      if (command === "diarize") return new Promise(() => {});
      return Promise.reject({ code: "io", detail: "not asked here" });
    });
    const feed = new ProjectFeed();
    await feed.refresh();
    drawPage(feed, page);
    await tick();

    within(page)
      .getByRole("button", { hidden: true, name: t("toolbar.diarize") })
      .click();
    await tick();
    within(page)
      .getByRole("button", { hidden: true, name: t("diarize.start") })
      .click();
    await tick();

    expect(
      within(page).queryByRole("button", {
        hidden: true,
        name: t("work.preparing"),
      }),
    ).not.toBeNull();
  });

  it.each([
    ["Project", "settings.project"],
    ["transcription settings", "settings.transcription"],
    ["Models", "settings.models"],
  ])(
    "writes the Project's %s in its tab while a Project is open",
    async (_part, name) => {
      const page = document.createElement("div");
      await setInterfaceLanguage("zh-TW");
      mockPageMount(projectOf());
      const feed = new ProjectFeed();
      await feed.refresh();

      drawPage(feed, page);
      await tick();

      const projectTab = within(page).getByRole("radio", {
        hidden: true,
        name: t("settings.project"),
      }).nextElementSibling as HTMLElement;
      expect(
        within(projectTab).queryByRole("group", {
          hidden: true,
          name: t(name),
        }),
      ).not.toBeNull();
    },
  );

  it("writes the Repository dialog the Model Slots open", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawPage(new ProjectFeed(), page);

    expect(
      within(page).queryByRole("button", {
        hidden: true,
        name: t("repository.list"),
      }),
    ).not.toBeNull();
  });
});

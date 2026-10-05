// @vitest-environment happy-dom
import { within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
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
    ["shortcuts dialog", '[data-shortcuts-target="dialog"]'],
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

  // A task's toolbar button is found by the name it carries, and its dialog by its heading.
  it.each([
    ["transcribe", "toolbar.transcribe", "toolbar.transcribe"],
    ["translate", "toolbar.translate", "toolbar.translate"],
    ["diarize", "toolbar.diarize", "diarize.title"],
  ])("opens the %s dialog from the toolbar", async (_part, name, heading) => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");
    mockPageMount(projectOf({ resources: [resourceOf({ has_media: true })] }), {
      model_settings: () => null,
    });
    const feed = new ProjectFeed();
    await feed.refresh();
    drawPage(feed, page);
    await tick();

    within(page)
      .getByRole("button", { hidden: true, name: t(name) })
      .click();

    const dialogs = [...page.querySelectorAll("dialog")].filter(
      (dialog) =>
        dialog.querySelector("h3")?.textContent?.trim() === t(heading),
    );
    expect(dialogs.map((dialog) => dialog.open)).toEqual([true]);
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
    mockPageMount(projectOf({ resources: [resourceOf({ has_media: true })] }), {
      model_settings: () => null,
      diarize: () => new Promise(() => {}),
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

  it("writes the window an App Update installs behind", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawPage(new ProjectFeed(), page);

    expect(
      within(page).queryByText(t("settings.updateRestartHint")),
    ).not.toBeNull();
  });

  it.each([
    ["start screen", '[data-project-target="startScreen"]'],
    ["toolbar", "header"],
  ])("opens the settings from the %s", async (_place, selector) => {
    const page = document.createElement("div");
    document.body.append(page);
    await setInterfaceLanguage("zh-TW");
    drawPage(new ProjectFeed(), page);
    await tick();

    within(page.querySelector<HTMLElement>(selector)!)
      .getAllByRole("button", { hidden: true, name: t("toolbar.settings") })[0]
      .click();

    const settingsHeading = within(page).getByRole("heading", {
      hidden: true,
      name: t("toolbar.settings"),
    });
    expect(settingsHeading.closest("dialog")?.open).toBe(true);
    page.remove();
  });

  it("opens the glossary dialog from the resource list", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");
    mockPageMount(null, {
      translation_glossary_table: () => ({
        languages: ["zh-TW"],
        rows: [],
        has_source_target_header: false,
      }),
    });
    drawPage(new ProjectFeed(), page);
    await tick();

    page
      .querySelector<HTMLElement>('[data-project-target="glossary"]')!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      within(page)
        .getByRole("heading", { hidden: true, name: t("translate.glossary") })
        .closest("dialog")!.open,
    ).toBe(true);
  });
});

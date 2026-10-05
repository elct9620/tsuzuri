// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { screen, within } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks } from "@tauri-apps/api/mocks";
import { tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "./assembly";
import { editingPort } from "./backend/editing";
import { ProjectFeed, type ProjectView } from "./backend/project";
import { EditingSession } from "./editor";
import { setInterfaceLanguage, t } from "./i18n";
import { drawPage } from "./page";
import { mockPageMount } from "./test-page";
import { projectOf, resourceOf } from "./test-project";
import {
  notificationDetail,
  notifications,
} from "./components/test-notifications";
import { notificationStack } from "./ui/notification.svelte";

describe("drawPage", () => {
  /** The pages each test draws, taken away after it so their Svelte Components stop following. */
  const drawnPages: Record<string, unknown>[] = [];

  /** Draws the page into `target` as `drawPage` does, to be taken away after the test. */
  function drawTestPage(...args: Parameters<typeof drawPage>): void {
    drawnPages.push(drawPage(...args));
  }

  beforeEach(() => {
    mockPageMount();
  });

  afterEach(() => {
    drawnPages.splice(0).forEach((page) => unmount(page));
    clearMocks();
  });

  // Each part is found by what its controller, module or Svelte Component reads, so a Svelte
  // Component left out of the page leaves nothing for them to read.
  it.each([
    ["editor bar", '[data-controller="versions"]'],
    ["preview", '[data-preview-target="panel"]'],
    ["Segment list", '[data-transcript-target="list"]'],
    ["notification stack", "[data-notifications]"],
    ["tooltip bubble", ".tooltip[popover]"],
  ])("writes the %s", (_part, selector) => {
    const page = document.createElement("div");

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

    expect(page.querySelector(selector)).not.toBeNull();
  });

  // A converted part is found by its accessible name, which only its Svelte Component writes.
  it.each([
    ["start screen", "region", "Tsuzuri"],
    ["toolbar", "textbox", "toolbar.projectName"],
  ])("writes the %s", async (_part, role, name) => {
    // In the document, so a name given by `aria-labelledby` finds the element it names.
    const page = document.createElement("div");
    document.body.append(page);
    await setInterfaceLanguage("zh-TW");

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

    expect(
      within(page).queryByRole(role, { hidden: true, name: t(name) }),
    ).not.toBeNull();
    page.remove();
  });

  it("writes the resource list", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

    expect(
      within(page).queryByRole("list", {
        hidden: true,
        name: t("resources.title"),
      }),
    ).not.toBeNull();
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

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

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

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

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
    drawTestPage(feed, new EditingSession(editingPort), page);
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

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

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
    drawTestPage(feed, new EditingSession(editingPort), page);
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

      drawTestPage(feed, new EditingSession(editingPort), page);
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

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

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

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

    expect(
      within(page).queryByText(t("settings.updateRestartHint")),
    ).not.toBeNull();
  });

  it.each([
    ["start screen", "section"],
    ["toolbar", "header"],
  ])("opens the settings from the %s", async (_place, selector) => {
    const page = document.createElement("div");
    document.body.append(page);
    await setInterfaceLanguage("zh-TW");
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
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
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    within(page)
      .getByRole("button", {
        hidden: true,
        name: t("resources.createGlossary"),
      })
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      within(page)
        .getByRole("heading", { hidden: true, name: t("translate.glossary") })
        .closest("dialog")!.open,
    ).toBe(true);
  });

  it("sends an undo by its keys to the Project", async () => {
    let undoCount = 0;
    mockPageMount(null, { undo: () => (undoCount += 1) });
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort));
    await tick();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(undoCount).toBe(1);
  });

  it("opens the shortcut list from the toolbar", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    within(page.querySelector<HTMLElement>("header")!)
      .getByRole("button", { hidden: true, name: t("shortcuts.title") })
      .click();

    expect(
      within(page)
        .getByRole("heading", { hidden: true, name: t("shortcuts.title") })
        .closest("dialog")!.open,
    ).toBe(true);
  });

  it("opens the replace dialog from the editor bar", async () => {
    const page = document.createElement("div");
    await setInterfaceLanguage("zh-TW");
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    within(page)
      .getByRole("button", { hidden: true, name: t("replace.open") })
      .click();

    expect(
      within(page)
        .getByRole("heading", { hidden: true, name: t("replace.title") })
        .closest("dialog")!.open,
    ).toBe(true);
  });
});

describe("Page", () => {
  let project: ProjectView | null;
  let requestedSrt: string | null;
  let sentSrt: unknown;
  let page: Record<string, unknown>;
  let stop: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /**
   * Starts the page as `main.ts` does, relaying Rust events and reading the Project, and clears the
   * Notifications its Svelte Components show for the reads this test leaves unanswered.
   */
  async function start(): Promise<void> {
    const assembly = assemble(new Application(), {});
    page = drawPage(assembly.feed, assembly.session);
    stop = await assembly.start();
    await settle();
    notificationStack.clear();
  }

  /** Holds `next` as the Project, clearing the Notifications of the reads it leaves unanswered. */
  async function hold(next: ProjectView | null): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
    notificationStack.clear();
  }

  beforeEach(() => {
    project = null;
    requestedSrt = null;
    sentSrt = undefined;
    mockPageMount(null, {
      current_project: () => project,
      recent_projects: () => [],
      take_requested_srt: () => {
        const takenSrt = requestedSrt;
        requestedSrt = null;
        return takenSrt;
      },
      open_srt: (args) => (sentSrt = args),
    });
  });

  afterEach(() => {
    stop();
    unmount(page);
    clearMocks();
  });

  // @behavior PJ-036
  it("shows only the start screen without a Project", async () => {
    await start();

    expect([
      screen.queryByRole("region", { name: "Tsuzuri" }) !== null,
      document.querySelector<HTMLElement>(".drawer")!.hidden,
    ]).toEqual([true, true]);
  });

  it("puts the start screen away once a Project is open", async () => {
    await start();

    await hold(projectOf());

    expect([
      screen.queryByRole("region", { name: "Tsuzuri" }),
      document.querySelector<HTMLElement>(".drawer")!.hidden,
    ]).toEqual([null, false]);
  });

  // @behavior PJ-171
  it("opens the Requested SRT as the page starts", async () => {
    requestedSrt = "/talks/ep02.srt";

    await start();

    expect(sentSrt).toEqual({ path: "/talks/ep02.srt", language: "zh-TW" });
  });

  // @behavior PJ-172
  it("opens an SRT file requested while the page runs", async () => {
    await start();
    await hold(projectOf({ directory: "/videos/lecture" }));
    requestedSrt = "/talks/ep02.srt";

    await emit("srt-requested");
    await settle();

    expect(sentSrt).toEqual({ path: "/talks/ep02.srt", language: "zh-TW" });
  });

  // @behavior PJ-134
  it("tells the user a version changed elsewhere was kept", async () => {
    await start();
    await hold(projectOf());

    await emit("changed-elsewhere-kept");
    await settle();

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["字幕已在其他程式修改過並重新讀取"],
      "Tsuzuri 原本的內容已留作備份，可在「版本」比較或還原",
    ]);
  });
});

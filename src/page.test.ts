// @vitest-environment happy-dom
import { screen, within } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks } from "@tauri-apps/api/mocks";
import { tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "#/assembly.ts";
import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { t } from "#/i18n.ts";
import { drawPage } from "#/page.ts";
import { checkedBarButton } from "#/testing/segment-rows.ts";
import { mockPageMount } from "#/testing/page.ts";
import { projectOf, resourceOf } from "#/testing/project.ts";
import { notificationDetail, notifications } from "#/testing/notifications.ts";
import { notificationStack } from "#/state/notification.svelte.ts";
import { settle } from "#/testing/settle.ts";
import { shownSectionTitles } from "#/testing/settings-page.ts";

describe("drawPage", () => {
  /** The pages each test draws, taken away after it so their Svelte Components stop following. */
  const drawnPages: Record<string, unknown>[] = [];
  /** The pages put in the document, taken out after each test. */
  const pagesInDocument: HTMLElement[] = [];

  /** Draws the page into `target` as `drawPage` does, to be taken away after the test. */
  function drawTestPage(...args: Parameters<typeof drawPage>): void {
    drawnPages.push(drawPage(...args));
  }

  /** Draws the page with a Project open in the editor, in the document so keys reach it. */
  async function drawEditorPage(): Promise<HTMLElement> {
    const page = document.createElement("div");
    document.body.append(page);
    pagesInDocument.push(page);
    mockPageMount(projectOf());
    const feed = new ProjectFeed();
    await feed.refresh();
    drawTestPage(feed, new EditingSession(editingPort), page);
    await tick();
    return page;
  }

  /** The settings, shown or hidden; hidden, they carry no accessible name to be found by. */
  function settingsRegion(page: HTMLElement): HTMLElement {
    return page.querySelector<HTMLElement>(
      `[role="region"][aria-label="${t("toolbar.settings")}"]`,
    )!;
  }

  /** The editor with its toolbar, the drawer the Resource list slides out of. */
  function editor(page: HTMLElement): HTMLElement {
    return page.querySelector<HTMLElement>(".drawer")!;
  }

  /** Opens the settings by the button in the part `selector` finds: the start screen or the toolbar. */
  async function openSettings(
    page: HTMLElement,
    selector: string,
  ): Promise<void> {
    within(page.querySelector<HTMLElement>(selector)!)
      .getAllByRole("button", { hidden: true, name: t("toolbar.settings") })[0]
      .click();
    await tick();
  }

  /** Opens the settings, then chooses the first section titled `section` from the section list. */
  async function openSettingsAt(
    page: HTMLElement,
    selector: string,
    section: string,
  ): Promise<void> {
    await openSettings(page, selector);
    within(
      within(settingsRegion(page)).getByRole("navigation", { hidden: true }),
    )
      .getAllByRole("button", { hidden: true, name: section })[0]
      .click();
    await tick();
  }

  async function goBack(page: HTMLElement): Promise<void> {
    within(settingsRegion(page))
      .getByRole("button", { hidden: true, name: t("settings.back") })
      .click();
    await tick();
  }

  async function pressEscape(): Promise<void> {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await tick();
  }

  beforeEach(() => {
    mockPageMount();
  });

  afterEach(() => {
    drawnPages.splice(0).forEach((page) => unmount(page));
    pagesInDocument.splice(0).forEach((page) => page.remove());
    clearMocks();
  });

  // Each part is found by what its module or Svelte Component reads, so a Svelte Component left
  // out of the page leaves nothing for them to read.
  it.each([
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
    ["export menu", "button", "toolbar.export"],
    ["resource bar's translation choice", "combobox", "edit.translation"],
    ["Segment list", "list", "edit.segments"],
    ["Preview", "button", "preview.play"],
    ["timeline", "button", "preview.zoomIn"],
  ])("writes the %s", async (_part, role, name) => {
    // In the document, so a name given by `aria-labelledby` finds the element it names.
    const page = document.createElement("div");
    document.body.append(page);

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

    expect(
      within(page).queryByRole(role, { hidden: true, name: t(name) }),
    ).not.toBeNull();
    page.remove();
  });

  it("writes the resource list", async () => {
    const page = document.createElement("div");

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

    expect(
      within(page).queryByRole("list", {
        hidden: true,
        name: t("resources.title"),
      }),
    ).not.toBeNull();
  });

  // A general setting whose Svelte Component reads for itself is found by the title of its
  // section once that section is chosen, since the Project's sections share some titles.
  it.each([
    [
      "version and updates",
      "settings.versionAndUpdates",
      "settings.versionAndUpdates",
    ],
    ["about", "settings.about", "settings.about"],
    [
      "transcription settings",
      "settings.transcription",
      "settings.transcription",
    ],
    ["translation settings", "settings.translation", "settings.translation"],
    ["Components", "settings.components", "settings.components"],
    ["logs", "settings.logs", "settings.logs"],
    ["Models", "settings.models", "settings.models"],
    ["Choice Landings", "settings.choosing", "preferences.choosing"],
  ])("writes the %s in the settings", async (_part, section, title) => {
    const page = document.createElement("div");
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    await openSettingsAt(page, "section", t(section));

    expect(shownSectionTitles(settingsRegion(page))).toEqual([t(title)]);
  });

  // A task's entry in the resource bar is found by the name it carries, and its dialog by its heading.
  it.each([
    ["transcribe", "toolbar.transcribeSpeech", "toolbar.transcribe"],
    ["translate", "toolbar.translate", "toolbar.translate"],
    ["diarize", "toolbar.diarize", "diarize.title"],
  ])(
    "opens the %s dialog from the resource bar",
    async (_part, name, heading) => {
      const page = document.createElement("div");
      mockPageMount(
        projectOf({ resources: [resourceOf({ has_media: true })] }),
        {
          model_settings: () => null,
        },
      );
      const feed = new ProjectFeed();
      await feed.refresh();
      drawTestPage(feed, new EditingSession(editingPort), page);
      await tick();

      within(editor(page))
        .getByRole("button", { hidden: true, name: t(name) })
        .click();

      const dialogs = [...page.querySelectorAll("dialog")].filter(
        (dialog) =>
          dialog.querySelector("h3")?.textContent?.trim() === t(heading),
      );
      expect(dialogs.map((dialog) => dialog.open)).toEqual([true]);
    },
  );

  it("writes the translation options in the translate dialog", async () => {
    const page = document.createElement("div");

    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);

    expect(
      within(page).queryByRole("combobox", {
        hidden: true,
        name: t("work.into"),
      }),
    ).not.toBeNull();
  });

  it("writes the progress a task started from the resource bar reports to", async () => {
    const page = document.createElement("div");
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
    "writes the Project's %s in its section while a Project is open",
    async (_part, name) => {
      const page = document.createElement("div");
      mockPageMount(projectOf());
      const feed = new ProjectFeed();
      await feed.refresh();
      drawTestPage(feed, new EditingSession(editingPort), page);
      await tick();

      // The Project's sections come first, ahead of the general ones of the same title.
      await openSettingsAt(page, "header", t(name));

      expect(shownSectionTitles(settingsRegion(page))).toEqual([t(name)]);
    },
  );

  it("writes the Repository dialog the Model Slots open", async () => {
    const page = document.createElement("div");

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
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    await openSettings(page, selector);

    expect(settingsRegion(page).hidden).toBe(false);
  });

  // @behavior IF-057
  it("shows the settings over the whole window, hiding the editor", async () => {
    const page = await drawEditorPage();

    await openSettings(page, "header");

    expect([settingsRegion(page).hidden, editor(page).hidden]).toEqual([
      false,
      true,
    ]);
  });

  // @behavior IF-058
  it("goes back to the editor by the settings' back button", async () => {
    const page = await drawEditorPage();
    await openSettings(page, "header");

    await goBack(page);

    expect([settingsRegion(page).hidden, editor(page).hidden]).toEqual([
      true,
      false,
    ]);
  });

  // @behavior IF-059
  it("goes back to the editor by Esc", async () => {
    const page = await drawEditorPage();
    await openSettings(page, "header");

    await pressEscape();

    expect([settingsRegion(page).hidden, editor(page).hidden]).toEqual([
      true,
      false,
    ]);
  });

  // @behavior IF-060
  it("leaves Esc to the License Notice open over the settings", async () => {
    const page = await drawEditorPage();
    await openSettingsAt(page, "header", t("settings.about"));
    within(settingsRegion(page))
      .getByRole("button", { hidden: true, name: t("settings.fullLicenses") })
      .click();
    await tick();

    await pressEscape();

    expect(settingsRegion(page).hidden).toBe(false);
  });

  // @behavior IF-065
  it("takes focus into the settings and back to the toolbar's button", async () => {
    const page = await drawEditorPage();
    const settingsButton = within(
      page.querySelector<HTMLElement>("header")!,
    ).getAllByRole("button", { name: t("toolbar.settings") })[0];
    settingsButton.focus();
    await openSettings(page, "header");
    const focusShown = document.activeElement;

    await goBack(page);

    expect([focusShown, document.activeElement]).toEqual([
      within(settingsRegion(page)).getByRole("button", {
        hidden: true,
        name: t("settings.back"),
      }),
      settingsButton,
    ]);
  });

  // @behavior IF-061
  it("goes back to the start screen the settings were opened from", async () => {
    // In the document, so the start screen's name given by `aria-labelledby` is found.
    const page = document.createElement("div");
    document.body.append(page);
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();
    await openSettings(page, "section");

    await goBack(page);

    expect(
      within(page).queryByRole("region", { hidden: true, name: "Tsuzuri" }),
    ).not.toBeNull();
    page.remove();
  });

  // @behavior IF-062
  it("pauses the media as the settings open", async () => {
    const page = await drawEditorPage();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");

    await openSettings(page, "header");

    expect(pause).toHaveBeenCalled();
    pause.mockRestore();
  });

  // @behavior IF-063
  it("keeps the editor it hid while the settings showed", async () => {
    const page = await drawEditorPage();
    const editorLeft = editor(page);
    await openSettings(page, "header");

    await goBack(page);

    expect(editor(page)).toBe(editorLeft);
  });

  it("opens the glossary dialog from the resource list", async () => {
    const page = document.createElement("div");
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

  it("stands Placeholders in for the Segments of a Resource the list selects", async () => {
    const page = document.createElement("div");
    mockPageMount(
      projectOf({
        resources: [resourceOf(), resourceOf({ name: "ep02" })],
        segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
      }),
      {
        // Rust has not answered yet, so the Segments of ep02 are still being read
        select_resource: () => new Promise(() => {}),
        take_requested_srt: () => null,
      },
    );
    const assembly = assemble();
    drawTestPage(assembly.feed, assembly.session, page);
    const stop = await assembly.start();
    await tick();

    within(page).getByRole("button", { hidden: true, name: /ep02/ }).click();
    await tick();

    expect([
      page.querySelectorAll("[data-placeholder]").length > 0,
      page.querySelectorAll(".field").length,
    ]).toEqual([true, 0]);
    stop();
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

  it("opens the replace dialog from the edit tools", async () => {
    const page = document.createElement("div");
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

  it("opens the search bar from the edit tools", async () => {
    const page = document.createElement("div");
    document.body.append(page);
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    within(page)
      .getByRole("button", { hidden: true, name: t("search.open") })
      .click();

    expect(document.activeElement).toBe(
      within(page).getByRole("searchbox", {
        hidden: true,
        name: t("search.pattern"),
      }),
    );
    page.remove();
  });

  it("opens the Speaker dialog from the edit tools", async () => {
    const page = document.createElement("div");
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    within(page)
      .getByRole("button", { hidden: true, name: t("edit.speakers") })
      .click();

    expect(
      within(page)
        .getByRole("heading", { hidden: true, name: t("edit.speakersTitle") })
        .closest("dialog")!.open,
    ).toBe(true);
  });

  it("opens the Versions dialog from the edit tools", async () => {
    mockPageMount(null, { subtitle_versions: () => [] });
    const page = document.createElement("div");
    drawTestPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    within(page)
      .getByRole("button", { hidden: true, name: t("versions.open") })
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      within(page)
        .getByRole("heading", { hidden: true, name: t("versions.title") })
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
  /** The arguments of each `compare_versions` the page asked for. */
  let comparedVersions: unknown[];

  /**
   * Starts the page as `main.ts` does, relaying Rust events and reading the Project, and clears
   * the Notifications its Svelte Components show for the reads this test leaves unanswered.
   */
  async function start(): Promise<void> {
    const assembly = assemble();
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
    comparedVersions = [];
    mockPageMount(null, {
      current_project: () => project,
      recent_projects: () => [],
      take_requested_srt: () => {
        const takenSrt = requestedSrt;
        requestedSrt = null;
        return takenSrt;
      },
      open_srt: (args) => (sentSrt = args),
      // The transcribe dialog names the model it will use as it opens
      model_settings: () => null,
      subtitle_versions: () => [
        {
          language: null,
          backups: [
            {
              file: "ep01.20260925T030000Z.srt",
              taken_at: "20260925T030000Z",
              kind: "overwrite",
            },
          ],
        },
        { language: "en", backups: [] },
      ],
      compare_versions: (args) => {
        comparedVersions.push(args);
        return [];
      },
    });
  });

  afterEach(() => {
    stop();
    unmount(page);
    clearMocks();
  });

  it("hands the open Project to each part beside the Segments that shows it", async () => {
    await start();
    await hold(
      projectOf({
        // Diarizing is offered only for a Resource with media
        resources: [resourceOf({ has_media: true })],
        segments: [
          {
            start_ms: 0,
            end_ms: 1000,
            text: "大家好",
            speaker: "小明",
            translation: "Hello",
          },
        ],
      }),
    );
    /** The value each dialog writes beside `label`. */
    const valuesBeside = (label: string) =>
      [...document.querySelectorAll("dialog p")]
        .filter((line) => line.firstElementChild?.textContent === label)
        .map((line) => line.lastElementChild?.textContent);
    const isExportOffered = !screen.getByRole<HTMLButtonElement>("button", {
      hidden: true,
      name: t("toolbar.originalText"),
    }).disabled;
    const renamedSpeakers = [
      ...screen.getByRole<HTMLSelectElement>("combobox", {
        hidden: true,
        name: t("edit.speakersRenamed"),
      }).options,
    ].map((option) => option.value);
    screen
      .getByRole("button", { hidden: true, name: t("toolbar.diarize") })
      .click();
    await settle();

    expect({
      resourceName: screen.getByRole("heading", { level: 2 }).textContent,
      isExportOffered,
      transcribedLanguage: valuesBeside(t("transcribe.language")),
      translatedLanguage: valuesBeside(t("translate.source")),
      renamedSpeakers,
      isOverwriteWarned: screen.queryByText(t("diarize.overwrite")) !== null,
    }).toEqual({
      resourceName: "ep01",
      isExportOffered: true,
      transcribedLanguage: [t("languages.zh-TW")],
      translatedLanguage: [t("languages.zh-TW")],
      renamedSpeakers: ["小明"],
      isOverwriteWarned: true,
    });
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

  // @behavior ED-010
  it("shows Placeholder rows while the Resource selected in the list is read", async () => {
    await start();
    await hold(
      projectOf({
        resources: [resourceOf(), resourceOf({ name: "ep02" })],
        segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
      }),
    );

    within(
      screen.getByRole("list", { hidden: true, name: t("resources.title") }),
    )
      .getByRole("button", { hidden: true, name: /ep02/ })
      .click();
    await tick();

    expect(
      screen
        .getByRole("list", { hidden: true, name: t("edit.segments") })
        .querySelectorAll("[data-placeholder]").length,
    ).toBeGreaterThan(0);
  });

  // @behavior PV-081
  it("stops following playback from the View menu", async () => {
    await start();

    const toggle = screen.getByRole<HTMLInputElement>("checkbox", {
      hidden: true,
      name: t("preview.following"),
    });
    toggle.click();
    await tick();

    expect(toggle.checked).toBe(false);
  });

  it.each([
    ["edit.shift", "edit.shiftTitle"],
    ["edit.speakersOfChecked", "edit.speakersTitle"],
    ["edit.retranslate", "translate.again"],
    ["edit.retranscribe", "transcribe.again"],
  ])("opens the dialog of the checked bar's %s", async (button, heading) => {
    await start();
    await hold(
      projectOf({
        resources: [
          resourceOf({ has_media: true, translation_languages: ["en"] }),
        ],
        shown_translation: "en",
        segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
      }),
    );
    const check = document.querySelector<HTMLInputElement>("input.check")!;
    check.checked = true;
    check.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    checkedBarButton(t(button))!.click();
    await settle();

    expect(
      screen
        .getByRole("heading", { hidden: true, name: t(heading) })
        .closest("dialog")!.open,
    ).toBe(true);
  });

  // @behavior VR-059
  it("opens the Versions dialog at the translation its compare group chooses in", async () => {
    await start();
    await hold(
      projectOf({
        resources: [resourceOf({ translation_languages: ["en"] })],
        shown_translation: "en",
      }),
    );

    const [, translationChoice] = screen.getAllByRole("button", {
      hidden: true,
      name: t("compare.chooseInVersions"),
    });
    translationChoice.click();
    await settle();

    const subtitle = screen.getByRole<HTMLSelectElement>("combobox", {
      hidden: true,
      name: t("versions.subtitle"),
    });
    expect([subtitle.closest("dialog")!.open, subtitle.value]).toEqual([
      true,
      "en",
    ]);
  });

  // @behavior VR-043
  it("compares the editor with the Backup set as the comparison in the Versions dialog", async () => {
    await start();
    await hold(projectOf());
    screen
      .getAllByRole("button", {
        hidden: true,
        name: t("compare.chooseInVersions"),
      })[0]
      .click();
    await settle();

    screen
      .getByRole("button", { hidden: true, name: t("versions.setComparison") })
      .click();
    await settle();

    expect(comparedVersions.pop()).toEqual({
      language: null,
      left: "ep01.20260925T030000Z.srt",
      right: null,
    });
  });
});

// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { mockPageMount } from "#/testing/page.ts";
import { projectOf } from "#/testing/project.ts";
import { showNotifications } from "#/testing/notifications.ts";
import { shownSectionTitles } from "#/testing/settings-page.ts";
import { pageContext } from "#/state/context.ts";
import SettingsPage from "#/components/settings/SettingsPage.svelte";

describe("SettingsPage", () => {
  let rerender: (props: { project: ProjectView | null }) => Promise<void>;

  /** Chooses the section named `name` from the section list. */
  async function choose(name: string): Promise<void> {
    within(screen.getByRole("navigation", { hidden: true }))
      .getByRole("button", { hidden: true, name })
      .click();
    await tick();
  }

  /** Shows the settings while `project` is open, or none. */
  function showSettings(project: ProjectView | null): void {
    showNotifications();
    mockPageMount(project);
    ({ rerender } = render(SettingsPage, {
      context: pageContext(new ProjectFeed(), new EditingSession(editingPort)),
      props: {
        project,
        isShown: true,
        goBack: () => {},
        pick: async () => null,
        openLicenses: () => {},
      },
    }));
  }

  afterEach(() => {
    clearMocks();
  });

  // @behavior PJ-048
  it("offers only the general settings without a Project", () => {
    showSettings(null);

    expect([
      screen.queryByRole("group", { hidden: true, name: "專案" }),
      shownSectionTitles(document),
    ]).toEqual([null, ["版本與更新"]]);
  });

  // @behavior PJ-049
  it("opens the settings at the Project's own once a Project is open", async () => {
    showSettings(null);

    await rerender({ project: projectOf() });

    expect(shownSectionTitles(document)).toEqual(["專案"]);
  });

  // @behavior PJ-194
  it("keeps the general settings shown as the Project changes", async () => {
    showSettings(projectOf());
    await choose("版本與更新");

    await rerender({ project: projectOf({ name: "改名" }) });

    expect(shownSectionTitles(document)).toEqual(["版本與更新"]);
  });

  // @behavior IF-064
  it("shows only the section chosen from the section list", async () => {
    showSettings(null);

    await choose("元件");

    expect(shownSectionTitles(document)).toEqual(["元件"]);
  });
});

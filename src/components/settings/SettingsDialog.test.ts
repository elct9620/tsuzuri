// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { mockPageMount } from "#/testing/page.ts";
import { projectOf } from "#/testing/project.ts";
import { showNotifications } from "#/testing/notifications.ts";
import { pageContext } from "#/state/context.ts";
import { LayoutChoice } from "#/state/layout-choice.svelte.ts";
import SettingsDialog from "#/components/settings/SettingsDialog.svelte";

describe("SettingsDialog", () => {
  let feed: ProjectFeed;

  const tab = (name: string) =>
    screen.queryByRole<HTMLInputElement>("radio", { hidden: true, name });

  /** Opens the settings while `project` is open, or none. */
  async function openSettings(project: ProjectView | null): Promise<void> {
    showNotifications();
    mockPageMount(project);
    feed = new ProjectFeed();
    await feed.refresh();
    render(SettingsDialog, {
      context: pageContext(feed, new EditingSession(editingPort)),
      props: {
        pick: async () => null,
        openLicenses: () => {},
        layoutChoice: new LayoutChoice(),
      },
    });
  }

  async function open(project: ProjectView | null): Promise<void> {
    mockPageMount(project);
    await feed.refresh();
  }

  afterEach(() => {
    clearMocks();
  });

  // @behavior PJ-048
  it("offers only the general settings without a Project", async () => {
    await openSettings(null);

    expect([
      tab("專案"),
      screen.queryByRole("group", { hidden: true, name: "專案" }),
      tab("整體")?.checked,
    ]).toEqual([null, null, true]);
  });

  // @behavior PJ-049
  it("opens the settings at the Project's own once a Project is open", async () => {
    await openSettings(null);

    await open(projectOf());

    expect(tab("專案")?.checked).toBe(true);
  });
});

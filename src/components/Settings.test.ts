// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectFeed, type ProjectView } from "../backend/project";
import { mockPageMount } from "../test_page";
import { projectOf } from "../test_project";
import { NOTIFICATION_STACK } from "../ui/test_notification";
import { pageContext } from "./context";
import Settings from "./Settings.svelte";

describe("Settings", () => {
  let feed: ProjectFeed;

  /** The tab named `name`, found by its label since a hidden tab has no accessible name. */
  const tab = (name: string) =>
    document.querySelector<HTMLInputElement>(
      `[role="tablist"] > input[aria-label="${name}"]`,
    )!;

  /** Opens the settings while `project` is open, or none. */
  async function openSettings(project: ProjectView | null): Promise<void> {
    document.body.innerHTML = NOTIFICATION_STACK;
    mockPageMount(project);
    feed = new ProjectFeed();
    await feed.refresh();
    render(Settings, { context: pageContext(feed) });
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
      tab("專案").hidden,
      screen.queryByRole("group", { hidden: true, name: "專案" }),
      tab("整體").checked,
    ]).toEqual([true, null, true]);
  });

  // @behavior PJ-049
  it("opens the settings at the Project's own once a Project is open", async () => {
    await openSettings(null);

    await open(projectOf());

    expect(tab("專案").checked).toBe(true);
  });
});

// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { mockPageMount } from "#/testing/page.ts";
import { projectOf } from "#/testing/project.ts";
import { showNotifications } from "#/testing/notifications.ts";
import { pageContext } from "#/state/context.ts";
import SettingsDialog from "#/components/settings/SettingsDialog.svelte";

describe("SettingsDialog", () => {
  let rerender: (props: { project: ProjectView | null }) => Promise<void>;

  const tab = (name: string) =>
    screen.queryByRole<HTMLInputElement>("radio", { hidden: true, name });

  /** Opens the settings while `project` is open, or none. */
  function openSettings(project: ProjectView | null): void {
    showNotifications();
    mockPageMount(project);
    ({ rerender } = render(SettingsDialog, {
      context: pageContext(new ProjectFeed(), new EditingSession(editingPort)),
      props: { project, pick: async () => null, openLicenses: () => {} },
    }));
  }

  afterEach(() => {
    clearMocks();
  });

  // @behavior PJ-048
  it("offers only the general settings without a Project", () => {
    openSettings(null);

    expect([
      tab("專案"),
      screen.queryByRole("group", { hidden: true, name: "專案" }),
      tab("整體")?.checked,
    ]).toEqual([null, null, true]);
  });

  // @behavior PJ-049
  it("opens the settings at the Project's own once a Project is open", async () => {
    openSettings(null);

    await rerender({ project: projectOf() });

    expect(tab("專案")?.checked).toBe(true);
  });

  // @behavior PJ-194
  it("keeps the general settings shown as the Project changes", async () => {
    openSettings(projectOf());
    tab("整體")!.click();
    await tick();

    await rerender({ project: projectOf({ name: "改名" }) });

    expect(tab("整體")?.checked).toBe(true);
  });
});

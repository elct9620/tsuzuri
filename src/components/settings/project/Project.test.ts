// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../../../backend/project";
import { projectOf } from "../../../test-project";
import {
  notificationDetail,
  notifications,
  showNotifications,
} from "../../test-notifications";
import Project from "./Project.svelte";

describe("Project", () => {
  let calls: { command: string; args: unknown }[];
  let optionsFailure: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;
  /** The field or switch on the row labelled `label`. */
  const field = <T extends HTMLElement>(label: string) =>
    screen.getByText(label).closest("li")!.querySelector<T>("input, select")!;

  function openSettings(project: ProjectView = projectOf()): void {
    render(Project, { project });
  }

  async function change(field: HTMLElement): Promise<void> {
    field.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  async function turnOn(label: string): Promise<void> {
    const toggle = field<HTMLInputElement>(label);
    toggle.checked = true;
    await change(toggle);
  }

  beforeEach(() => {
    calls = [];
    optionsFailure = undefined;
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command === "set_project_options" && optionsFailure !== undefined)
        return Promise.reject(optionsFailure);
    });
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior PJ-037
  it("sets the Primary Language chosen in the settings", async () => {
    openSettings();
    const language = field<HTMLSelectElement>("主語言");

    language.value = "ja";
    await change(language);

    expect(sent("set_primary_language")).toEqual({ language: "ja" });
  });

  // @behavior PJ-047
  it("sets the Bilingual Order chosen in the settings", async () => {
    openSettings();
    const order = field<HTMLSelectElement>("雙語順序");

    order.value = "translation-first";
    await change(order);

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        bilingual_order: "translation-first",
      },
    });
  });

  // @behavior PJ-190
  it("says why the Project's settings were not saved", async () => {
    showNotifications();
    optionsFailure = { code: "io", detail: "denied" };
    openSettings();
    const order = field<HTMLSelectElement>("雙語順序");

    order.value = "translation-first";
    await change(order);

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["設定沒有儲存"],
      expect.stringContaining("denied"),
    ]);
  });

  // @behavior PJ-176
  it("sets the Project Name typed in the settings", async () => {
    openSettings();
    const nameField = field<HTMLInputElement>("名稱");

    nameField.value = "週會錄影";
    await change(nameField);

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, name: "週會錄影" },
    });
  });

  // @behavior PJ-186
  it("hints the directory's name the Project takes once its name is emptied", () => {
    const namedProject = projectOf({ name: "週會錄影" });
    namedProject.options.name = "週會錄影";

    openSettings(namedProject);

    expect(field<HTMLInputElement>("名稱").placeholder).toBe("talks");
  });

  // @behavior PJ-055
  it("sets the Project to save Bilingual SRTs when turned on in the settings", async () => {
    openSettings();

    await turnOn("自動儲存雙語");

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, is_bilingual_autosaved: true },
    });
  });

  // @behavior PJ-070
  it("sets the Project to keep Backups when turned on in the settings", async () => {
    openSettings();

    await turnOn("覆蓋前備份");

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, is_overwrite_backed_up: true },
    });
  });

  // @behavior DZ-021
  it("sets the Project to diarize after transcribing when turned on in the settings", async () => {
    openSettings();

    await turnOn("轉錄後辨識");

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        is_diarized_after_transcription: true,
      },
    });
  });
});

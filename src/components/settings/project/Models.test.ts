// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "#/ipc/project.ts";
import type { PresetModel } from "#/ipc/toolchain.ts";
import { projectOf } from "#/testing/project.ts";
import Models from "#/components/settings/project/Models.svelte";

const QWEN_PRESET: PresetModel = {
  slot: "translation",
  name: "Qwen3-4B-Instruct-2507",
  quantization: "Q4_K_M",
  source: {
    kind: "repository",
    repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
    file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    commit: "a06e946bb6b655725eafa393f4a9745d460374c9",
  },
  size: 2_497_281_120,
};
const KOTOBA = { kind: "file", path: "/models/kotoba.bin" } as const;

/** A Project whose transcription slot has its own Model. */
function projectWithKotoba(): ProjectView {
  const project = projectOf();
  project.options.models.transcription = KOTOBA;
  return project;
}

describe("Models", () => {
  let calls: { command: string; args: unknown }[];
  let chosenFile: string;
  let isModelSettingsReadable: boolean;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;
  const menu = (slot: string) =>
    screen.getByRole<HTMLSelectElement>("combobox", { name: slot });
  const row = (slot: string) => menu(slot).closest("li")!;

  async function openSettings(project: ProjectView): Promise<void> {
    render(Models, { project, pick: async () => null });
    await settle();
    await settle();
  }

  async function pick(slot: string, value: string): Promise<void> {
    menu(slot).value = value;
    menu(slot).dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  async function chooseFile(slot: string): Promise<void> {
    within(row(slot)).getByRole("button", { name: "指定檔案" }).click();
    await settle();
    await settle();
  }

  beforeEach(() => {
    calls = [];
    chosenFile = "/models/gemma-ja.gguf";
    isModelSettingsReadable = true;
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command === "plugin:dialog|open") return chosenFile;
      if (command === "preset_models")
        return (args as { slot: string }).slot === "translation"
          ? [QWEN_PRESET]
          : [];
      if (command === "download_model") return QWEN_PRESET.source;
      if (command === "model_settings")
        return isModelSettingsReadable
          ? {
              transcription: { extensions: ["bin"] },
              translation: { extensions: ["gguf"] },
            }
          : Promise.reject({ code: "io", detail: "denied" });
    });
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior MD-008
  it("sets the file picked for the translation slot as the Project Model", async () => {
    await openSettings(projectOf());

    await chooseFile("翻譯");

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        models: {
          transcription: null,
          translation: { kind: "file", path: "/models/gemma-ja.gguf" },
        },
      },
    });
  });

  // @behavior MD-052
  it("offers no file for a Project Model while the Model settings cannot be read", async () => {
    await openSettings(projectOf());
    isModelSettingsReadable = false;

    await chooseFile("翻譯");

    expect([sent("plugin:dialog|open"), sent("set_project_options")]).toEqual([
      undefined,
      undefined,
    ]);
  });

  // @behavior MD-009
  it("says a slot without a Project Model follows the general settings", async () => {
    await openSettings(projectOf());

    expect([
      row("轉錄").querySelector(":scope > span.list-col-wrap")!.textContent,
      menu("轉錄").value,
    ]).toEqual(["依整體設定", "general"]);
  });

  // @behavior MD-010
  it("sets the Project Options without the Project Model once the slot follows the general settings", async () => {
    await openSettings(projectWithKotoba());

    await pick("轉錄", "general");

    expect(sent("set_project_options")).toEqual({
      options: projectOf().options,
    });
  });

  // @behavior MD-046
  it("shows the Project Model in a slot drawn after the Project", async () => {
    await openSettings(projectWithKotoba());

    expect(menu("轉錄").value).toBe("own");
  });

  // @behavior MD-047
  it("keeps the other slot's Project Model when a file is picked for one", async () => {
    await openSettings(projectWithKotoba());

    await chooseFile("翻譯");

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        models: {
          transcription: KOTOBA,
          translation: { kind: "file", path: "/models/gemma-ja.gguf" },
        },
      },
    });
  });

  // @behavior MD-040
  it("sets a downloaded Preset Model as the Project Model", async () => {
    await openSettings(projectOf());

    await pick("翻譯", "0");

    expect([sent("download_model"), sent("set_project_options")]).toEqual([
      {
        repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
        file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        revision: "a06e946bb6b655725eafa393f4a9745d460374c9",
      },
      {
        options: {
          ...projectOf().options,
          models: { transcription: null, translation: QWEN_PRESET.source },
        },
      },
    ]);
  });
});

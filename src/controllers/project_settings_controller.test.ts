// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import type { PresetModel } from "../backend/toolchain";
import { projectOf } from "../test_project";
import ModelSlotController from "./model_slot_controller";
import ProjectSettingsController from "./project_settings_controller";

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

describe("ProjectSettingsController", () => {
  let application: Application;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let chosenFile: string;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-project-settings-target="${name}"]`)!;

  function sent(command: string): unknown {
    return calls.find((call) => call.command === command)?.args;
  }

  async function hold(next: ProjectView | null): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  async function pick(selector: string, value: string): Promise<void> {
    const menu = document.querySelector<HTMLSelectElement>(selector)!;
    menu.value = value;
    menu.dispatchEvent(new Event("change"));
    await settle();
  }

  async function click(selector: string): Promise<void> {
    document.querySelector<HTMLElement>(selector)!.click();
    await settle();
  }

  beforeEach(async () => {
    project = null;
    calls = [];
    chosenFile = "/models/whisper.bin";
    document.body.innerHTML = `
      <div
        data-controller="project-settings"
        data-project-settings-model-slot-outlet="[data-controller='model-slot']"
      >
        <input type="radio" name="tabs" id="project-tab" data-project-settings-target="projectTab settings" checked />
        <input type="radio" name="tabs" id="general-tab" data-project-settings-target="generalTab" />
        <fieldset data-project-settings-target="settings">
          <select data-project-settings-target="language" data-action="change->project-settings#setLanguage">
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
          <input data-project-settings-target="nameField" data-action="change->project-settings#setOptions" />
          <select data-project-settings-target="bilingualOrder" data-action="change->project-settings#setOptions">
            <option value="original-first">原文在上</option>
            <option value="translation-first">譯文在上</option>
          </select>
          <input type="checkbox" data-project-settings-target="bilingualAutosave" data-action="change->project-settings#setOptions" />
          <input type="checkbox" data-project-settings-target="overwriteBackup" data-action="change->project-settings#setOptions" />
          <select data-project-settings-target="transcriptionSetting" data-setting="has_vad" data-action="change->project-settings#setOptions">
            <option value="">依整體設定</option>
            <option value="on">開啟</option>
            <option value="off">關閉</option>
          </select>
          <div data-action="model-slot:choose->project-settings#chooseSource">
            <div data-controller="model-slot" data-model-slot-slot-value="transcription" data-model-slot-is-project-slot-value="true">
              <select id="transcription-menu" data-model-slot-target="menu" data-action="model-slot#chooseFromMenu"></select>
              <span data-model-slot-target="status" data-project-settings-target="projectModel" data-slot="transcription"></span>
              <div data-model-slot-target="download" hidden>
                <progress data-model-slot-target="downloadBar"></progress>
                <span data-model-slot-target="downloadLabel"></span>
              </div>
            </div>
            <div data-controller="model-slot" data-model-slot-slot-value="translation" data-model-slot-is-project-slot-value="true">
              <select id="translation-menu" data-model-slot-target="menu" data-action="model-slot#chooseFromMenu"></select>
              <span data-model-slot-target="status" data-project-settings-target="projectModel" data-slot="translation"></span>
              <button id="choose-translation-model" data-slot="translation" data-action="project-settings#chooseModel">指定檔案</button>
              <div data-model-slot-target="download" hidden>
                <progress data-model-slot-target="downloadBar"></progress>
                <span data-model-slot-target="downloadLabel"></span>
              </div>
            </div>
          </div>
        </fieldset>
      </div>
    `;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "plugin:dialog|open") return chosenFile;
        if (command === "preset_models") return [QWEN_PRESET];
        if (command === "download_model") return QWEN_PRESET.source;
        if (command === "model_settings")
          return {
            transcription: { extensions: ["bin"] },
            vad: { extensions: ["bin"] },
            translation: { extensions: ["gguf"] },
          };
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    await assemble(application, {
      "project-settings": ProjectSettingsController,
      "model-slot": ModelSlotController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior PJ-037
  it("sets the Primary Language chosen in the settings", async () => {
    await hold(projectOf());
    const language = target<HTMLSelectElement>("language");

    language.value = "ja";
    language.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_primary_language")).toEqual({ language: "ja" });
  });

  // @behavior PJ-047
  it("sets the Bilingual Order chosen in the settings", async () => {
    await hold(projectOf());
    const order = target<HTMLSelectElement>("bilingualOrder");

    order.value = "translation-first";
    order.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        bilingual_order: "translation-first",
      },
    });
  });

  // @behavior TX-040
  it("sets VAD on for the Project with the rest following the general settings", async () => {
    await hold(projectOf());
    const vad = target<HTMLSelectElement>("transcriptionSetting");

    vad.value = "on";
    vad.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        transcription: {
          has_vad: true,
          is_non_speech_suppressed: null,
          is_context_carried: null,
          is_simplified_cleaned: null,
        },
      },
    });
  });

  // @behavior MD-008
  it("sets the file picked for the translation slot as the Project Model", async () => {
    await hold(projectOf());
    chosenFile = "/models/gemma-ja.gguf";

    await click("#choose-translation-model");

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

  // @behavior MD-009
  it("says a slot without a Project Model follows the general settings", async () => {
    await hold(projectOf());

    expect([
      document.querySelector('[data-project-settings-target="projectModel"]')!
        .textContent,
      document.querySelector<HTMLSelectElement>("#transcription-menu")!.value,
    ]).toEqual(["依整體設定", "general"]);
  });

  // @behavior MD-010
  it("sets the Project Options without the Project Model once the slot follows the general settings", async () => {
    const withModel = projectOf();
    withModel.options.models.transcription = {
      kind: "file",
      path: "/models/kotoba.bin",
    };
    await hold(withModel);

    await pick("#transcription-menu", "general");

    expect(sent("set_project_options")).toEqual({
      options: projectOf().options,
    });
  });

  // @behavior MD-046
  it("shows the Project Model in a slot drawn after the Project", async () => {
    const withModel = projectOf();
    withModel.options.models.transcription = {
      kind: "file",
      path: "/models/kotoba.bin",
    };
    await hold(withModel);
    const row = document
      .querySelector("#transcription-menu")!
      .closest("[data-controller='model-slot']")!;

    row.replaceWith(row.cloneNode(true));
    await settle();

    expect(
      document.querySelector<HTMLSelectElement>("#transcription-menu")!.value,
    ).toBe("own");
  });

  // @behavior MD-047
  it("keeps the other slot's Project Model when a file is picked for one", async () => {
    const withModel = projectOf();
    const kotoba = { kind: "file", path: "/models/kotoba.bin" } as const;
    withModel.options.models.transcription = kotoba;
    await hold(withModel);
    chosenFile = "/models/gemma-ja.gguf";

    await click("#choose-translation-model");

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        models: {
          transcription: kotoba,
          translation: { kind: "file", path: "/models/gemma-ja.gguf" },
        },
      },
    });
  });

  // @behavior MD-040
  it("sets a downloaded Preset Model as the Project Model", async () => {
    await hold(projectOf());

    await pick("#translation-menu", "0");

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

  // @behavior PJ-048
  it("offers only the general settings without a Project", async () => {
    await hold(null);

    expect([
      document.querySelector<HTMLInputElement>("#project-tab")!.hidden,
      document.querySelector<HTMLElement>("fieldset")!.hidden,
      document.querySelector<HTMLInputElement>("#general-tab")!.checked,
    ]).toEqual([true, true, true]);
  });

  // @behavior PJ-049
  it("opens the settings at the Project's own once a Project is open", async () => {
    await hold(null);

    await hold(projectOf());

    expect(
      document.querySelector<HTMLInputElement>("#project-tab")!.checked,
    ).toBe(true);
  });

  // @behavior PJ-176
  it("sets the Project Name typed in the settings", async () => {
    await hold(projectOf());
    const nameField = target<HTMLInputElement>("nameField");

    nameField.value = "週會錄影";
    nameField.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, name: "週會錄影" },
    });
  });

  // @behavior PJ-186
  it("hints the directory's name the Project takes once its name is emptied", async () => {
    const named = projectOf({ name: "週會錄影" });
    named.options.name = "週會錄影";
    await hold(named);

    expect(target<HTMLInputElement>("nameField").placeholder).toBe("talks");
  });

  // @behavior PJ-055
  it("sets the Project to save Bilingual SRTs when turned on in the settings", async () => {
    await hold(projectOf());
    const autosave = target<HTMLInputElement>("bilingualAutosave");

    autosave.checked = true;
    autosave.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, is_bilingual_autosaved: true },
    });
  });

  // @behavior PJ-070
  it("sets the Project to keep Backups when turned on in the settings", async () => {
    await hold(projectOf());
    const backup = target<HTMLInputElement>("overwriteBackup");

    backup.checked = true;
    backup.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, is_overwrite_backed_up: true },
    });
  });
});

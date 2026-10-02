// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ModelSettingsView,
  ModelSource,
  PresetModel,
} from "../backend/toolchain";
import { NOTIFICATION_STACK } from "../ui/test_notification";
import ModelSlotController from "./model_slot_controller";
import ModelsController from "./models_controller";
import RepositoryController from "./repository_controller";

const BREEZE: ModelSource = {
  kind: "repository",
  repo: "tsuzuri-app/Breeze-ASR-25-ggml",
  file: "ggml-breeze-asr-25-q8_0.bin",
  commit: "cf41205287fb5483317ce2d1d973ba7cac8fa750",
};
const QWEN: ModelSource = {
  kind: "repository",
  repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
  file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
  commit: "a06e946bb6b655725eafa393f4a9745d460374c9",
};
const PRESETS: PresetModel[] = [
  {
    slot: "transcription",
    name: "Breeze-ASR-25",
    quantization: "q8_0",
    source: BREEZE,
    size: 1_656_129_691,
  },
  {
    slot: "transcription",
    name: "Breeze-ASR-25",
    quantization: "q5_0",
    source: { ...BREEZE, file: "ggml-breeze-asr-25-q5_0.bin" },
    size: 1_080_732_091,
  },
  {
    slot: "translation",
    name: "Qwen3-4B-Instruct-2507",
    quantization: "Q4_K_M",
    source: QWEN,
    size: 2_497_281_120,
  },
];
const OWN_QWEN: ModelSource = { kind: "file", path: "/models/qwen3-4b.gguf" };

/** The Model Settings Rust answers with `translation` in its slot, as the Preset Model at `presetIndex` or none. */
function viewWith(
  translation: ModelSource | null,
  presetIndex: number | null = null,
): ModelSettingsView {
  const slot = (source: ModelSource | null, preset_index: number | null) => ({
    source,
    path: source?.kind === "file" ? source.path : null,
    has_file: source !== null,
    extensions: ["gguf"],
    preset_index,
  });
  return {
    transcription: slot(null, null),
    vad: slot(null, null),
    translation: slot(translation, presetIndex),
    diarization: slot(null, null),
  };
}

describe("ModelSlotController", () => {
  let application: Application;
  let calls: { command: string; args: unknown }[];
  let handlers: Record<string, (args: unknown) => unknown>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const menuOf = (slot: string) =>
    document.querySelector<HTMLSelectElement>(`#${slot}-row select`)!;

  function sent(command: string): unknown {
    return calls.find((call) => call.command === command)?.args;
  }

  async function mountWith(
    translation: ModelSource | null,
    presetIndex: number | null = null,
  ): Promise<void> {
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command === "preset_models")
        return PRESETS.filter(
          (preset) => preset.slot === (args as { slot: string }).slot,
        );
      if (command === "model_settings")
        return viewWith(translation, presetIndex);
      return handlers[command]?.(args);
    });
    application = Application.start();
    application.register("models", ModelsController);
    application.register("model-slot", ModelSlotController);
    application.register("repository", RepositoryController);
    await settle();
    await settle();
  }

  async function pick(slot: string, value: string): Promise<void> {
    menuOf(slot).value = value;
    menuOf(slot).dispatchEvent(new Event("change"));
    await settle();
  }

  /** Starts downloading `QWEN` for the translation slot, leaving it unfinished. */
  async function startDownload(): Promise<void> {
    handlers.download_model = () => new Promise(() => {});
    await pick("translation", "0");
  }

  const row = (slot: string) => `
    <li id="${slot}-row"
      data-controller="model-slot"
      data-model-slot-slot-value="${slot}"
      data-model-slot-repository-outlet="#repository-dialog"
      data-action="rust:model-download-progress@window->model-slot#showProgress">
      <select data-model-slot-target="menu" data-action="model-slot#chooseFromMenu"></select>
      <button class="repository" data-action="model-slot#pickFromRepository"></button>
      <span data-model-slot-target="status" data-models-target="status" data-slot="${slot}"></span>
      <div data-model-slot-target="download" hidden>
        <progress max="100" data-model-slot-target="downloadBar"></progress>
        <span data-model-slot-target="downloadLabel"></span>
        <button class="cancel" data-action="model-slot#cancelDownload"></button>
      </div>
    </li>`;

  beforeEach(() => {
    calls = [];
    handlers = {};
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <ul id="general-models"
        data-controller="models"
        data-models-model-slot-outlet="#general-models [data-controller='model-slot']"
        data-action="model-slot:choose->models#chooseSource">
        ${row("transcription")}
        ${row("translation")}
      </ul>
      <dialog id="repository-dialog" data-controller="repository" data-repository-target="dialog" data-action="close->repository#settle">
        <h3 data-repository-target="title"></h3>
        <input data-repository-target="repo" />
        <button class="list" data-action="repository#list"></button>
        <div data-repository-target="files" data-action="change->repository#chooseFile" hidden></div>
        <div data-repository-target="hint" hidden></div>
        <button class="download" data-repository-target="downloadButton" data-action="repository#download"></button>
      </dialog>
    `;
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior MD-048
  it("groups the slot's Preset Models by name, in the order Rust answers them", async () => {
    await mountWith(null);

    const groups = [...menuOf("transcription").querySelectorAll("optgroup")];

    expect(
      groups.map((group) => [
        group.label,
        [...group.querySelectorAll("option")].map((option) => option.value),
      ]),
    ).toEqual([["Breeze-ASR-25", ["0", "1"]]]);
  });

  // @behavior MD-032
  it("downloads a Preset Model at its commit before choosing it", async () => {
    await mountWith(null);
    handlers.download_model = () => QWEN;
    handlers.choose_model = () => viewWith(QWEN, 0);

    await pick("translation", "0");

    expect([sent("download_model"), sent("choose_model")]).toEqual([
      {
        repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
        file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        revision: "a06e946bb6b655725eafa393f4a9745d460374c9",
      },
      { slot: "translation", source: QWEN },
    ]);
  });

  // @behavior MD-033
  it("shows how far a Model's download has come", async () => {
    await mountWith(null);
    await startDownload();

    window.dispatchEvent(
      new CustomEvent("rust:model-download-progress", {
        detail: {
          repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
          file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
          downloaded: 50,
          total: 100,
        },
      }),
    );

    const label = document.querySelector(
      '#translation-row [data-model-slot-target="downloadLabel"]',
    )!;
    expect(label.textContent).toBe("50%");
  });

  // @behavior MD-034
  it("cancels a download from its slot", async () => {
    await mountWith(null);
    await startDownload();

    document
      .querySelector<HTMLButtonElement>("#translation-row .cancel")!
      .click();
    await settle();

    expect(sent("cancel_model_download")).toEqual({
      repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
      file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    });
  });

  // @behavior MD-035
  it("keeps the slot's Model when its download fails", async () => {
    await mountWith(OWN_QWEN);
    handlers.download_model = () =>
      Promise.reject({ code: "model-download-failed", detail: "offline" });

    await pick("translation", "0");

    expect(menuOf("translation").value).toBe("own");
  });

  // @behavior MD-036
  it("names a Model no Preset Model is as the slot's own", async () => {
    await mountWith(OWN_QWEN);

    const menu = menuOf("translation");

    expect(menu.selectedOptions[0].textContent).toBe("自選：qwen3-4b.gguf");
  });

  // @behavior MD-036
  it("names the slot's Model on a row that appears after the settings were read", async () => {
    await mountWith(OWN_QWEN);
    const row = document.querySelector("#translation-row")!;

    row.replaceWith(row.cloneNode(true));
    await settle();
    await settle();

    expect(menuOf("translation").selectedOptions[0].textContent).toBe(
      "自選：qwen3-4b.gguf",
    );
  });

  // @behavior MD-050
  it("chooses the Preset Model Rust names the slot's Model as", async () => {
    await mountWith(QWEN, 0);

    expect(menuOf("translation").value).toBe("0");
  });

  // @behavior MD-038
  it("downloads the file picked from a Repository, then chooses it", async () => {
    await mountWith(null);
    handlers.repository_files = () => [
      { path: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf", size: 2_497_281_120 },
    ];
    handlers.download_model = () => QWEN;
    handlers.choose_model = () => viewWith(QWEN, 0);

    document
      .querySelector<HTMLButtonElement>("#translation-row .repository")!
      .click();
    document.querySelector<HTMLInputElement>(
      "[data-repository-target=repo]",
    )!.value = "unsloth/Qwen3-4B-Instruct-2507-GGUF";
    document
      .querySelector<HTMLButtonElement>("#repository-dialog .list")!
      .click();
    await settle();
    const radio = document.querySelector<HTMLInputElement>(
      '#repository-dialog input[type="radio"]',
    )!;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>("#repository-dialog .download")!
      .click();
    await settle();
    await settle();

    expect([sent("download_model"), sent("choose_model")]).toEqual([
      {
        repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
        file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        revision: null,
      },
      { slot: "translation", source: QWEN },
    ]);
  });
});

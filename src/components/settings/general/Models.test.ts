// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ModelSettingsView,
  ModelSlot,
  ModelSource,
  PresetModel,
} from "../../../backend/toolchain";
import { showNotifications, notifications } from "../../test-notifications";
import RepositoryDialog from "../RepositoryDialog.svelte";
import Models from "./Models.svelte";

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

/** The Model Settings Rust answers with `translation` in its slot, its file there unless `hasFile` says not. */
function viewWith(
  translation: ModelSource | null,
  { presetIndex = null, hasFile = true, path = null }: SlotView = {},
): ModelSettingsView {
  const slot = (
    source: ModelSource | null,
    view: Required<SlotView> = {
      presetIndex: null,
      hasFile: false,
      path: null,
    },
  ) => ({
    source,
    path:
      view.path ??
      (source === null ? null : source.kind === "file" ? source.path : "/hub"),
    has_file: source !== null && view.hasFile,
    extensions: ["gguf"],
    preset_index: view.presetIndex,
  });
  return {
    transcription: slot(null),
    vad: slot(null),
    translation: slot(translation, { presetIndex, hasFile, path }),
    diarization: slot(null),
  };
}

interface SlotView {
  presetIndex?: number | null;
  hasFile?: boolean;
  path?: string | null;
}

describe("Models", () => {
  let calls: { command: string; args: unknown }[];
  let settings: () => ModelSettingsView;
  let handlers: Record<string, (args: unknown) => unknown>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;
  const menu = (slot: string) =>
    screen.getByRole<HTMLSelectElement>("combobox", {
      hidden: true,
      name: slot,
    });
  const row = (slot: string) => menu(slot).closest("li")!;
  /** The line under a slot's row naming where its Model is. */
  const status = (slot: string) =>
    row(slot).querySelector(":scope > span.list-col-wrap")!.textContent;

  /** Opens the general settings, which read the Models and Preset Models as they are written. */
  async function openSettings(): Promise<void> {
    const dialog = render(RepositoryDialog).component;
    render(Models, { pick: (slot: ModelSlot) => dialog.pick(slot) });
    await settle();
    await settle();
  }

  async function pick(slot: string, value: string): Promise<void> {
    menu(slot).value = value;
    menu(slot).dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  async function click(slot: string, name: string): Promise<void> {
    within(row(slot)).getByRole("button", { hidden: true, name }).click();
    await settle();
    await settle();
  }

  /** Starts downloading `QWEN` for the translation slot, leaving it unfinished. */
  async function startDownload(): Promise<void> {
    handlers.download_model = () => new Promise(() => {});
    await pick("翻譯", "0");
  }

  beforeEach(() => {
    calls = [];
    handlers = {};
    settings = () => viewWith(null);
    showNotifications();
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command in handlers) return handlers[command](args);
      if (command === "preset_models")
        return PRESETS.filter(
          (preset) => preset.slot === (args as { slot: string }).slot,
        );
      if (command === "model_settings") return settings();
    });
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior MD-004
  it("shows the chosen model's path", async () => {
    settings = () => viewWith(OWN_QWEN);

    await openSettings();

    expect(status("翻譯")).toBe("/models/qwen3-4b.gguf");
  });

  // @behavior MD-005
  it("asks again for a model whose file is gone", async () => {
    settings = () => viewWith(OWN_QWEN, { hasFile: false });

    await openSettings();

    expect(status("翻譯")).toContain("請重新指定");
  });

  // @behavior MD-041
  it("asks to download again a Model the cache lost", async () => {
    settings = () =>
      viewWith(QWEN, { hasFile: false, path: "/hub/qwen3.gguf" });

    await openSettings();

    expect(status("翻譯")).toBe(
      "unsloth/Qwen3-4B-Instruct-2507-GGUF/Qwen3-4B-Instruct-2507-Q4_K_M.gguf 不在快取裡，請從選單重新下載",
    );
  });

  // @behavior MD-006
  it("remembers a model chosen in the panel and shows its path", async () => {
    await openSettings();
    handlers["plugin:dialog|open"] = () => "/models/qwen3-4b.gguf";
    handlers.choose_model = () => viewWith(OWN_QWEN);

    await click("翻譯", "指定檔案");

    expect([sent("choose_model"), status("翻譯")]).toEqual([
      { slot: "translation", source: OWN_QWEN },
      "/models/qwen3-4b.gguf",
    ]);
  });

  // @behavior MD-028
  it("offers the extensions Rust names for the slot in the file dialog", async () => {
    await openSettings();
    handlers["plugin:dialog|open"] = () => null;

    await click("翻譯", "指定檔案");

    expect(sent("plugin:dialog|open")).toMatchObject({
      options: { filters: [{ name: "Model", extensions: ["gguf"] }] },
    });
  });

  // @behavior MD-052
  it("offers no file while the Model settings cannot be read", async () => {
    await openSettings();
    handlers.model_settings = () =>
      Promise.reject({ code: "io", detail: "denied" });

    await click("翻譯", "指定檔案");

    expect([sent("plugin:dialog|open"), sent("choose_model")]).toEqual([
      undefined,
      undefined,
    ]);
  });

  // @behavior MD-011
  it("says the Models were not read", async () => {
    handlers.model_settings = () =>
      Promise.reject({ code: "io", detail: "denied" });

    await openSettings();

    expect(notifications()).toEqual(["讀不到設定"]);
  });

  // @behavior MD-012
  it("says a Model was not chosen when recording it fails", async () => {
    await openSettings();
    handlers["plugin:dialog|open"] = () => "/models/qwen3-4b.gguf";
    handlers.choose_model = () =>
      Promise.reject({ code: "io", detail: "denied" });

    await click("翻譯", "指定檔案");

    expect(notifications()).toEqual(["設定沒有儲存"]);
  });

  // @behavior MD-048
  it("groups the slot's Preset Models by name, in the order Rust answers them", async () => {
    await openSettings();

    const groups = [...menu("轉錄").querySelectorAll("optgroup")];

    expect(
      groups.map((group) => [
        group.label,
        [...group.querySelectorAll("option")].map((option) => option.value),
      ]),
    ).toEqual([["Breeze-ASR-25", ["0", "1"]]]);
  });

  // @behavior MD-032
  it("downloads a Preset Model at its commit before choosing it", async () => {
    await openSettings();
    handlers.download_model = () => QWEN;
    handlers.choose_model = () => viewWith(QWEN, { presetIndex: 0 });

    await pick("翻譯", "0");

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
    await openSettings();
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
    await settle();

    expect(row("翻譯").querySelector("progress + span")!.textContent).toBe(
      "50%",
    );
  });

  // @behavior MD-034
  it("cancels a download from its slot", async () => {
    await openSettings();
    await startDownload();

    await click("翻譯", "取消");

    expect(sent("cancel_model_download")).toEqual({
      repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
      file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    });
  });

  // @behavior MD-035
  it("keeps the slot's Model when its download fails", async () => {
    settings = () => viewWith(OWN_QWEN);
    await openSettings();
    handlers.download_model = () =>
      Promise.reject({ code: "model-download-failed", detail: "offline" });

    await pick("翻譯", "0");

    expect(menu("翻譯").value).toBe("own");
  });

  // @behavior MD-036
  it("names a Model no Preset Model is as the slot's own", async () => {
    settings = () => viewWith(OWN_QWEN);

    await openSettings();

    expect(menu("翻譯").selectedOptions[0].textContent).toBe(
      "自選：qwen3-4b.gguf",
    );
  });

  // @behavior MD-050
  it("chooses the Preset Model Rust names the slot's Model as", async () => {
    settings = () => viewWith(QWEN, { presetIndex: 0 });

    await openSettings();

    expect(menu("翻譯").value).toBe("0");
  });

  // @behavior MD-038
  it("downloads the file picked from a Repository, then chooses it", async () => {
    await openSettings();
    handlers.repository_files = () => [
      { path: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf", size: 2_497_281_120 },
    ];
    handlers.download_model = () => QWEN;
    handlers.choose_model = () => viewWith(QWEN, { presetIndex: 0 });

    within(row("翻譯"))
      .getByRole("button", { hidden: true, name: "Hugging Face" })
      .click();
    const field = screen.getByPlaceholderText<HTMLInputElement>("owner/name");
    field.value = "unsloth/Qwen3-4B-Instruct-2507-GGUF";
    field.dispatchEvent(new Event("input"));
    screen.getByRole("button", { hidden: true, name: "列出檔案" }).click();
    await settle();
    screen.getByRole("radio", { hidden: true }).click();
    await settle();
    screen.getByRole("button", { hidden: true, name: "下載並使用" }).click();
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

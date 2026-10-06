// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RepositoryDialog from "#/components/settings/RepositoryDialog.svelte";

describe("RepositoryDialog", () => {
  let repositoryFiles: (args: unknown) => unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Opens the dialog for the translation slot with `repo` typed as the Repository name. */
  function typeName(repo: string): HTMLInputElement {
    const { component } = render(RepositoryDialog);
    void component.pick("translation");
    const field = screen.getByPlaceholderText<HTMLInputElement>("owner/name");
    field.value = repo;
    field.dispatchEvent(new Event("input"));
    return field;
  }

  /** Opens the dialog for the translation slot and lists `repo`. */
  async function list(repo: string): Promise<void> {
    typeName(repo);
    screen.getByRole("button", { name: "列出檔案" }).click();
    await settle();
  }

  beforeEach(() => {
    mockIPC((command, args) =>
      command === "repository_files" ? repositoryFiles(args) : undefined,
    );
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior MD-037
  it("offers the Model files Rust answers for the slot, with their sizes", async () => {
    let listedArgs: unknown;
    repositoryFiles = (args) => {
      listedArgs = args;
      return [
        { path: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf", size: 2_497_281_120 },
        { path: "Qwen3-4B-Instruct-2507-Q8_0.gguf", size: 4_280_405_600 },
      ];
    };

    await list("unsloth/Qwen3-4B-Instruct-2507-GGUF");

    expect([
      listedArgs,
      screen
        .getAllByRole("radio", { hidden: true })
        .map((radio) =>
          [...radio.closest("label")!.querySelectorAll("span")].map(
            (cell) => cell.textContent,
          ),
        ),
    ]).toEqual([
      { repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF", slot: "translation" },
      [
        ["Qwen3-4B-Instruct-2507-Q4_K_M.gguf", "2.50 GB"],
        ["Qwen3-4B-Instruct-2507-Q8_0.gguf", "4.28 GB"],
      ],
    ]);
  });

  describe("pressing Enter in the name", () => {
    let listedArgs: unknown[];

    /** Types `repo` as the Repository name and presses Enter in it as `init` tells. */
    async function pressEnter(
      repo: string,
      init: KeyboardEventInit = {},
    ): Promise<KeyboardEvent> {
      const field = typeName(repo);
      const enter = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...init,
      });
      field.dispatchEvent(enter);
      await settle();
      return enter;
    }

    beforeEach(() => {
      listedArgs = [];
      repositoryFiles = (args) => {
        listedArgs.push(args);
        return [];
      };
    });

    // @behavior MD-053
    it("lists the Repository's files", async () => {
      await pressEnter("owner/name");

      expect(listedArgs).toEqual([{ repo: "owner/name", slot: "translation" }]);
    });

    // @behavior MD-054
    it("leaves Enter to an input method processing the key", async () => {
      const enter = await pressEnter("owner/name", { keyCode: 229 });

      expect([listedArgs, enter.defaultPrevented]).toEqual([[], false]);
    });
  });

  // @behavior MD-039
  it("says why a Repository was not listed", async () => {
    repositoryFiles = () =>
      Promise.reject({ code: "model-download-failed", detail: "not found" });

    await list("nobody/nothing");

    expect(
      screen.getByRole("alert", { hidden: true }).textContent!.trim(),
    ).toBe("模型下載失敗（not found）");
  });
});

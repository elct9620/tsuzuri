// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RepositoryController from "./repository_controller";

describe("RepositoryController", () => {
  let application: Application;
  let repositoryFiles: (args: unknown) => unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = () =>
    application.getControllerForElementAndIdentifier(
      document.querySelector("dialog")!,
      "repository",
    ) as RepositoryController;

  async function list(repo: string): Promise<void> {
    document.querySelector<HTMLInputElement>("input")!.value = repo;
    document.querySelector<HTMLButtonElement>(".list")!.click();
    await settle();
  }

  beforeEach(async () => {
    document.body.innerHTML = `
      <dialog data-controller="repository" data-repository-target="dialog" data-action="close->repository#settle">
        <h3 data-repository-target="title"></h3>
        <input data-repository-target="repo" />
        <button class="list" data-action="repository#list"></button>
        <div data-repository-target="files" data-action="change->repository#chooseFile" hidden></div>
        <div data-repository-target="hint" hidden></div>
        <button data-repository-target="downloadButton" data-action="repository#download"></button>
      </dialog>
    `;
    mockIPC((command, args) =>
      command === "repository_files" ? repositoryFiles(args) : undefined,
    );
    application = Application.start();
    application.register("repository", RepositoryController);
    await settle();
  });

  afterEach(() => {
    application.stop();
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
    void dialog().pick("translation");

    await list("unsloth/Qwen3-4B-Instruct-2507-GGUF");

    expect([
      listedArgs,
      [...document.querySelectorAll(".list-row")].map((row) => row.textContent),
    ]).toEqual([
      { repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF", slot: "translation" },
      [
        "Qwen3-4B-Instruct-2507-Q4_K_M.gguf2.50 GB",
        "Qwen3-4B-Instruct-2507-Q8_0.gguf4.28 GB",
      ],
    ]);
  });

  // @behavior MD-039
  it("says why a Repository was not listed", async () => {
    repositoryFiles = () =>
      Promise.reject({ code: "model-download-failed", detail: "not found" });
    void dialog().pick("translation");

    await list("nobody/nothing");

    const hint = document.querySelector<HTMLElement>(
      '[data-repository-target="hint"]',
    )!;
    expect([hint.hidden, hint.textContent]).toEqual([
      false,
      "模型下載失敗（not found）",
    ]);
  });
});

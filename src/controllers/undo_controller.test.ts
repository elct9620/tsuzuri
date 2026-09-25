// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UndoController, { typingOption } from "./undo_controller";

describe("UndoController", () => {
  let application: Application;
  let commands: string[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  function press(target: Element, key: string, shiftKey = false): void {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        shiftKey,
        bubbles: true,
      }),
    );
  }

  beforeEach(async () => {
    commands = [];
    document.body.innerHTML = `
      <main data-controller="undo" data-action="keydown.ctrl+z@window->undo#undoInProject:!typing:prevent keydown.meta+z@window->undo#undoInProject:!typing:prevent keydown.ctrl+shift+z@window->undo#redoInProject:!typing:prevent keydown.meta+shift+z@window->undo#redoInProject:!typing:prevent keydown.ctrl+y@window->undo#redoInProject:!typing:prevent keydown.meta+y@window->undo#redoInProject:!typing:prevent">
        <div class="field text" contenteditable="plaintext-only" tabindex="0"></div>
        <button type="button">⋮</button>
      </main>
    `;
    mockIPC(
      (command) => {
        commands.push(command);
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.registerActionOption("typing", typingOption);
    application.register("undo", UndoController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
    vi.restoreAllMocks();
  });

  const textField = () => document.querySelector<HTMLElement>(".field")!;
  const button = () => document.querySelector("button")!;
  const projectCommands = () =>
    commands.filter((command) => command === "undo" || command === "redo");

  // @behavior UD-013
  it("leaves an undo inside a text field to the field", async () => {
    textField().focus();

    press(textField(), "z");
    await settle();

    expect(projectCommands()).toEqual([]);
  });

  // @behavior UD-014
  it("undoes the Project's change outside a text field", async () => {
    press(button(), "z");
    await settle();

    expect(projectCommands()).toEqual(["undo"]);
  });

  // @behavior UD-015
  it("redoes with the redo shortcuts", async () => {
    press(button(), "Z", true);
    press(button(), "y");
    await settle();

    expect(projectCommands()).toEqual(["redo", "redo"]);
  });

  // @behavior UD-016
  it("undoes from the Edit menu", async () => {
    button().focus();

    await emit("edit-command", "undo");
    await settle();

    expect(projectCommands()).toEqual(["undo"]);
  });

  // @behavior UD-017
  it("undoes typing from the Edit menu", async () => {
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    textField().focus();

    await emit("edit-command", "undo");
    await settle();

    expect([execCommand.mock.calls, projectCommands()]).toEqual([
      [["undo"]],
      [],
    ]);
  });
});

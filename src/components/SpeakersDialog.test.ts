// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "#/assembly.ts";
import type { ProjectView } from "#/backend/project.ts";
import { setInterfaceLanguage } from "#/i18n.ts";
import { projectOf } from "#/test-project.ts";
import { pageContext } from "#/components/context.ts";
import SpeakersDialog from "#/components/SpeakersDialog.svelte";
import { showNotifications } from "#/components/test-notifications.ts";
import {
  checkedBarButton,
  drawSegmentList,
  segmentDialogsOf,
} from "#/components/test-segment-rows.ts";

describe("SpeakersDialog", () => {
  let speakersDialog: SpeakersDialog;
  let project: ProjectView | null;
  let setSpeakersArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  /** A Project of three Segments, said by `speakers` in turn, `""` naming none. */
  const saidBy = (...speakers: string[]) =>
    projectOf({
      segments: speakers.map((speaker, at) => ({
        start_ms: at * 1000,
        end_ms: (at + 1) * 1000,
        ...(speaker ? { speaker } : {}),
        text: "你好",
      })),
    });

  async function check(...indexes: number[]): Promise<void> {
    const rows = document.querySelectorAll<HTMLLIElement>("ol > li");
    for (const index of indexes) {
      const checkbox =
        rows[index].querySelector<HTMLInputElement>("input.check")!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await settle();
  }

  /** Chooses `scope` in the open Speaker dialog, sets the Speaker to `name` and applies it. */
  async function apply(
    scope: string | RegExp,
    name: string,
    from?: string,
  ): Promise<void> {
    screen.getByRole("radio", { hidden: true, name: scope }).click();
    if (from !== undefined) {
      const renamedChoice = screen.getByRole<HTMLSelectElement>("combobox", {
        hidden: true,
        name: "要改名的說話者",
      });
      renamedChoice.value = from;
      renamedChoice.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const speakerField = screen.getByRole<HTMLInputElement>("textbox", {
      hidden: true,
      name: "設為",
    });
    speakerField.value = name;
    speakerField.dispatchEvent(new Event("input", { bubbles: true }));
    screen.getByRole("button", { hidden: true, name: "套用" }).click();
    await settle();
  }

  async function openDialog(): Promise<void> {
    speakersDialog.open();
    await settle();
  }

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    project = null;
    setSpeakersArgs = undefined;
    document.body.innerHTML = `
      <section></section>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "set_speakers") setSpeakersArgs = args;
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    const context = pageContext(assembly.feed, assembly.session);
    speakersDialog = render(SpeakersDialog, { context }).component;
    drawSegmentList(
      document.querySelector("section")!,
      context,
      segmentDialogsOf({ speakers: speakersDialog }),
    );
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior ED-034
  it("sets the Speaker of the Checked Segments", async () => {
    await hold(saidBy("", "", ""));
    await check(0, 2);
    checkedBarButton("說話者……")!.click();
    await settle();

    await apply("已勾選 2 段", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 2], speaker: "co" });
  });

  // @behavior ED-035
  it("sets the Speaker of every Segment", async () => {
    await hold(saidBy("", "cl", ""));
    await openDialog();

    await apply("全部段落", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 1, 2], speaker: "co" });
  });

  // @behavior ED-036
  it("names only the Segments without a Speaker", async () => {
    await hold(saidBy("", "cl", ""));
    await openDialog();

    await apply("沒有說話者的段落", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 2], speaker: "co" });
  });

  // @behavior ED-037
  it("renames a Speaker", async () => {
    await hold(saidBy("co", "cl", "co"));
    await openDialog();

    await apply(/^說話者是/, "小明", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 2], speaker: "小明" });
  });
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_MS, notify } from "./notification";

describe("notify", () => {
  const shown = () =>
    [...document.querySelectorAll('[role="alert"]')].map(
      (alert) => alert.textContent,
    );

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div class="toast" data-notifications></div>`;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // @behavior IF-014
  it("lets a finished task's Notification go on its own", () => {
    notify("完成", "success");

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(shown()).toEqual([]);
  });

  // @behavior IF-015
  it("keeps a failure until it is closed", () => {
    notify("失敗：找不到模型", "error");

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(shown()).toEqual(["失敗：找不到模型"]);
  });

  // @behavior IF-016
  it("closes a Notification that is clicked", () => {
    notify("失敗：找不到模型", "error");

    document.querySelector<HTMLElement>('[role="alert"]')!.click();

    expect(shown()).toEqual([]);
  });

  // @behavior IF-017
  it("says an edit was saved once however many were saved", () => {
    notify("已存檔", "success", "saved");

    notify("已存檔", "success", "saved");

    expect(shown()).toEqual(["已存檔"]);
  });
});

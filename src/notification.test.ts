// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_MS, notify } from "./notification";
import {
  NOTIFICATION_STACK,
  notificationItems,
  notifications,
} from "./test_notification";

describe("notify", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = NOTIFICATION_STACK;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // @behavior IF-014
  it("lets a finished task's Notification go on its own", () => {
    notify({ title: "轉錄完成", kind: "success" });

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-015
  it("keeps a failure until it is closed", () => {
    notify({ title: "轉錄失敗", kind: "error" });

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual(["轉錄失敗"]);
  });

  // @behavior IF-016
  it("closes a Notification that is clicked", () => {
    notify({ title: "轉錄失敗", kind: "error" });

    document.querySelector<HTMLElement>('[role="alert"]')!.click();

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-017
  it("says an edit was saved once however many were saved", () => {
    notify({ title: "已存檔", kind: "success", key: "saved" });

    notify({ title: "已存檔", kind: "success", key: "saved" });

    expect(notifications()).toEqual(["已存檔"]);
  });

  // @behavior IF-018
  it("marks a failure with the icon of its kind", () => {
    notify({ title: "轉錄失敗", kind: "error" });

    expect(
      document.querySelector<SVGElement>('[role="alert"] svg')!.dataset.kind,
    ).toBe("error");
  });

  // @behavior IF-019
  it("lists each item under the title with its value", () => {
    notify({
      title: "翻譯完成",
      kind: "success",
      items: [
        ["載入模型", "2.2 秒"],
        ["翻譯", "0.6 秒"],
      ],
    });

    expect(notificationItems(0)).toEqual([
      ["載入模型", "2.2 秒"],
      ["翻譯", "0.6 秒"],
    ]);
  });
});

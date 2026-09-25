// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_MS, notify } from "./notification";
import {
  NOTIFICATION_STACK,
  notificationAt,
  notificationClose,
  notificationCountdown,
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
  it("closes a Notification that stays by its close button", () => {
    notify({ title: "轉錄失敗", kind: "error" });

    notificationClose(0)!.click();

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-017
  it("stacks every Notification", () => {
    notify({ title: "已存檔", kind: "success" });

    notify({ title: "已存檔", kind: "success" });

    expect(notifications()).toEqual(["已存檔", "已存檔"]);
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

  // @behavior IF-020
  it("keeps a Notification that offers something to do", () => {
    notify({
      title: "已存檔",
      kind: "success",
      action: { label: "加入詞彙表", run: () => {} },
    });

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual(["已存檔"]);
  });

  // @behavior IF-021
  it("shows how long a Notification that goes stays", () => {
    notify({ title: "轉錄完成", kind: "success" });

    expect([notificationCountdown(0) !== null, notificationClose(0)]).toEqual([
      true,
      null,
    ]);
  });

  // @behavior IF-022
  it("offers a close button on a Notification that stays", () => {
    notify({ title: "轉錄失敗", kind: "error" });

    expect([notificationClose(0) !== null, notificationCountdown(0)]).toEqual([
      true,
      null,
    ]);
  });

  // @behavior IF-023
  it("keeps a Notification open while it is clicked", () => {
    notify({ title: "轉錄失敗", kind: "error" });

    notificationAt(0).click();

    expect(notifications()).toEqual(["轉錄失敗"]);
  });

  // @behavior IF-024
  it("pauses a Notification while the pointer rests on it", () => {
    notify({ title: "轉錄完成", kind: "success" });
    const alert = notificationAt(0);
    alert.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(NOTIFICATION_MS * 2);
    const whileResting = notifications();

    alert.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect([whileResting, notifications()]).toEqual([["轉錄完成"], []]);
  });

  // @behavior IF-025
  it("keeps at most five Notifications", () => {
    notify({ title: "轉錄失敗", kind: "error" });
    for (const title of ["一", "二", "三", "四"])
      notify({ title, kind: "success" });

    notify({ title: "五", kind: "success" });

    expect(notifications()).toEqual(["轉錄失敗", "二", "三", "四", "五"]);
  });

  // @behavior IF-026
  it("pauses a Notification while focus is within it", () => {
    notify({ title: "轉錄完成", kind: "success" });

    notificationAt(0).dispatchEvent(new FocusEvent("focusin"));
    vi.advanceTimersByTime(NOTIFICATION_MS * 2);

    expect(notifications()).toEqual(["轉錄完成"]);
  });
});

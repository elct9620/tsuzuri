// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_MS,
  TICK_MS,
  notify as show,
  notifyFailure,
  type Notification,
} from "../ui/notification.svelte";
import {
  showNotifications,
  notificationAction,
  notificationAt,
  notificationClose,
  notificationCountdown,
  notificationItems,
  notifications,
} from "./test_notifications";

describe("Notifications", () => {
  /** Shows `notification` and draws it, so its countdown has started. */
  function notify(notification: Notification): void {
    show(notification);
    flushSync();
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    showNotifications();
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

  // @behavior IF-039
  it("lets a refusal go on its own", () => {
    notifyFailure("編輯未寫入", { code: "invalid-times" });
    flushSync();

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-016
  it("closes a Notification that stays by its close button", () => {
    notify({ title: "轉錄失敗", kind: "error" });

    notificationClose(0)!.click();

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-017
  it("stacks every Notification", () => {
    notify({ title: "翻譯完成", kind: "success" });

    notify({ title: "翻譯完成", kind: "success" });

    expect(notifications()).toEqual(["翻譯完成", "翻譯完成"]);
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
  it("lets a Notification that offers something to do go on its own", () => {
    notify({
      title: "已存檔",
      kind: "success",
      action: { label: "加入詞彙表", run: () => {} },
    });

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-040
  it("stops the countdown of a Notification going away", () => {
    notify({
      title: "已存檔",
      kind: "success",
      action: { label: "加入詞彙表", run: () => {} },
    });
    const countdown = notificationCountdown(0)!;
    notificationAction(0)!.click();
    const stoppedAt = countdown.value;

    vi.advanceTimersByTime(TICK_MS * 2);

    expect(countdown.value).toBe(stoppedAt);
  });

  // @behavior IF-021
  it("shows how long a Notification that goes stays", () => {
    notify({ title: "轉錄完成", kind: "success" });

    expect([
      notificationCountdown(0) !== null,
      notificationClose(0) !== null,
    ]).toEqual([true, true]);
  });

  // @behavior IF-041
  it("closes a Notification before it goes", () => {
    notify({ title: "轉錄完成", kind: "success" });

    notificationClose(0)!.click();

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-022
  it("shows that a Notification stays", () => {
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

    expect(notifications()).toEqual(["一", "二", "三", "四", "五"]);
  });

  // @behavior IF-026
  it("pauses a Notification while focus is within it", () => {
    notify({ title: "轉錄完成", kind: "success" });

    notificationAt(0).dispatchEvent(
      new FocusEvent("focusin", { bubbles: true }),
    );
    vi.advanceTimersByTime(NOTIFICATION_MS * 2);

    expect(notifications()).toEqual(["轉錄完成"]);
  });
});

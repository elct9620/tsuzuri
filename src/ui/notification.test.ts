// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationController from "../controllers/notification_controller";
import {
  NOTIFICATION_MS,
  notify as show,
  type Notification,
} from "./notification";
import {
  NOTIFICATION_STACK,
  notificationAt,
  notificationClose,
  notificationCountdown,
  notificationItems,
  notifications,
} from "./test_notification";

describe("notify", () => {
  let application: Application;

  /** Lets Stimulus connect what was just added, which it does as the DOM reports the change. */
  const connected = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  /** Shows `notification` and waits for its controller to connect, as the page does. */
  async function notify(notification: Notification): Promise<void> {
    show(notification);
    await connected();
  }

  beforeEach(async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    document.body.innerHTML = NOTIFICATION_STACK;
    application = Application.start();
    application.register("notification", NotificationController);
    await connected();
  });

  afterEach(() => {
    application.stop();
    vi.useRealTimers();
  });

  // @behavior IF-014
  it("lets a finished task's Notification go on its own", async () => {
    await notify({ title: "轉錄完成", kind: "success" });

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-015
  it("keeps a failure until it is closed", async () => {
    await notify({ title: "轉錄失敗", kind: "error" });

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual(["轉錄失敗"]);
  });

  // @behavior IF-016
  it("closes a Notification that stays by its close button", async () => {
    await notify({ title: "轉錄失敗", kind: "error" });

    notificationClose(0)!.click();

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-017
  it("stacks every Notification", async () => {
    await notify({ title: "翻譯完成", kind: "success" });

    await notify({ title: "翻譯完成", kind: "success" });

    expect(notifications()).toEqual(["翻譯完成", "翻譯完成"]);
  });

  // @behavior IF-018
  it("marks a failure with the icon of its kind", async () => {
    await notify({ title: "轉錄失敗", kind: "error" });

    expect(
      document.querySelector<SVGElement>('[role="alert"] svg')!.dataset.kind,
    ).toBe("error");
  });

  // @behavior IF-019
  it("lists each item under the title with its value", async () => {
    await notify({
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
  it("lets a Notification that offers something to do go on its own", async () => {
    await notify({
      title: "已存檔",
      kind: "success",
      action: { label: "加入詞彙表", run: () => {} },
    });

    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect(notifications()).toEqual([]);
  });

  // @behavior IF-021
  it("shows how long a Notification that goes stays", async () => {
    await notify({ title: "轉錄完成", kind: "success" });

    expect([notificationCountdown(0) !== null, notificationClose(0)]).toEqual([
      true,
      null,
    ]);
  });

  // @behavior IF-022
  it("offers a close button on a Notification that stays", async () => {
    await notify({ title: "轉錄失敗", kind: "error" });

    expect([notificationClose(0) !== null, notificationCountdown(0)]).toEqual([
      true,
      null,
    ]);
  });

  // @behavior IF-023
  it("keeps a Notification open while it is clicked", async () => {
    await notify({ title: "轉錄失敗", kind: "error" });

    notificationAt(0).click();

    expect(notifications()).toEqual(["轉錄失敗"]);
  });

  // @behavior IF-024
  it("pauses a Notification while the pointer rests on it", async () => {
    await notify({ title: "轉錄完成", kind: "success" });
    const alert = notificationAt(0);
    alert.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(NOTIFICATION_MS * 2);
    const whileResting = notifications();

    alert.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(NOTIFICATION_MS);

    expect([whileResting, notifications()]).toEqual([["轉錄完成"], []]);
  });

  // @behavior IF-025
  it("keeps at most five Notifications", async () => {
    await notify({ title: "轉錄失敗", kind: "error" });
    for (const title of ["一", "二", "三", "四"])
      await notify({ title, kind: "success" });

    await notify({ title: "五", kind: "success" });

    expect(notifications()).toEqual(["一", "二", "三", "四", "五"]);
  });

  // @behavior IF-026
  it("pauses a Notification while focus is within it", async () => {
    await notify({ title: "轉錄完成", kind: "success" });

    notificationAt(0).dispatchEvent(new FocusEvent("focusin"));
    vi.advanceTimersByTime(NOTIFICATION_MS * 2);

    expect(notifications()).toEqual(["轉錄完成"]);
  });
});

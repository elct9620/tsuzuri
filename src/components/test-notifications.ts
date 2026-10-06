import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";

import { notificationStack } from "#/ui/notification.svelte.ts";
import Notifications from "#/components/Notifications.svelte";

/** Puts the corner Notifications are shown in on the test page, holding none yet. */
export function showNotifications(): void {
  notificationStack.clear();
  render(Notifications);
}

/** The Notifications shown in the corner as drawn now, leaving out one already fading away. */
function shownAlerts(): HTMLElement[] {
  flushSync();
  return [
    ...(document
      .querySelector("[data-notifications]")
      ?.querySelectorAll<HTMLElement>(
        '[role="alert"]:not([data-is-leaving])',
      ) ?? []),
  ];
}

/** The title of each Notification shown, oldest first. */
export function notifications(): string[] {
  return shownAlerts().map(
    (alert) => alert.querySelector(".notification-title")?.textContent ?? "",
  );
}

/** The sentence under the title of the Notification at `index`, or none. */
export function notificationDetail(index: number): string | undefined {
  return (
    shownAlerts()[index]?.querySelector(".notification-detail")?.textContent ??
    undefined
  );
}

/** Each row under the title of the Notification at `index`, as its name and value. */
export function notificationItems(index: number): [string, string][] {
  const cells = [
    ...(shownAlerts()[index]?.querySelectorAll("dt, dd") ?? []),
  ].map((cell) => cell.textContent ?? "");
  return cells.flatMap((cell, at) =>
    at % 2 === 0 ? [[cell, cells[at + 1]] as [string, string]] : [],
  );
}

/** The button the Notification at `index` offers, or none. */
export function notificationAction(index: number): HTMLButtonElement | null {
  return (
    shownAlerts()[index]?.querySelector("button:not([data-close-button])") ??
    null
  );
}

/** The close button of the Notification at `index`, or none. */
export function notificationClose(index: number): HTMLButtonElement | null {
  return (
    shownAlerts()[index]?.querySelector("button[data-close-button]") ?? null
  );
}

/** The countdown bar of the Notification at `index`, or none. */
export function notificationCountdown(
  index: number,
): HTMLProgressElement | null {
  return shownAlerts()[index]?.querySelector("progress") ?? null;
}

/** The Notification at `index`. */
export function notificationAt(index: number): HTMLElement {
  return shownAlerts()[index];
}

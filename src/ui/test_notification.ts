/** Where `notify` puts Notifications, for a test page to include. */
export const NOTIFICATION_STACK = `<div data-notifications></div>`;

/** The Notifications shown, leaving out one already fading away. */
function shown(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[role="alert"]:not([data-leaving])',
    ),
  ];
}

/** The title of each Notification shown, oldest first. */
export function notifications(): string[] {
  return shown().map(
    (alert) => alert.querySelector(".notification-title")?.textContent ?? "",
  );
}

/** The sentence under the title of the Notification at `index`, or none. */
export function notificationDetail(index: number): string | undefined {
  return (
    shown()[index]?.querySelector(".notification-detail")?.textContent ??
    undefined
  );
}

/** Each row under the title of the Notification at `index`, as its name and value. */
export function notificationItems(index: number): [string, string][] {
  const cells = [...(shown()[index]?.querySelectorAll("dt, dd") ?? [])].map(
    (cell) => cell.textContent ?? "",
  );
  return cells.flatMap((cell, at) =>
    at % 2 === 0 ? [[cell, cells[at + 1]] as [string, string]] : [],
  );
}

/** The button the Notification at `index` offers, or none. */
export function notificationAction(index: number): HTMLButtonElement | null {
  return shown()[index]?.querySelector("button:not([data-close])") ?? null;
}

/** The close button of the Notification at `index`, or none. */
export function notificationClose(index: number): HTMLButtonElement | null {
  return shown()[index]?.querySelector("button[data-close]") ?? null;
}

/** The countdown bar of the Notification at `index`, or none. */
export function notificationCountdown(
  index: number,
): HTMLProgressElement | null {
  return shown()[index]?.querySelector("progress") ?? null;
}

/** The Notification at `index`. */
export function notificationAt(index: number): HTMLElement {
  return shown()[index];
}

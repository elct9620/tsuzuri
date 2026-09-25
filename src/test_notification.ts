/** Where `notify` puts Notifications, for a test page to include. */
export const NOTIFICATION_STACK = `<div data-notifications></div>`;

/** The text of each Notification shown, oldest first. */
export function notifications(): string[] {
  return [...document.querySelectorAll('[role="alert"]')].map(
    (alert) => alert.textContent ?? "",
  );
}

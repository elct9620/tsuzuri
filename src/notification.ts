/** How long a Notification of anything but a failure stays before it goes on its own. */
export const NOTIFICATION_MS = 4000;

export type NotificationKind = "success" | "warning" | "error";

/** Written out in full so Tailwind finds each class in the source. */
const ALERT_CLASSES: Record<NotificationKind, string> = {
  success: "alert alert-soft alert-success",
  warning: "alert alert-soft alert-warning",
  error: "alert alert-soft alert-error",
};

/**
 * Shows `text` in the corner of the window. A failure stays until it is clicked; anything else
 * goes after `NOTIFICATION_MS`. A Notification with a `key` replaces the one already shown with
 * that key, so something said after every edit is said once.
 */
export function notify(
  text: string,
  kind: NotificationKind,
  key?: string,
): void {
  const stack = document.querySelector<HTMLElement>("[data-notifications]");
  if (!stack) return;
  const alert = document.createElement("div");
  alert.setAttribute("role", "alert");
  alert.className = `${ALERT_CLASSES[kind]} cursor-pointer whitespace-pre-line`;
  alert.textContent = text;
  alert.addEventListener("click", () => alert.remove());
  if (key) {
    alert.dataset.key = key;
    stack.querySelector(`[data-key="${key}"]`)?.remove();
  }
  stack.append(alert);
  if (kind !== "error") setTimeout(() => alert.remove(), NOTIFICATION_MS);
}

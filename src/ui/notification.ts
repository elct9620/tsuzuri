import type { Translation } from "../backend/translation";
import { t } from "../i18n";
import { failureCode, failureMessage } from "./failure";
import { phaseItems } from "./progress";

/** How long a Notification of anything but a failure stays before it goes on its own. */
export const NOTIFICATION_MS = 4000;

export type NotificationKind = "success" | "warning" | "error";

/** What one Notification says: what happened, and optionally why or the values it came to. */
export interface Notification {
  title: string;
  kind: NotificationKind;
  /** A sentence under the title. */
  detail?: string;
  /** Each a name and its value, one row each under the title. */
  items?: [string, string][];
  /** Replaces the Notification already shown with this key, so something said after every edit is said once. */
  key?: string;
}

/**
 * The colour of each kind, written out in full so Tailwind finds each class in the source: the
 * card keeps the page's own colour and only its edge and icon carry the kind.
 */
const KIND_CLASSES: Record<NotificationKind, string> = {
  success: "border-l-success [&_svg]:text-success",
  warning: "border-l-warning [&_svg]:text-warning",
  error: "border-l-error [&_svg]:text-error",
};

/** A check, an exclamation and a cross, each in a 20 by 20 shape. */
const KIND_ICONS: Record<NotificationKind, string> = {
  success:
    "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z",
  warning:
    "M8.3 3.1a2 2 0 0 1 3.4 0l6 10.4A2 2 0 0 1 16 16.5H4a2 2 0 0 1-1.7-3l6-10.4ZM10 7a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  error:
    "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.7 7.3a1 1 0 0 0-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 1 0 1.4 1.4l1.3-1.3 1.3 1.3a1 1 0 0 0 1.4-1.4L11.4 10l1.3-1.3a1 1 0 0 0-1.4-1.4L10 8.6 8.7 7.3Z",
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function icon(kind: NotificationKind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "size-5 shrink-0");
  svg.dataset.kind = kind;
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("d", KIND_ICONS[kind]);
  svg.append(path);
  return svg;
}

function content({ title, detail, items }: Notification): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex w-full min-w-0 flex-col gap-1";
  const heading = document.createElement("strong");
  heading.className = "notification-title";
  heading.textContent = title;
  container.append(heading);
  if (detail) {
    const sentence = document.createElement("p");
    sentence.className = "notification-detail text-base-content/70";
    sentence.textContent = detail;
    container.append(sentence);
  }
  if (items?.length) {
    const list = document.createElement("dl");
    list.className =
      "grid grid-cols-[1fr_auto] gap-x-6 text-base-content/70 [&_dd]:text-right [&_dd]:tabular-nums";
    for (const [name, value] of items) {
      const term = document.createElement("dt");
      term.textContent = name;
      const description = document.createElement("dd");
      description.textContent = value;
      list.append(term, description);
    }
    container.append(list);
  }
  return container;
}

/** Shows `notification` in the corner of the window. A failure stays until it is clicked; anything else goes after `NOTIFICATION_MS`. */
export function notify(notification: Notification): void {
  const stack = document.querySelector<HTMLElement>("[data-notifications]");
  if (!stack) return;
  const { kind, key } = notification;
  const alert = document.createElement("div");
  alert.setAttribute("role", "alert");
  alert.className = `alert w-80 cursor-pointer items-start border border-l-4 border-base-300 bg-base-100 text-sm shadow-lg ${KIND_CLASSES[kind]}`;
  alert.append(icon(kind), content(notification));
  alert.addEventListener("click", () => alert.remove());
  if (key) {
    alert.dataset.key = key;
    stack.querySelector(`[data-key="${key}"]`)?.remove();
  }
  stack.append(alert);
  if (kind !== "error") setTimeout(() => alert.remove(), NOTIFICATION_MS);
}

/** Says `title` did not happen and why; one refused over a change made elsewhere is a warning. */
export function notifyFailure(title: string, error: unknown): void {
  notify({
    title,
    detail: failureMessage(error),
    kind: failureCode(error) === "changed-elsewhere" ? "warning" : "error",
  });
}

/** Says a translation finished, with how long each of its Phases took. */
export function notifyTranslation({ phases }: Translation): void {
  notify({
    title: t("translate.done"),
    kind: "success",
    items: phaseItems(phases),
  });
}

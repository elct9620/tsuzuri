import type { Translation } from "../backend/translation";
import { iconElement } from "./icons";
import { t } from "../i18n";
import { failureCode, failureMessage } from "./failure";
import { phaseItems } from "./progress";

/** How long a Notification that goes on its own stays, paused while the pointer or focus rests on it. */
export const NOTIFICATION_MS = 6000;

/** How often a countdown bar moves. */
const TICK_MS = 100;

/** How long a Notification takes to fade away, the `duration-200` of its transition. */
const LEAVING_MS = 200;

/** How many Notifications the corner holds at once. */
const MOST_SHOWN = 5;

/**
 * A card sliding in from the right as daisyUI's toast fades it in, and fading away as it slides
 * back; written out in full so Tailwind finds each class, and still for a system asking for less
 * motion, as the toast's own animation is.
 */
const ALERT_CLASSES =
  "alert w-80 items-start border border-l-4 border-base-300 bg-base-100 text-sm shadow-lg transition-[opacity,translate] duration-200 ease-out starting:translate-x-8 data-leaving:translate-x-8 data-leaving:opacity-0 motion-reduce:transition-none";

export type NotificationKind = "success" | "warning" | "error";

/** What one Notification says: what happened, and optionally why or the values it came to. */
export interface Notification {
  title: string;
  kind: NotificationKind;
  /** A sentence under the title. */
  detail?: string;
  /** Each a name and its value, one row each under the title. */
  items?: [string, string][];
  /** Something the user may do about it; the Notification stays until closed so it can be done. */
  action?: { label: string; run: () => void };
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

/** Takes `alert` away, fading it out first. */
function leave(alert: HTMLElement): void {
  alert.dataset.leaving = "";
  setTimeout(() => alert.remove(), LEAVING_MS);
}

/** A small button after the content, as daisyUI lays out an alert's buttons. */
function button(
  label: string,
  className: string,
  press: () => void,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", press);
  return element;
}

/** The buttons of a Notification that stays: its action, if it has one, then a close button. */
function buttons(alert: HTMLElement, { action }: Notification): HTMLElement {
  const group = document.createElement("div");
  group.className = "flex items-center gap-1";
  if (action)
    group.append(
      button(action.label, "btn btn-sm", () => {
        action.run();
        leave(alert);
      }),
    );
  const close = button("", "btn btn-sm btn-circle btn-ghost", () =>
    leave(alert),
  );
  close.append(iconElement("X"));
  close.dataset.close = "";
  close.setAttribute("aria-label", t("work.close"));
  group.append(close);
  return group;
}

/** Counts down `NOTIFICATION_MS` on a bar under the content, pausing while the pointer or focus rests on `alert`, then takes it away. */
function countDown(alert: HTMLElement, content: HTMLElement): void {
  const bar = document.createElement("progress");
  bar.className = "progress h-1";
  bar.max = NOTIFICATION_MS;
  bar.value = NOTIFICATION_MS;
  content.append(bar);
  const resting = { pointer: false, focus: false };
  alert.addEventListener("mouseenter", () => (resting.pointer = true));
  alert.addEventListener("mouseleave", () => (resting.pointer = false));
  alert.addEventListener("focusin", () => (resting.focus = true));
  alert.addEventListener("focusout", () => (resting.focus = false));
  const timer = setInterval(() => {
    if (!alert.isConnected || "leaving" in alert.dataset)
      return clearInterval(timer);
    if (resting.pointer || resting.focus) return;
    bar.value -= TICK_MS;
    if (bar.value > 0) return;
    clearInterval(timer);
    leave(alert);
  }, TICK_MS);
}

/** Takes away the oldest Notification that would go on its own while more than `MOST_SHOWN` are shown. */
function keepMostShown(stack: HTMLElement): void {
  const shown = [
    ...stack.querySelectorAll<HTMLElement>(
      '[role="alert"]:not([data-leaving])',
    ),
  ];
  if (shown.length <= MOST_SHOWN) return;
  const oldest = shown.find((alert) => !("stays" in alert.dataset));
  if (oldest) leave(oldest);
}

/** Shows `notification` in the corner of the window, stacked under the ones already shown. A failure, or one offering an action, stays until closed; anything else counts down `NOTIFICATION_MS`. */
export function notify(notification: Notification): void {
  const stack = document.querySelector<HTMLElement>("[data-notifications]");
  if (!stack) return;
  const { kind, action } = notification;
  const alert = document.createElement("div");
  alert.setAttribute("role", "alert");
  alert.className = `${ALERT_CLASSES} ${KIND_CLASSES[kind]}`;
  const body = content(notification);
  alert.append(icon(kind), body);
  if (kind === "error" || action) {
    alert.dataset.stays = "";
    alert.append(buttons(alert, notification));
  } else {
    countDown(alert, body);
  }
  stack.append(alert);
  keepMostShown(stack);
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

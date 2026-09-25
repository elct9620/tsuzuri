import type { Restoration } from "../backend/project";
import type { Translation } from "../backend/translation";
import { iconElement, type IconName } from "./icons";
import { t } from "../i18n";
import { failureCode, failureMessage } from "./failure";
import { phaseItems } from "./progress";

/** How long a Notification that goes on its own stays, paused while the pointer or focus rests on it. */
export const NOTIFICATION_MS = 6000;

/** How often a countdown bar moves. */
export const TICK_MS = 100;

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
  success: "border-l-success [&_svg[data-kind]]:text-success",
  warning: "border-l-warning [&_svg[data-kind]]:text-warning",
  error: "border-l-error [&_svg[data-kind]]:text-error",
};

/** A check, an exclamation and a cross, each in a circle or a triangle. */
const KIND_ICONS: Record<NotificationKind, IconName> = {
  success: "CircleCheck",
  warning: "TriangleAlert",
  error: "CircleX",
};

function icon(kind: NotificationKind): SVGElement {
  const svg = iconElement(KIND_ICONS[kind], "size-5 shrink-0");
  svg.dataset.kind = kind;
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

/** What each Notification offering an action does when it is taken. */
const actionByAlert = new WeakMap<HTMLElement, () => void>();

/** Does what the Notification `alert` offers. */
export function runAction(alert: HTMLElement): void {
  actionByAlert.get(alert)?.();
}

/** Takes `alert` away, fading it out first. */
export function leave(alert: HTMLElement): void {
  alert.dataset.leaving = "";
  setTimeout(() => alert.remove(), LEAVING_MS);
}

/** A small button after the content, as daisyUI lays out an alert's buttons, pressing `notification#<method>`. */
function button(
  label: string,
  className: string,
  method: "act" | "close",
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.dataset.action = `notification#${method}`;
  return element;
}

/** The buttons of a Notification that stays: its action, if it has one, then a close button. */
function buttons(alert: HTMLElement, { action }: Notification): HTMLElement {
  const group = document.createElement("div");
  group.className = "flex items-center gap-1";
  if (action) {
    actionByAlert.set(alert, action.run);
    group.append(button(action.label, "btn btn-sm", "act"));
  }
  const close = button("", "btn btn-sm btn-circle btn-ghost", "close");
  close.append(iconElement("X"));
  close.dataset.close = "";
  close.setAttribute("aria-label", t("work.close"));
  group.append(close);
  return group;
}

/** A bar under the content counting down `NOTIFICATION_MS`, which `notification` moves while nothing rests on `alert`. */
function countDown(alert: HTMLElement, content: HTMLElement): void {
  const bar = document.createElement("progress");
  bar.className = "progress h-1";
  bar.max = NOTIFICATION_MS;
  bar.value = NOTIFICATION_MS;
  bar.dataset.notificationTarget = "bar";
  content.append(bar);
  alert.dataset.action =
    "mouseenter->notification#rest mouseleave->notification#resume focusin->notification#rest focusout->notification#resume";
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
  alert.dataset.controller = "notification";
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

/** Says `title` was restored, warning of the Segments it left with no translation lined up. */
export function notifyRestoration(
  title: string,
  { unmatched_count }: Restoration,
  detail?: string,
): void {
  notify({ title, detail, kind: "success" });
  if (unmatched_count === 0) return;
  notify({
    title: t("compare.unmatched", { count: unmatched_count }),
    detail: t("compare.unmatchedHelp"),
    kind: "warning",
  });
}

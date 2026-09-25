import { Controller } from "@hotwired/stimulus";

import { leave, runAction, TICK_MS } from "../ui/notification";

/** One Notification in the corner: counts down while nothing rests on it, and takes its buttons. */
export default class NotificationController extends Controller<HTMLElement> {
  static targets = ["bar"];

  /** The countdown bar of a Notification that goes on its own. */
  declare readonly barTarget: HTMLProgressElement;
  declare readonly hasBarTarget: boolean;

  private timer?: ReturnType<typeof setInterval>;
  /** What rests on the Notification now: the pointer, focus, or both. */
  private readonly resting = new Set<"pointer" | "focus">();

  connect(): void {
    if (this.hasBarTarget) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  disconnect(): void {
    clearInterval(this.timer);
  }

  rest(event: Event): void {
    this.resting.add(event.type === "mouseenter" ? "pointer" : "focus");
  }

  resume(event: Event): void {
    this.resting.delete(event.type === "mouseleave" ? "pointer" : "focus");
  }

  act(): void {
    runAction(this.element);
    leave(this.element);
  }

  close(): void {
    leave(this.element);
  }

  private tick(): void {
    if ("leaving" in this.element.dataset) return clearInterval(this.timer);
    if (this.resting.size > 0) return;
    this.barTarget.value -= TICK_MS;
    if (this.barTarget.value > 0) return;
    clearInterval(this.timer);
    leave(this.element);
  }
}

import type { Diarization } from "#/backend/diarization.ts";
import type { PhaseTiming } from "#/backend/progress.ts";
import type { Restoration } from "#/backend/project.ts";
import type { Transcription } from "#/backend/transcription.ts";
import type { Translation } from "#/backend/translation.ts";
import type { Outcome } from "#/editor/index.ts";
import { t } from "#/i18n.ts";
import { failureKind, failureMessage } from "#/ui/failure.ts";
import { factorItems, phaseItems } from "#/ui/progress.ts";
import { showSaveMark } from "#/ui/save-mark.ts";

/** How long a Notification that goes on its own stays, paused while the pointer or focus rests on it. */
export const NOTIFICATION_MS = 6000;

/** How often a countdown bar moves. */
export const TICK_MS = 100;

/** How long a Notification takes to fade away, the `duration-200` of its transition. */
const LEAVING_MS = 200;

/** How many Notifications the corner holds at once. */
const MOST_SHOWN = 5;

export type NotificationKind = "success" | "warning" | "error";

/** What one Notification says: what happened, and optionally why or the values it came to. */
export interface Notification {
  title: string;
  kind: NotificationKind;
  /** A sentence under the title. */
  detail?: string;
  /** Each a name and its value, one row each under the title. */
  items?: [string, string][];
  /** Something the user may do about it, within reach while the pointer or focus rests on the Notification. */
  action?: { label: string; run: () => void };
}

/** A Notification in the corner, told apart from another saying the same by its `id`. */
export interface ShownNotification {
  readonly id: number;
  readonly notification: Notification;
  /** Whether it is fading away, to be taken out once it has. */
  isLeaving: boolean;
}

/** The Notifications in the corner of the window, oldest first, which the Notifications Svelte Component draws. */
class NotificationStack {
  notifications = $state<ShownNotification[]>([]);
  private lastId = 0;

  /** Puts `notification` under the ones shown, taking away the oldest while more than `MOST_SHOWN` stay. */
  add(notification: Notification): void {
    this.notifications.push({
      id: ++this.lastId,
      notification,
      isLeaving: false,
    });
    const stayingNotifications = this.notifications.filter(
      ({ isLeaving }) => !isLeaving,
    );
    if (stayingNotifications.length > MOST_SHOWN)
      this.leave(stayingNotifications[0].id);
  }

  /** Takes the Notification `id` away, fading it out first. */
  leave(id: number): void {
    const entry = this.notifications.find((candidate) => candidate.id === id);
    if (!entry || entry.isLeaving) return;
    entry.isLeaving = true;
    setTimeout(() => {
      this.notifications = this.notifications.filter(
        (candidate) => candidate.id !== id,
      );
    }, LEAVING_MS);
  }

  /** Takes every Notification away at once. */
  clear(): void {
    this.notifications = [];
  }
}

export const notificationStack = new NotificationStack();

/** Shows `notification` in the corner of the window, stacked under the ones already shown, with a close button. An error stays until closed; anything else counts down `NOTIFICATION_MS`, its action within reach while the pointer or focus rests on it. */
export function notify(notification: Notification): void {
  notificationStack.add(notification);
}

/** Says `title` did not happen and why, as a warning for a refusal and an error for a fault. */
export function notifyFailure(title: string, error: unknown): void {
  notify({ title, detail: failureMessage(error), kind: failureKind(error) });
}

/**
 * Says how an edit ended: saved, by the Save Mark rather than a Notification since every field left
 * writes one; refused before it was sent with `refusal`; or not done as `failure` says and why. An
 * edit that changed nothing says nothing.
 */
export function notifyEdit(
  outcome: Outcome,
  { refusal = "edit.notSaved", failure = "edit.notSaved" } = {},
): void {
  if (outcome.kind === "written") showSaveMark();
  else if (outcome.kind === "refused")
    notify({ title: t(refusal), kind: "warning" });
  else if (outcome.kind === "failed") notifyFailure(t(failure), outcome.error);
}

/** Says a translation finished, with how long each of its Phases took. */
export function notifyTranslation({
  phases,
  unmatched_count,
}: Translation): void {
  notify({
    title: t("translate.done"),
    kind: "success",
    items: phaseItems(phases),
  });
  notifyUnmatched(unmatched_count);
}

/** Says a transcription finished, with how long the audio is and how long each Phase took. */
export function notifyTranscription({
  audio_seconds,
  transcribe_seconds,
  phases,
}: Transcription): void {
  notify({
    title: t("transcribe.done"),
    kind: "success",
    items: audioRunItems(audio_seconds, transcribe_seconds, phases),
  });
}

/** Says the Speakers were given, with how long the audio is and how long each Phase took. */
export function notifyDiarization({
  audio_seconds,
  diarize_seconds,
  phases,
}: Diarization): void {
  notify({
    title: t("diarize.done"),
    kind: "success",
    items: audioRunItems(audio_seconds, diarize_seconds, phases),
  });
}

/** The items of a run over `audioSeconds` of audio that took `runSeconds`, Phase by Phase. */
function audioRunItems(
  audioSeconds: number,
  runSeconds: number,
  phases: PhaseTiming[],
): [string, string][] {
  return [
    [
      t("transcribe.audio"),
      t("phases.seconds", { seconds: audioSeconds.toFixed(1) }),
    ],
    ...factorItems(runSeconds, audioSeconds),
    ...phaseItems(phases),
  ];
}

/** Says `title` was restored, warning of the Segments it left with no translation lined up. */
export function notifyRestoration(
  title: string,
  { unmatched_count }: Restoration,
  detail?: string,
): void {
  notify({ title, detail, kind: "success" });
  notifyUnmatched(unmatched_count);
}

/** Warns of `count` Segments left with no translation lined up, which can be translated again. */
function notifyUnmatched(count: number): void {
  if (count === 0) return;
  notify({
    title: t("compare.unmatched", { count }),
    detail: t("compare.unmatchedHelp"),
    kind: "warning",
  });
}

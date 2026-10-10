/**
 * The Segment Changes a Segment's menu and the checked bar offer. Each is one list of choices the
 * menu or the bar draws and the right-click menu hands to the system, so both show the same.
 */

import { type MenuChoice, popUpMenu } from "#/ipc/context-menu.ts";
import {
  currentResource,
  hasTraditionalChinese,
  type ProjectView,
} from "#/ipc/project.ts";
import { isMacOS } from "#/ipc/system.ts";
import {
  type EditingSession,
  isRun,
  isTextField,
  type MergeDirection,
  runWithNeighbour,
  type SegmentChange,
} from "#/editor/index.ts";
import { t } from "#/i18n.ts";
import { notifyEdit } from "#/state/notification.svelte.ts";
import { accelerator, type ShortcutId } from "#/ui/shortcuts.ts";
import { cleanSegments } from "#/actions/cleanup.ts";
import type { SegmentDialogs } from "#/state/context.ts";

/** One choice of a menu of Segment Changes: what it is called and shows, its keys, whether it can run, and what it does. */
export interface ChangeChoice {
  /** Tells the choice apart among those drawn alike. */
  id: string;
  label: string;
  shortcut?: ShortcutId;
  isEnabled: boolean;
  run: () => Promise<void> | void;
}

/** What the Current Resource offers besides the Segment Changes themselves. */
export interface ResourceOffers {
  isTranslationShown: boolean;
  hasMedia: boolean;
  /** Whether a text in `zh-TW` is shown, whose Simplified Chinese can be cleaned. */
  isCleanupOffered: boolean;
}

/** What `project` offers besides the Segment Changes themselves. */
export function resourceOffers(project: ProjectView | null): ResourceOffers {
  return {
    isTranslationShown: (project?.shown_translation ?? null) !== null,
    hasMedia: currentResource(project)?.has_media ?? false,
    isCleanupOffered: hasTraditionalChinese(project),
  };
}

/** Sends `segmentChange` and tells why it was not made, if it was not. */
export async function change(
  session: EditingSession,
  segmentChange: SegmentChange,
): Promise<void> {
  notifyEdit(await session.change(segmentChange));
}

/** A choice of a Segment's menu, which runs whenever the Segment is not held. */
type SegmentChoice = Omit<ChangeChoice, "isEnabled">;

/**
 * The menu of the Segment at `index` of `count`: inserting, splitting, merging with a neighbour
 * there is, deleting, and what the Current Resource offers besides; none can run while a Mode holds
 * the Segment.
 */
export function segmentChoices(
  session: EditingSession,
  dialogs: SegmentDialogs,
  { index, count, isHeld }: { index: number; count: number; isHeld: boolean },
  offers: ResourceOffers,
): ChangeChoice[] {
  const mergeChoice = (
    id: string,
    direction: MergeDirection,
  ): SegmentChoice[] => {
    const run = runWithNeighbour(index, direction, count);
    if (run === null) return [];
    return [
      {
        id,
        label: t(`edit.${id}`),
        shortcut: id as ShortcutId,
        run: async () => notifyEdit(await session.merge(run.first, run.last)),
      },
    ];
  };
  const choices: SegmentChoice[] = [
    {
      id: "insertBefore",
      label: t("edit.insertAbove"),
      run: () => change(session, { kind: "insertion-before", index }),
    },
    {
      id: "insertAfter",
      label: t("edit.insertBelow"),
      run: () => change(session, { kind: "insertion-after", index }),
    },
    {
      id: "split",
      label: t("edit.split"),
      shortcut: "split",
      // The Cursor in the text is kept while the menu has focus, so the split lands there.
      run: async () =>
        notifyEdit(await session.split(), { refusal: "edit.splitWhere" }),
    },
    ...mergeChoice("mergeWithPrevious", "previous"),
    ...mergeChoice("mergeWithNext", "next"),
    {
      id: "delete",
      label: t("edit.delete"),
      shortcut: "delete",
      run: () => change(session, { kind: "deletion", indexes: [index] }),
    },
    ...(offers.isTranslationShown
      ? [
          {
            id: "retranslate",
            label: t("edit.retranslate"),
            run: () => dialogs.openRetranslation([index]),
          },
        ]
      : []),
    ...(offers.hasMedia
      ? [
          {
            id: "retranscribe",
            label: t("edit.retranscribeRest"),
            run: () =>
              dialogs.openRetranscription({ kind: "rest", first: index }),
          },
        ]
      : []),
    ...(offers.isCleanupOffered
      ? [
          {
            id: "cleanup",
            label: t("cleanup.action"),
            shortcut: "cleanup" as const,
            run: () => cleanSegments(session, [index]),
          },
        ]
      : []),
  ];
  return choices.map((choice) => ({ ...choice, isEnabled: !isHeld }));
}

/**
 * What the checked bar offers for the Checked Segments `indexes`: a merge only for Segments next
 * to each other, and what the Current Resource offers besides.
 */
export function checkedChoices(
  session: EditingSession,
  dialogs: SegmentDialogs,
  indexes: number[],
  offers: ResourceOffers,
): ChangeChoice[] {
  return [
    {
      id: "merge",
      label: t("edit.merge"),
      isEnabled: isRun(indexes),
      run: () =>
        change(session, {
          kind: "merge",
          first: indexes[0],
          last: indexes[indexes.length - 1],
        }),
    },
    {
      id: "shift",
      label: t("edit.shift"),
      isEnabled: true,
      run: () => dialogs.openShift(),
    },
    {
      id: "speakers",
      label: t("edit.speakersOfChecked"),
      isEnabled: true,
      run: () => dialogs.openSpeakers(indexes),
    },
    ...(offers.isTranslationShown
      ? [
          {
            id: "retranslate",
            label: t("edit.retranslate"),
            isEnabled: true,
            run: () => dialogs.openRetranslation(indexes),
          },
        ]
      : []),
    ...(offers.hasMedia
      ? [
          {
            id: "retranscribe",
            label: t("edit.retranscribe"),
            isEnabled: true,
            run: () =>
              dialogs.openRetranscription({
                kind: "span",
                first: Math.min(...indexes),
                last: Math.max(...indexes),
              }),
          },
        ]
      : []),
    ...(offers.isCleanupOffered
      ? [
          {
            id: "cleanup",
            label: t("cleanup.action"),
            shortcut: "cleanup" as const,
            isEnabled: true,
            run: () => cleanSegments(session, indexes),
          },
        ]
      : []),
    {
      id: "delete",
      label: t("edit.delete"),
      shortcut: "delete",
      isEnabled: true,
      run: () => change(session, { kind: "deletion", indexes }),
    },
    {
      id: "clearChecks",
      label: t("edit.clearChecks"),
      isEnabled: true,
      run: () => session.uncheckAll(),
    },
  ];
}

/**
 * Opens `choices` as a menu of the system beside the pointer, putting cut, copy and paste ahead of
 * them when `target`, where the menu was asked for, is a text field.
 */
export async function popUpChoices(
  choices: ChangeChoice[],
  target: EventTarget | null,
): Promise<void> {
  const menuChoices: MenuChoice[] = choices.map((choice) => ({
    text: choice.label,
    isEnabled: choice.isEnabled,
    accelerator: choice.shortcut
      ? accelerator(choice.shortcut, isMacOS())
      : undefined,
    run: () => void choice.run(),
  }));
  await popUpMenu(
    menuChoices,
    isTextField(target)
      ? { cut: t("edit.cut"), copy: t("edit.copy"), paste: t("edit.paste") }
      : null,
  );
}

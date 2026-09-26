import { Controller } from "@hotwired/stimulus";

import {
  saveTranslationGlossary,
  translationGlossaryTable,
  type ProjectView,
  type Segment,
} from "../backend/project";
import type { EditingSession, Outcome } from "../editor";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import {
  notify,
  notifyEdit,
  notifyFailure,
  type Notification,
} from "../ui/notification";

/** One choice of a Speaker menu, `speaker` for Segment `index`; an empty one clears it. */
function speakerChoice(
  index: number,
  speaker: string,
  label: string,
  isChosen: boolean,
): HTMLLIElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = isChosen ? "menu-active" : "";
  button.dataset.speaker = speaker;
  button.dataset.action = "speakers#choose";
  button.dataset.speakersIndexParam = String(index);
  button.textContent = label;
  const choice = document.createElement("li");
  choice.append(button);
  return choice;
}

function speakerOption(speaker: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = speaker;
  option.textContent = speaker;
  return option;
}

/** A button that fills in `speaker` as the Speaker to set. */
function nameButton(speaker: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-xs";
  button.dataset.speaker = speaker;
  button.dataset.action = "speakers#fill";
  button.textContent = speaker;
  return button;
}

/**
 * The Speaker menu of each Segment the editor shows - every Speaker named to choose from, a new
 * name, or none - and the Speaker dialog that names many Segments at once; a new name is offered
 * to the Translation Glossary.
 */
/** Which Segments the Speaker dialog names. */
type SpeakerScope =
  "checked-segments" | "all-segments" | "unnamed-segments" | "named-segments";

export default class SpeakersController extends Controller {
  static targets = [
    "dialog",
    "scope",
    "checkedChoice",
    "checkedCount",
    "renamedSpeaker",
    "newSpeaker",
    "names",
  ];

  declare readonly session: EditingSession;
  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly scopeTargets: HTMLInputElement[];
  /** The choice of the Checked Segments, offered only when the dialog is opened for them. */
  declare readonly checkedChoiceTarget: HTMLElement;
  declare readonly checkedCountTarget: HTMLElement;
  /** The Speaker whose Segments are renamed. */
  declare readonly renamedSpeakerTarget: HTMLSelectElement;
  /** The Speaker to set, none when left empty. */
  declare readonly newSpeakerTarget: HTMLInputElement;
  /** Each Speaker named, to fill in the Speaker to set. */
  declare readonly namesTarget: HTMLElement;

  /** The Checked Segments when the dialog was opened for them. */
  private checkedIndexes: number[] = [];
  /** The Project the editor shows, whose Segments and Translation Glossary name the Speakers. */
  private project: ProjectView | null = null;

  follow({ detail }: CustomEvent<{ project: ProjectView | null }>): void {
    this.project = detail.project;
  }

  /** The Speakers the Segments name and those the Translation Glossary names, in order. */
  private get speakers(): string[] {
    const names = new Set([
      ...(this.project?.segments ?? []).flatMap((segment) =>
        segment.speaker ? [segment.speaker] : [],
      ),
      ...(this.project?.translation_glossary?.speakers ?? []),
    ]);
    return [...names].sort();
  }

  /** Lists every Speaker in the menu of the Segment at `index`, marking the one it names. */
  list({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { index: number };
  }): void {
    const menu = (currentTarget as HTMLElement).parentElement!;
    const speaker = this.project?.segments[params.index]?.speaker ?? "";
    menu.querySelector<HTMLInputElement>(".new-speaker")!.value = "";
    menu
      .querySelector(".speakers")!
      .replaceChildren(
        ...this.speakers.map((name) =>
          speakerChoice(params.index, name, name, name === speaker),
        ),
        ...(speaker === ""
          ? []
          : [speakerChoice(params.index, "", t("edit.clearSpeaker"), false)]),
      );
  }

  async choose({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { index: number };
  }): Promise<void> {
    closeMenu(currentTarget);
    await this.writeSpeaker(
      params.index,
      (currentTarget as HTMLElement).dataset.speaker ?? "",
    );
  }

  /** Opens the Speaker dialog for the whole transcript. */
  open(): void {
    this.showDialog([]);
  }

  /** Opens the Speaker dialog for the Checked Segments. */
  openForChecked(): void {
    this.showDialog(this.session.checkedIndexes);
  }

  /** Fills in the Speaker a name button names. */
  fill({ currentTarget }: Event): void {
    this.newSpeakerTarget.value =
      (currentTarget as HTMLElement).dataset.speaker ?? "";
  }

  /** Sets the Speaker typed of every Segment the chosen scope takes in, as one change. */
  async apply(): Promise<void> {
    const scope = this.scopeTargets.find((choice) => choice.checked)
      ?.value as SpeakerScope;
    const indexes = this.scopeIndexes(scope);
    const name = this.newSpeakerTarget.value.trim();
    this.dialogTarget.close();
    this.notifyNamed(await this.session.setSpeakers(indexes, name), name);
  }

  private showDialog(checkedIndexes: number[]): void {
    this.checkedIndexes = checkedIndexes;
    const isChecked = checkedIndexes.length > 0;
    this.checkedChoiceTarget.hidden = !isChecked;
    this.checkedCountTarget.textContent = t("edit.checkedCount", {
      count: checkedIndexes.length,
    });
    for (const choice of this.scopeTargets)
      choice.checked =
        choice.value === (isChecked ? "checked-segments" : "all-segments");
    const speakers = this.speakers;
    this.renamedSpeakerTarget.replaceChildren(...speakers.map(speakerOption));
    this.newSpeakerTarget.value = "";
    this.newSpeakerTarget.placeholder = t("edit.speakersNone");
    this.namesTarget.replaceChildren(...speakers.map(nameButton));
    this.dialogTarget.showModal();
  }

  /** The positions of the Segments `scope` takes in. */
  private scopeIndexes(scope: SpeakerScope): number[] {
    if (scope === "checked-segments") return this.checkedIndexes;
    const isTaken: Record<
      Exclude<SpeakerScope, "checked-segments">,
      (segment: Segment) => boolean
    > = {
      "all-segments": () => true,
      "unnamed-segments": (segment) => !segment.speaker,
      "named-segments": (segment) =>
        segment.speaker === this.renamedSpeakerTarget.value,
    };
    return (this.project?.segments ?? []).flatMap((segment, index) =>
      isTaken[scope](segment) ? [index] : [],
    );
  }

  /** Names the Segment's Speaker as typed in its menu. */
  async name({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { index: number };
  }): Promise<void> {
    const name = (currentTarget as HTMLInputElement).value.trim();
    if (name === "") return;
    closeMenu(currentTarget);
    await this.writeSpeaker(params.index, name);
  }

  private async writeSpeaker(index: number, name: string): Promise<void> {
    this.notifyNamed(await this.session.editText(index, "speaker", name), name);
  }

  /** Says a Speaker was named, offering the name to the Translation Glossary, or why it was not. */
  private notifyNamed(outcome: Outcome, name: string): void {
    if (outcome.kind !== "written") {
      notifyEdit(outcome);
      return;
    }
    notify({
      title: t("edit.saved"),
      kind: "success",
      ...this.speakerOffer(name),
    });
  }

  /** An offer to add the Speaker just named to the Translation Glossary, when it names none such. */
  private speakerOffer(name: string): Pick<Notification, "detail" | "action"> {
    const glossarySpeakers = this.project?.translation_glossary?.speakers ?? [];
    if (name === "" || glossarySpeakers.includes(name)) return {};
    return {
      detail: t("edit.newSpeaker", { name }),
      action: {
        label: t("edit.addSpeaker"),
        run: () => void this.addSpeaker(name),
      },
    };
  }

  /** Marks the term `name` in the Primary Language column as a Speaker, adding the term when the glossary has none. */
  private async addSpeaker(name: string): Promise<void> {
    try {
      const table = await translationGlossaryTable();
      const column = table.languages.indexOf(this.project?.language ?? "");
      const term = table.rows.find((row) => row.words[column] === name);
      const rows = term
        ? table.rows.map((row) =>
            row === term ? { ...row, is_speaker: true } : row,
          )
        : [
            ...table.rows,
            {
              words: table.languages.map((_, at) =>
                at === column ? name : "",
              ),
              is_speaker: true,
            },
          ];
      await saveTranslationGlossary(rows);
      notify({ title: t("edit.speakerAdded", { name }), kind: "success" });
    } catch (error) {
      notifyFailure(t("edit.speakerNotAdded"), error);
    }
  }
}

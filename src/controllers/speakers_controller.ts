import { Controller } from "@hotwired/stimulus";

import {
  editSegment,
  saveTranslationGlossary,
  translationGlossaryTable,
  type ProjectView,
} from "../backend/project";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notify, notifyFailure, type Notification } from "../ui/notification";

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

/**
 * The Speaker menu of each Segment the editor shows: every Speaker named to choose from, a new
 * name, or none, with a new name offered to the Translation Glossary.
 */
export default class SpeakersController extends Controller {
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
    try {
      await editSegment(index, "speaker", name);
      notify({
        title: t("edit.saved"),
        kind: "success",
        ...this.speakerOffer(name),
      });
    } catch (error) {
      notifyFailure(t("edit.notSaved"), error);
    }
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

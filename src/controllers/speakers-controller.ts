import { Controller } from "@hotwired/stimulus";

import type { ProjectView } from "../backend/project";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { speakerNames } from "../ui/speakers";

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
 * name, or none. The name chosen goes to the window as `speakers:name` to be written.
 */
export default class SpeakersController extends Controller {
  /** The Project the editor shows, whose Segments and Translation Glossary name the Speakers. */
  private project: ProjectView | null = null;

  follow({ detail }: CustomEvent<{ project: ProjectView | null }>): void {
    this.project = detail.project;
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
        ...speakerNames(this.project).map((name) =>
          speakerChoice(params.index, name, name, name === speaker),
        ),
        ...(speaker === ""
          ? []
          : [speakerChoice(params.index, "", t("edit.clearSpeaker"), false)]),
      );
  }

  choose({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { index: number };
  }): void {
    closeMenu(currentTarget);
    this.writeSpeaker(
      params.index,
      (currentTarget as HTMLElement).dataset.speaker ?? "",
    );
  }

  /** Names the Segment's Speaker as typed in its menu. */
  name({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { index: number };
  }): void {
    const name = (currentTarget as HTMLInputElement).value.trim();
    if (name === "") return;
    closeMenu(currentTarget);
    this.writeSpeaker(params.index, name);
  }

  /** Asks for `name` to be written as the Speaker of Segment `index`. */
  private writeSpeaker(index: number, name: string): void {
    this.dispatch("name", { detail: { index, name } });
  }
}

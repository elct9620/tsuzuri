import { Controller } from "@hotwired/stimulus";
import {
  DEFAULT_PREFERENCES,
  preferences,
  savePreferences,
  type ChoiceLanding,
  type ChoiceLandings,
  type Preferences,
} from "../backend/preferences";
import type { ChoiceSource } from "../editor";
import { t } from "../i18n";
import { iconElement } from "../ui/icons";
import { notifyFailure } from "../ui/notification";

/** Each Choice Source, in the order the Preferences tab lists them. */
const CHOICE_SOURCES = [
  "text",
  "time",
  "speaker",
  "row",
  "next",
  "region",
  "search",
] as const satisfies readonly ChoiceSource[];

/** Which half of a Choice Landing a switch turns. */
type LandingSwitch = keyof ChoiceLanding;

const LANDING_SWITCHES = [
  ["is_pausing", "preferences.pausing"],
  ["is_from_start", "preferences.fromStart"],
] as const satisfies readonly [LandingSwitch, string][];

/** A switch of the Choice Landing of `source`, inside a box as wide as its column's heading. */
function landingSwitch(
  source: ChoiceSource,
  half: LandingSwitch,
  label: string,
): HTMLElement {
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "toggle";
  toggle.dataset.choiceSource = source;
  toggle.dataset.landingSwitch = half;
  toggle.dataset.action = "change->preferences#save";
  toggle.setAttribute(
    "aria-label",
    t("preferences.switchLabel", {
      source: t(`preferences.sources.${source}`),
      column: t(label),
    }),
  );
  const box = document.createElement("span");
  box.className = "flex w-20 justify-center";
  box.append(toggle);
  return box;
}

/** The ⓘ telling when another Segment counts as chosen from `source`, as every setting has one. */
function sourceHelp(source: ChoiceSource): HTMLElement {
  const key = `preferences.sourcesHelp.${source}`;
  const help = document.createElement("span");
  help.tabIndex = 0;
  help.className = "cursor-help text-base-content/50";
  help.dataset.i18nTooltip = key;
  help.dataset.tooltip = t(key);
  help.append(iconElement("Info", "size-3.5"));
  return help;
}

/** The row of the Preferences tab for `source`: its name with its ⓘ, and its two switches. */
function landingRow(source: ChoiceSource): HTMLLIElement {
  const label = document.createElement("span");
  label.textContent = t(`preferences.sources.${source}`);
  const name = document.createElement("span");
  name.className = "list-col-grow flex items-center gap-1 font-medium";
  name.append(label, sourceHelp(source));
  const row = document.createElement("li");
  row.className = "list-row items-center";
  row.append(
    name,
    ...LANDING_SWITCHES.map(([half, label]) =>
      landingSwitch(source, half, label),
    ),
  );
  return row;
}

/** The Preferences tab of the settings, which saves each switch as it turns. */
export default class PreferencesController extends Controller {
  static targets = ["landings"];

  declare readonly landingsTarget: HTMLUListElement;

  async connect(): Promise<void> {
    this.landingsTarget.append(...CHOICE_SOURCES.map(landingRow));
    this.show(DEFAULT_PREFERENCES);
    try {
      this.show(await preferences());
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  }

  /** Saves the switches as they stand and tells the editor; a refusal shows the Preferences saved before. */
  async save(): Promise<void> {
    try {
      this.show(await savePreferences(this.switchedPreferences()));
      this.dispatch("saved");
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
      await this.showSaved();
    }
  }

  private async showSaved(): Promise<void> {
    try {
      this.show(await preferences());
    } catch {
      // The failure to save is already told
    }
  }

  /** The Preferences the switches stand for. */
  private switchedPreferences(): Preferences {
    const landings = Object.fromEntries(
      CHOICE_SOURCES.map((source) => [
        source,
        {
          is_pausing: this.switchBy(source, "is_pausing").checked,
          is_from_start: this.switchBy(source, "is_from_start").checked,
        },
      ]),
    ) as ChoiceLandings;
    return { choice_landings: landings };
  }

  private show({ choice_landings }: Preferences): void {
    for (const source of CHOICE_SOURCES)
      for (const [half] of LANDING_SWITCHES)
        this.switchBy(source, half).checked = choice_landings[source][half];
  }

  private switchBy(
    source: ChoiceSource,
    half: LandingSwitch,
  ): HTMLInputElement {
    return this.landingsTarget.querySelector<HTMLInputElement>(
      `[data-choice-source="${source}"][data-landing-switch="${half}"]`,
    )!;
  }
}

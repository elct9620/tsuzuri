<script lang="ts">
  import { onMount } from "svelte";

  import {
    DEFAULT_PREFERENCES,
    preferences,
    savePreferences,
    type ChoiceLanding,
    type ChoiceLandings,
    type Preferences,
  } from "../../backend/preferences";
  import type { ChoiceSource } from "../../editor";
  import { t } from "../../i18n";
  import { notifyFailure } from "../../ui/notification.svelte";
  import HelpButton from "./HelpButton.svelte";

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

  /** Each half of a Choice Landing a switch turns, with the heading of its column. */
  const LANDING_SWITCHES = [
    ["is_pausing", "preferences.pausing"],
    ["is_from_start", "preferences.fromStart"],
  ] as const satisfies readonly [keyof ChoiceLanding, string][];

  /** The Choice Landings the switches stand for, the defaults until the saved ones are read. */
  let landings = $state<ChoiceLandings>(
    structuredClone(DEFAULT_PREFERENCES.choice_landings),
  );

  onMount(async () => {
    try {
      show(await preferences());
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  });

  function show({ choice_landings }: Preferences): void {
    landings = choice_landings;
  }

  /** Saves the switches as they stand and tells the editor; a refusal shows the Preferences saved before. */
  async function save(): Promise<void> {
    try {
      show(
        await savePreferences({ choice_landings: $state.snapshot(landings) }),
      );
      window.dispatchEvent(new CustomEvent("preferences:saved"));
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
      await showSaved();
    }
  }

  async function showSaved(): Promise<void> {
    try {
      show(await preferences());
    } catch {
      // The failure to save is already told
    }
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("preferences.choosing")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center text-xs text-base-content/60">
      <span class="list-col-grow">
        <HelpButton tip="preferences.switchesHelp" class="text-inherit" />
      </span>
      {#each LANDING_SWITCHES as [half, column] (half)}
        <span class="w-20 text-center">{t(column)}</span>
      {/each}
    </li>
    {#each CHOICE_SOURCES as source (source)}
      <li class="list-row items-center">
        <span class="list-col-grow flex items-center gap-1 font-medium">
          <span>{t(`preferences.sources.${source}`)}</span>
          <HelpButton tip={`preferences.sourcesHelp.${source}`} />
        </span>
        {#each LANDING_SWITCHES as [half, column] (half)}
          <span class="flex w-20 justify-center">
            <input
              type="checkbox"
              class="toggle"
              aria-label={t("preferences.switchLabel", {
                source: t(`preferences.sources.${source}`),
                column: t(column),
              })}
              bind:checked={landings[source][half]}
              onchange={save}
            />
          </span>
        {/each}
      </li>
    {/each}
  </ul>
  <p class="label">{t("preferences.aloneHint")}</p>
</fieldset>

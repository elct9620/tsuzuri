<script lang="ts">
  import { onMount } from "svelte";

  import {
    DEFAULT_PREFERENCES,
    preferences as readPreferences,
    savePreferences,
    type ChoiceLanding,
    type ChoiceLandings,
    type Preferences,
  } from "#/ipc/preferences.ts";
  import type { ChoiceSource } from "#/editor/index.ts";
  import { t } from "#/i18n.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import { savedPreferences } from "#/state/context.ts";

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

  const id = $props.id();
  const preferences = savedPreferences();
  /** The Choice Landings the switches stand for, the defaults until the saved ones are read. */
  let landings = $state<ChoiceLandings>(
    structuredClone(DEFAULT_PREFERENCES.choice_landings),
  );

  onMount(async () => {
    await attempt(t("settings.unreadable"), async () => {
      show(await readPreferences());
    });
  });

  /** Shows `next` on the switches and hands it to the editor, which follows the Preferences saved. */
  function show(next: Preferences): void {
    landings = next.choice_landings;
    preferences.current = next;
  }

  /** Saves the switches as they stand; a refusal shows the Preferences saved before. */
  async function save(): Promise<void> {
    const isSaved = await attempt(t("settings.notSaved"), async () => {
      show(
        await savePreferences({
          ...preferences.current,
          choice_landings: $state.snapshot(landings),
        }),
      );
    });
    if (!isSaved) await showSaved();
  }

  async function showSaved(): Promise<void> {
    try {
      show(await readPreferences());
    } catch {
      // The failure to save is already told
    }
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("preferences.choosing")}</legend>
  <p class="label">{t("preferences.switchesHelp")}</p>
  <div class="overflow-x-auto rounded-box border border-base-300">
    <table class="table">
      <thead>
        <tr>
          <th><span class="sr-only">{t("settings.choosing")}</span></th>
          {#each LANDING_SWITCHES as [half, column] (half)}
            <th class="w-24 text-center">{t(column)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each CHOICE_SOURCES as source (source)}
          <tr>
            <th class="font-normal">
              <div class="font-medium">
                {t(`preferences.sources.${source}`)}
              </div>
              <div id="{id}-{source}" class="text-xs text-base-content/60">
                {t(`preferences.sourcesHelp.${source}`)}
              </div>
            </th>
            {#each LANDING_SWITCHES as [half, column] (half)}
              <td class="text-center">
                <input
                  type="checkbox"
                  class="toggle"
                  aria-label={t("preferences.switchLabel", {
                    source: t(`preferences.sources.${source}`),
                    column: t(column),
                  })}
                  aria-describedby="{id}-{source}"
                  bind:checked={landings[source][half]}
                  onchange={save}
                />
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="label">{t("preferences.aloneHint")}</p>
</fieldset>

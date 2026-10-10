<script lang="ts">
  import { onMount } from "svelte";

  import {
    preferences as readPreferences,
    savePreferences,
  } from "#/ipc/preferences.ts";
  import { locale } from "#/ipc/system.ts";
  import { INTERFACE_LANGUAGES, setInterfaceLanguage, t } from "#/i18n.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import { savedPreferences } from "#/state/context.ts";

  /** The option standing for no Interface Language chosen, which follows the system's. */
  const SYSTEM_LANGUAGE = "";

  const id = $props.id();
  const preferences = savedPreferences();
  const chosenLocale = $derived(
    preferences.current.interface_language ?? SYSTEM_LANGUAGE,
  );

  onMount(async () => {
    await attempt(t("settings.unreadable"), async () => {
      preferences.current = await readPreferences();
    });
  });

  /** Saves the language `select` shows and writes the interface in it; a refusal leaves both as they were. */
  async function choose(select: HTMLSelectElement): Promise<void> {
    const interfaceLanguage =
      select.value === SYSTEM_LANGUAGE ? null : select.value;
    const isSaved = await attempt(t("settings.notSaved"), async () => {
      preferences.current = await savePreferences({
        ...preferences.current,
        interface_language: interfaceLanguage,
      });
    });
    if (!isSaved) {
      select.value = chosenLocale;
      return;
    }
    await setInterfaceLanguage(interfaceLanguage ?? (await locale()));
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("preferences.language")}</legend>
  <select
    class="select select-sm"
    aria-label={t("preferences.language")}
    aria-describedby="{id}-help"
    value={chosenLocale}
    onchange={({ currentTarget }) => choose(currentTarget)}
  >
    <option value={SYSTEM_LANGUAGE}>{t("preferences.systemLanguage")}</option>
    {#each INTERFACE_LANGUAGES as { locale: code, name } (code)}
      <option value={code} lang={code}>{name}</option>
    {/each}
  </select>
  <p id="{id}-help" class="label whitespace-normal">
    {t("preferences.languageHelp")}
  </p>
</fieldset>

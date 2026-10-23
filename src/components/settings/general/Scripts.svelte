<!--
  @component
  The Scripts section: each Script in this machine's Scripts folder with what it registers, a Script
  that does not load marked with the reason, the folder to open, and a scan of every Script again.
-->
<script lang="ts">
  import { onMount } from "svelte";

  import {
    openScriptsDirectory,
    scanScripts,
    type ScannedScript,
  } from "#/ipc/scripts.ts";
  import { t } from "#/i18n.ts";
  import { scriptFailureMessage } from "#/ui/failure.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import SettingName from "#/components/settings/SettingName.svelte";

  let scripts = $state.raw<ScannedScript[]>([]);

  async function scan(isForced: boolean): Promise<void> {
    await attempt(t("script.unscanned"), async () => {
      scripts = await scanScripts(isForced);
    });
  }

  onMount(() => scan(false));

  async function openDirectory(): Promise<void> {
    await attempt(t("settings.scriptsNotOpened"), async () => {
      await openScriptsDirectory();
    });
  }

  /** What `script` registers, as counts of each kind. */
  function registrationSummary({ registrations }: ScannedScript): string {
    const macros = registrations.filter(({ kind }) => kind === "macro").length;
    const formats = registrations.length - macros;
    return t("settings.scriptRegistrations", { macros, formats });
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.scripts")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <SettingName name={t("settings.scripts")} tip="settings.scriptsHelp" />
      <span class="list-col-grow"></span>
      <button type="button" class="btn btn-sm" onclick={openDirectory}
        >{t("settings.openScripts")}</button
      >
      <button type="button" class="btn btn-sm" onclick={() => scan(true)}
        >{t("settings.scanScripts")}</button
      >
    </li>
  </ul>
  {#if scripts.length === 0}
    <p class="text-base-content/70">{t("settings.noScripts")}</p>
  {:else}
    <table class="table table-sm">
      <thead>
        <tr>
          <th>{t("settings.script")}</th>
          <th>{t("settings.scriptProvides")}</th>
        </tr>
      </thead>
      <tbody>
        {#each scripts as script (script.name)}
          <tr>
            <td class="font-mono text-xs">{script.name}</td>
            {#if script.failure !== null}
              <td class="text-error">{scriptFailureMessage(script.failure)}</td>
            {:else}
              <td>{registrationSummary(script)}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</fieldset>

<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
</script>

<fieldset class="fieldset text-sm" data-controller="preferences">
  <legend class="fieldset-legend" data-i18n="preferences.choosing"></legend>
  <ul
    class="list rounded-box border border-base-300"
    data-preferences-target="landings"
  >
    <li class="list-row items-center text-xs text-base-content/60">
      <span class="list-col-grow">
        <HelpButton tip="preferences.switchesHelp" class="text-inherit" />
      </span>
      <span class="w-20 text-center" data-i18n="preferences.pausing"></span>
      <span class="w-20 text-center" data-i18n="preferences.fromStart"></span>
    </li>
  </ul>
  <p class="label" data-i18n="preferences.aloneHint"></p>
</fieldset>

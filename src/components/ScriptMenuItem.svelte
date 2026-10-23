<!--
  @component
  One item a Script adds to a menu: what it registers, by its label, beside the Script it is in.
-->
<script lang="ts">
  interface Props {
    label: string;
    /** The file of the Script the item is in. */
    script: string;
    disabled: boolean;
    choose: (item: EventTarget | null) => void;
  }

  let { label, script, disabled, choose }: Props = $props();
</script>

<li>
  <button
    type="button"
    class="justify-between"
    {disabled}
    onclick={({ currentTarget }) => choose(currentTarget)}
    ><span>{label}</span><span class="text-xs opacity-60">{script}</span
    ></button
  >
</li>

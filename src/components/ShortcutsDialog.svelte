<!--
  @component
  The shortcut list: every shortcut of this platform, grouped by where it works, each explaining
  itself in its tooltip. It only tells; the keys are bound where they act.
-->
<script lang="ts">
  import { isMacOS } from "#/ipc/system.ts";
  import { isTextField } from "#/editor/index.ts";
  import { t } from "#/i18n.ts";
  import {
    SHORTCUTS,
    SHORTCUT_GROUPS,
    chords,
    isComposingKey,
    isShortcut,
    keyLabels,
  } from "#/ui/shortcuts.ts";

  let dialog: HTMLDialogElement;

  /** Every shortcut of the platform by group, with its keys as `isMac` writes them. */
  function shortcutGroups(isMac: boolean) {
    return SHORTCUT_GROUPS.map((group) => ({
      title: t(`shortcuts.groups.${group}`),
      rows: SHORTCUTS.filter((shortcut) => shortcut.group === group).map(
        (shortcut) => ({
          name: t(`shortcuts.names.${shortcut.id}`),
          tip: t(`shortcuts.hints.${shortcut.id}`),
          chordKeys: chords(shortcut, isMac).map((chord) =>
            keyLabels(chord, isMac),
          ),
        }),
      ),
    }));
  }

  /** The list as it was written when last opened, in the platform's keys and the Interface Language. */
  let groups = $state<ReturnType<typeof shortcutGroups>>([]);

  /** Whether `event` asks for the list: ⌘/ or Ctrl+/ anywhere, or ? where no text is typed. */
  function isListShortcut(event: KeyboardEvent): boolean {
    if (isComposingKey(event) || !isShortcut(event, "list", isMacOS()))
      return false;
    return event.ctrlKey || event.metaKey || !isTextField(event.target);
  }

  function openByShortcut(event: KeyboardEvent): void {
    if (!isListShortcut(event) || dialog.open) return;
    event.preventDefault();
    open();
  }

  export function open(): void {
    groups = shortcutGroups(isMacOS());
    dialog.showModal();
  }
</script>

<svelte:window onkeydown={openByShortcut} />

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box max-w-md">
    <h3 class="text-lg font-bold">{t("shortcuts.title")}</h3>
    {#each groups as { title, rows } (title)}
      <section>
        <h4 class="mt-3 mb-1 text-sm font-semibold text-base-content/70">
          {title}
        </h4>
        <ul>
          {#each rows as { name, tip, chordKeys } (name)}
            <li
              class="flex items-center justify-between gap-4 py-1"
              data-tooltip={tip}
            >
              <span>{name}</span>
              <span class="flex items-center gap-1 text-xs">
                {#each chordKeys as keys, index (index)}
                  {#if index > 0}{t("shortcuts.or").trim()}{/if}
                  <span class="flex gap-0.5">
                    {#each keys as key, keyIndex (keyIndex)}
                      <kbd class="kbd kbd-sm">{key}</kbd>
                    {/each}
                  </span>
                {/each}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.close")}</button>
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

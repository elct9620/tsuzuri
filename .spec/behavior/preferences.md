# Preferences

How Tsuzuri behaves as it is worked in, saved across launches and the same in every Project.

## Includes

- `src-tauri/src/preference.rs`
- `src/controllers/preferences_controller.test.ts`

## `PF-001` Remembering the Preferences

| Step | Statement |
| --- | --- |
| Given | the Preferences saved with a text chosen to play on |
| When | Tsuzuri launches again |
| Then | the Preferences read a text chosen to play on |

## `PF-002` Keeping the Choice Landings Tsuzuri always had

| Step | Statement |
| --- | --- |
| Given | no Preferences saved |
| When | the Preferences are read |
| Then | a text, a time, the row and a search pause at the Segment's start, and a Speaker, Enter and a region play on where they are |

## `PF-003` Showing the Preferences in their own tab

| Step | Statement |
| --- | --- |
| Given | the Preferences saved with a text chosen to play on |
| When | the settings are opened |
| Then | the Preferences tab shows a text neither pausing nor moving to the start, and a time doing both |

## `PF-004` Saving a switch as soon as it is turned

Each switch is saved as it turns, as the other settings are, so nothing waits on a button to be pressed.

| Step | Statement |
| --- | --- |
| Given | the Preferences tab showing the defaults |
| When | pausing is turned off for a text |
| Then | the Preferences are saved with a text not pausing and every other landing as it was |

## `PF-005` Telling the editor the Preferences changed

| Step | Statement |
| --- | --- |
| Given | the Preferences tab showing the defaults |
| When | pausing is turned off for a text and saved |
| Then | the editor is told the Preferences were saved, to follow them at once |

## `PF-006` Keeping the switches as saved when saving fails

| Step | Statement |
| --- | --- |
| Given | the Preferences tab showing the defaults, and saving refused |
| When | pausing is turned off for a text |
| Then | the switch shows pausing again, and a notification says the settings were not saved |

# Preferences

How Tsuzuri behaves as it is worked in, saved across launches and the same in every Project.

## Includes

- `src-tauri/src/preference.rs`

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

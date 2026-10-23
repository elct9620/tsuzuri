# Scripts

What a Script reads of the Current Resource and which Scripts Tsuzuri loads, so a user's Export Formats and Macros see every Language and only run against the API they were written for.

## Includes

- `src-tauri/src/script.rs`
- `src-tauri/src/script/*.rs`

## `SR-001` Giving a Script each Segment's text in every Language

A Segment change applies to the original and every translation alike, so a Script sees and returns them together.

| Step | Statement |
| --- | --- |
| Given | a `zh-TW` Segment `你好` whose `en` translation is `Hello` |
| When | the Snapshot is made |
| Then | the Segment's texts are `你好` under `zh-TW` and `Hello` under `en` |

## `SR-002` Leaving a blank translation out of the Snapshot

A blank translation already counts as none when a subtitle is written, so the Snapshot keeps the same rule.

| Step | Statement |
| --- | --- |
| Given | a `zh-TW` Segment whose `en` translation is only spaces |
| When | the Snapshot is made |
| Then | the Segment's texts hold `zh-TW` alone |

## `SR-003` Loading a Script that declares no API version

| Step | Statement |
| --- | --- |
| Given | a Script whose opening comments carry no `tsuzuri-api` |
| When | its API version is read |
| Then | it is taken as written for the app's current API version |

## `SR-004` Loading a Script written for an older minor version

| Step | Statement |
| --- | --- |
| Given | the app's script API at `1.0` and a Script opening with `# tsuzuri-api: 1.0` |
| When | whether it loads is checked |
| Then | it loads |

## `SR-005` Refusing a Script written for a newer minor version

A newer minor version may call what this app does not offer yet.

| Step | Statement |
| --- | --- |
| Given | the app's script API at `1.0` and a Script opening with `# tsuzuri-api: 1.1` |
| When | whether it loads is checked |
| Then | it does not load |

## `SR-006` Refusing a Script written for another major version

| Step | Statement |
| --- | --- |
| Given | the app's script API at `1.0` and a Script opening with `# tsuzuri-api: 2.0` |
| When | whether it loads is checked |
| Then | it does not load |

## `SR-007` Reading the API version only from the opening comments

The declaration is read before the Script runs, so only the comments it opens with count, as Ruby's magic comments do.

| Step | Statement |
| --- | --- |
| Given | a Script whose first line is code and whose later comment reads `# tsuzuri-api: 2.0` |
| When | its API version is read |
| Then | it is taken as written for the app's current API version |

## `SR-008` Refusing a Script whose API version cannot be read

| Step | Statement |
| --- | --- |
| Given | a Script opening with `# tsuzuri-api: one` |
| When | its API version is read |
| Then | it fails naming the declaration it could not read |

## `SR-009` Offering what a Script registers

| Step | Statement |
| --- | --- |
| Given | a Script registering the Macro `merge_runs` labelled `合併連續發言` and the Export Format `tsv_numbered` saved as `tsv` |
| When | it is loaded |
| Then | it offers the Macro and the Export Format under their labels, in that order |

## `SR-010` Writing the text an Export Format makes

An Export Format takes over the whole output, so what it returns is what is saved, character for character.

| Step | Statement |
| --- | --- |
| Given | an Export Format writing each Segment's `zh-TW` text after its number counted as `%03d` and its length in characters |
| When | it writes a Snapshot holding `你好` |
| Then | the text is `001 你好 2` |

## `SR-011` Handing back the Segments each edit of a Macro returns

| Step | Statement |
| --- | --- |
| Given | a Macro whose edit merges two Segments of one Speaker into one, joining their texts with `，` |
| When | it runs on those two Segments |
| Then | its one edit holds one Segment from the first start to the last end with the joined text |

## `SR-012` Refusing an edit that returns something other than Segments

| Step | Statement |
| --- | --- |
| Given | a Macro whose edit returns a String |
| When | it runs |
| Then | it fails saying an edit returns an Array of `Tsuzuri::Segment` or `nil` |

## `SR-013` Naming the error a Script raises

| Step | Statement |
| --- | --- |
| Given | a Script raising `boom` at its top level |
| When | it is loaded |
| Then | it fails with the message `boom` |

## `SR-014` Reaching no file from a Script

The interpreter holds no I/O, so a Script reading a file cannot run, whoever wrote it.

| Step | Statement |
| --- | --- |
| Given | a Script reading a file with `File.read` |
| When | it is loaded |
| Then | it fails, `File` being unknown |

## `SR-015` Running a Script apart from the app

A Script that hangs or crashes ends only its own process, and leaves its result in a file the app reads.

| Step | Statement |
| --- | --- |
| Given | a Script registering one Macro |
| When | the app starts itself as `script scan <script.rb> <registrations.json>` |
| Then | it exits with 0 and the file lists the Macro |

## `SR-016` Reporting a Script that fails as a child of the app

| Step | Statement |
| --- | --- |
| Given | a Script raising `boom` at its top level |
| When | the app starts itself as `script scan` on it |
| Then | it exits with 1 and writes `boom` to its error output |

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

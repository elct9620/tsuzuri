# Scripts

What a Script reads of the Current Resource and which Scripts Tsuzuri loads, so a user's Export Formats and Macros see every Language and only run against the API they were written for.

## Includes

- `src-tauri/src/script.rs`
- `src-tauri/src/script/*.rs`
- `src-tauri/src/project/current/tests/script_behavior.rs`
- `src/ui/failure.test.ts`
- `examples/scripts/*.rb`
- `src/components/MacroMenu.test.ts`
- `src/components/ExportMenu.test.ts`
- `src/components/settings/general/Scripts.test.ts`

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

## `SR-017` Making the Snapshot of the Current Resource

| Step | Statement |
| --- | --- |
| Given | a Resource whose `zh-TW` Segments `你好` and `世界` have the `en` translations `Hello` and `world` |
| When | the Snapshot of the Current Resource is made |
| Then | it lists `zh-TW` then `en`, and each Segment holds its text in both |

## `SR-018` Writing back the Segments an edit returns

An edit returns the whole list, so it may merge, split or reorder Segments without tracking positions; each translation follows as it does for a Segment Change.

| Step | Statement |
| --- | --- |
| Given | a Resource with `zh-TW` Segments `你好` and `世界` translated `Hello` and `world` |
| When | an edit returns one Segment over both, with `你好，世界` in `zh-TW` and `Hello, world` in `en` |
| Then | the original and the translation each hold that one Segment |

## `SR-019` Undoing an edit in one step

| Step | Statement |
| --- | --- |
| Given | an edit written back over a Resource and its translation |
| When | the change is undone once |
| Then | the original and the translation are as they were before the edit |

## `SR-020` Dropping a translation of a Segment the edit leaves without one

| Step | Statement |
| --- | --- |
| Given | a Resource with a `zh-TW` Segment translated `Hello` |
| When | an edit returns that Segment with only its `zh-TW` text |
| Then | the translation file holds no cue for it |

## `SR-021` Refusing a Segment that ends before it starts

Nothing is written when any Segment breaks a rule, so no edit is left half done.

| Step | Statement |
| --- | --- |
| Given | an edit returning a Segment from 2 s to 1 s |
| When | it is written back |
| Then | it fails naming the first Segment, and the subtitles stay as they were |

## `SR-022` Refusing Segments out of the order they start in

| Step | Statement |
| --- | --- |
| Given | an edit returning a Segment starting at 2 s before one starting at 1 s |
| When | it is written back |
| Then | it fails naming the second Segment, and the subtitles stay as they were |

## `SR-023` Refusing a text in a Language the Resource has no subtitle in

A Script cannot start a translation; that stays the Translate Mode's.

| Step | Statement |
| --- | --- |
| Given | a Resource with only a `zh-TW` subtitle |
| When | an edit returns a Segment with a `ja` text |
| Then | it fails naming `ja`, and the subtitles stay as they were |

## `SR-024` Naming the Segment a Script returned that breaks a rule

A Script's author fixes the Script, so the message points at the Segment by its place in what the Script returned.

| Step | Statement |
| --- | --- |
| Given | an edit refused because its second Segment starts before the first |
| When | the failure is shown |
| Then | it names Segment 2 and says nothing was written |

## `SR-025` Listing what each Script on this machine registers

| Step | Statement |
| --- | --- |
| Given | `a.rb` registering the Macro `merge_runs` and `b.rb` raising `boom` in the Scripts folder |
| When | the Scripts are scanned |
| Then | `a.rb` offers `merge_runs`, and `b.rb` offers nothing and fails with `boom` |

## `SR-026` Loading a Script again only once it changes

Menus scan as they open, so an unchanged Script is not run again each time.

| Step | Statement |
| --- | --- |
| Given | a Script already scanned |
| When | the Scripts are scanned again without a change to it |
| Then | no script Step starts |

## `SR-027` Leaving a Script written for a newer API unrun

| Step | Statement |
| --- | --- |
| Given | a Script opening with `# tsuzuri-api: 2.0` |
| When | the Scripts are scanned |
| Then | it fails naming `2.0`, and no script Step starts |

## `SR-028` Stopping a Script that takes over a second to load

Nobody waits on a scan to cancel it, so a Script that hangs is stopped and marked instead.

| Step | Statement |
| --- | --- |
| Given | a Script whose script Step does not end |
| When | the Scripts are scanned |
| Then | after a second its Step is stopped and the Script fails as timed out |

## `SR-029` Holding every subtitle while a Macro runs

| Step | Statement |
| --- | --- |
| Given | a Macro running on the Current Resource |
| When | a Segment Change is asked for |
| Then | it is refused as `mode-running` |

## `SR-030` Running a Macro on the Current Resource

| Step | Statement |
| --- | --- |
| Given | a Resource with Segments `你好` and `世界` of one Speaker, and a Macro merging a Speaker's run with `，` |
| When | the Macro runs |
| Then | the subtitle holds one Segment `你好，世界` |

## `SR-031` Writing the text of an Export Format

| Step | Statement |
| --- | --- |
| Given | an Export Format writing each Segment's text on its own line |
| When | it runs on a Resource with Segments `你好` and `世界` |
| Then | the text is `你好` and `世界` on two lines |

## `SR-032` Refusing a Script name that reaches outside the Scripts folder

| Step | Statement |
| --- | --- |
| Given | the Script name `../settings.json` |
| When | a Macro of it is asked to run |
| Then | it is refused before anything runs |

## `SR-033` Listing each Macro beside the Script it is in

| Step | Statement |
| --- | --- |
| Given | `interview.rb` registering the Macro labelled `合併連續發言` |
| When | the Macros menu is drawn |
| Then | it lists `合併連續發言` beside `interview.rb` |

## `SR-034` Leaving the Macros menu out while no Script registers a Macro

| Step | Statement |
| --- | --- |
| Given | Scripts registering only Export Formats |
| When | the resource bar is drawn |
| Then | it has no Macros menu |

## `SR-035` Running a Macro with the Checked Segments

The Segments a Macro writes move, so the positions checked no longer point at them afterwards.

| Step | Statement |
| --- | --- |
| Given | the second Segment checked |
| When | a Macro is chosen from the Macros menu |
| Then | it runs with that Segment's position, and no Segment stays checked |

## `SR-036` Saving the text of an Export Format

| Step | Statement |
| --- | --- |
| Given | an Export Format labelled `TSV（編號）` saved as `tsv`, and blank lines between blocks turned off |
| When | it is chosen from the Export menu |
| Then | the save dialog opens at the Resource's name ending in `.tsv`, and the format runs without blank lines |

## `SR-037` Listing the Scripts in the settings

A Script that does not load says why, so its author can fix it.

| Step | Statement |
| --- | --- |
| Given | `interview.rb` registering one Macro and one Export Format, and `broken.rb` written for `tsuzuri-api 2.0` |
| When | the Scripts section opens |
| Then | `interview.rb` shows what it registers, and `broken.rb` shows in red that this version does not offer `2.0` |

## `SR-038` Scanning every Script again from the settings

| Step | Statement |
| --- | --- |
| Given | the Scripts section open |
| When | the scan is asked for again |
| Then | every Script is loaded again, changed or not |

## `SR-039` Merging a Speaker's runs with the example Macro

The examples answer the requests the script API was made for, so they are run as a user would run them.

| Step | Statement |
| --- | --- |
| Given | `examples/scripts/merge_runs.rb`, and Segments `內容A` and `內容B` of `Speaker 1` then `內容C` of `Speaker 2` |
| When | its Macro runs |
| Then | the subtitle holds `內容A，內容B` of `Speaker 1` then `內容C` of `Speaker 2` |

## `SR-040` Numbering each Speaker's Segments with the example Export Format

| Step | Statement |
| --- | --- |
| Given | `examples/scripts/tsv_numbered.rb`, and Segments of `Speaker 1`, `Speaker 2`, then `Speaker 1` |
| When | its Export Format writes them with Speakers |
| Then | the rows after the header start `Speaker 1-001`, `Speaker 2-001` and `Speaker 1-002`, each followed by a tab and its text |

## `SR-041` Showing a Macro added while the app is open

The Macros menu is not drawn while no Script registers a Macro, so it cannot be opened to read the Scripts again; coming back to the window from the file manager does.

| Step | Statement |
| --- | --- |
| Given | the app open with no Script registering a Macro |
| When | a Script registering one is added and the window comes back into focus |
| Then | the Macros menu appears |

## `SR-042` Telling every menu of what a scan found

The settings, the Macros menu and the Export menu each read the Scripts, so a scan asked from one shows in all of them.

| Step | Statement |
| --- | --- |
| Given | the Macros menu hidden, as no Script registered a Macro |
| When | the Scripts section scans again and finds a Script registering one |
| Then | the Macros menu appears |

## `SR-043` Announcing a scan only when it finds something else

A menu reads the Scripts again when told, so an announcement for an unchanged scan would only repeat the reading.

| Step | Statement |
| --- | --- |
| Given | a Script already scanned |
| When | the Scripts are scanned again, unchanged and then changed |
| Then | only the second scan announces `scripts-changed` |


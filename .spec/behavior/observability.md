# Observability

What a run leaves in the log, so a slow or failed run can be diagnosed afterwards - from the terminal under `cargo tauri dev`, and from the log directory of an installed app, where nothing else records it - and the App Build a report names.

## Includes

- `src-tauri/src/timing.rs`
- `src-tauri/src/processes.rs`
- `src-tauri/src/logs.rs`
- `src-tauri/src/translation/llama.rs`
- `src/controllers/logs_controller.test.ts`
- `src-tauri/src/about.rs`
- `src/controllers/about_controller.test.ts`

## `OB-001` Logging how long a Phase took

| Step | Statement |
| --- | --- |
| Given | a Mode run in one Phase |
| When | the run moves on to its next Phase |
| Then | the log holds a line naming the Mode, the finished Phase and its seconds |

## `OB-002` Answering the duration of every Phase

| Step | Statement |
| --- | --- |
| Given | a Mode run that passed through two Phases |
| When | the run finishes |
| Then | it answers each Phase with its seconds, in the order they ran |

## `OB-003` Logging a Component's output

| Step | Statement |
| --- | --- |
| Given | a launched Component process |
| When | it writes a line to stderr |
| Then | the log holds that line under the executable's name |

## `OB-004` Writing the log to the OS log directory until another is chosen

| Step | Statement |
| --- | --- |
| Given | log settings that choose no directory |
| When | the app starts |
| Then | the log is written to the OS log directory of the app |

## `OB-005` Writing the log to the chosen directory from the next launch

| Step | Statement |
| --- | --- |
| Given | log settings that choose `/logs` |
| When | the app starts |
| Then | the log is written to `/logs` |

## `OB-006` Remembering the chosen log directory across launches

| Step | Statement |
| --- | --- |
| Given | `/logs` chosen as the log directory |
| When | the log settings are read again |
| Then | they choose `/logs` |

## `OB-007` Choosing the log directory in the settings

| Step | Statement |
| --- | --- |
| Given | the general settings |
| When | a directory is chosen for the log |
| Then | it is recorded as the log directory, and the settings say it takes effect after a restart |

## `OB-010` Naming the directory the log moves to after a restart

| Step | Statement |
| --- | --- |
| Given | the general settings, with the log written to `/os/logs` |
| When | `/logs` is chosen for the log |
| Then | the settings say the log is written to `/logs` after a restart |

## `OB-011` Saying nothing of a restart while the chosen directory is in use

| Step | Statement |
| --- | --- |
| Given | the log written to `/os/logs`, the directory chosen for it |
| When | the general settings open |
| Then | the settings say nothing of a restart |

## `OB-012` Telling on opening the settings of a directory waiting for a restart

A directory chosen earlier in this launch takes effect only at the next, so the settings keep saying so each time they open.

| Step | Statement |
| --- | --- |
| Given | the log written to `/os/logs`, with `/logs` chosen for the next launch |
| When | the general settings open |
| Then | the settings say the log is written to `/logs` after a restart |

## `OB-008` Opening the log directory

| Step | Statement |
| --- | --- |
| Given | the general settings |
| When | opening the log directory is chosen |
| Then | the directory the log is written to now is opened |

## `OB-009` Falling back to the OS log directory when the chosen one cannot be made

| Step | Statement |
| --- | --- |
| Given | log settings that choose a directory which can no longer be made, as on a drive gone |
| When | the app starts |
| Then | the log is written to the OS log directory of the app |

## `OB-013` Naming the commit a build was made from

| Step | Statement |
| --- | --- |
| Given | Tsuzuri built from a commit of its repository |
| When | the App Build is asked for |
| Then | it answers the release number Cargo.toml carries and that commit |

## `OB-014` Showing the App Build in the settings

| Step | Statement |
| --- | --- |
| Given | the general settings open |
| When | the App Build is answered |
| Then | they show the Release Name and the commit's first seven characters first |

## `OB-015` Copying the App Build for a report

| Step | Statement |
| --- | --- |
| Given | the App Build shown in the settings |
| When | copying it is chosen |
| Then | the clipboard holds Tsuzuri, the Release Name and the short commit, as `Tsuzuri v0.2.0 (a1b2c3d)`, and a Notification says it was copied |

## `OB-016` Leaving the Debug Log out until it is turned on

| Step | Statement |
| --- | --- |
| Given | log settings never saved |
| When | the app starts |
| Then | Tsuzuri writes no line below info into the log |

## `OB-017` Writing the Debug Log from the next launch

| Step | Statement |
| --- | --- |
| Given | log settings that turn the Debug Log on |
| When | the app starts |
| Then | Tsuzuri writes its debug lines into the log, while other libraries still write from info up |

## `OB-018` Remembering the Debug Log across launches

| Step | Statement |
| --- | --- |
| Given | the Debug Log turned on |
| When | the log settings are read again |
| Then | they turn the Debug Log on |

## `OB-019` Keeping the Debug Log when the log directory is chosen

| Step | Statement |
| --- | --- |
| Given | the Debug Log turned on |
| When | a directory is chosen for the log |
| Then | the log settings still turn the Debug Log on |

## `OB-020` Turning the Debug Log on in the settings

| Step | Statement |
| --- | --- |
| Given | the general settings, with the Debug Log off in this launch |
| When | the Debug Log is turned on |
| Then | it is recorded for the next launch, and the settings say it takes effect after a restart |

## `OB-021` Saying nothing of a restart while the Debug Log is as chosen

| Step | Statement |
| --- | --- |
| Given | the Debug Log on in this launch and chosen for the next |
| When | the general settings open |
| Then | the Debug Log shows on and the settings say nothing of a restart |

## `OB-022` Logging how a Component was started and how it ended

| Step | Statement |
| --- | --- |
| Given | a Component process |
| When | it is started and then exits |
| Then | the debug lines name its executable with the arguments it was given, and its exit code |

## `OB-023` Logging what llama-server was asked and answered

| Step | Statement |
| --- | --- |
| Given | a running llama-server |
| When | it is asked for an answer |
| Then | the debug lines hold the task, the message it was sent and the content it answered |

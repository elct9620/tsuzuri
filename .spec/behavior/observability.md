# Observability

What a run leaves in the log, so a slow or failed run can be diagnosed afterwards - from the terminal under `cargo tauri dev`, and from the log directory of an installed app, where nothing else records it.

## Includes

- `src-tauri/src/timing.rs`
- `src-tauri/src/processes.rs`
- `src-tauri/src/logs.rs`
- `src/controllers/logs_controller.test.ts`

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


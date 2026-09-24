# Observability

What a run leaves in the log, so a slow or failed run can be diagnosed afterwards - from the terminal under `cargo tauri dev`, and from the log directory of an installed app, where nothing else records it.

## Includes

- `src-tauri/src/timing.rs`
- `src-tauri/src/processes.rs`

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

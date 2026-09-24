# Processes

Launching Components as child processes so that none outlives the app: those alive at a normal exit are killed then, and those a crash leaves behind are killed on the next launch.

## Includes

- `src-tauri/src/processes.rs`

## `PR-001` Recording a launched process

| Step | Statement |
| --- | --- |
| Given | a Component executable |
| When | it is launched |
| Then | its PID and executable name are in the process record |

## `PR-002` Killing processes at exit

| Step | Statement |
| --- | --- |
| Given | a launched Component process still running |
| When | the app exits |
| Then | the process is no longer running |

## `PR-003` Killing a Stray Process at launch

| Step | Statement |
| --- | --- |
| Given | a process record naming a process that is still running under the recorded name |
| When | the app launches |
| Then | the process is no longer running |

## `PR-004` Sparing a process that reused a recorded PID

| Step | Statement |
| --- | --- |
| Given | a process record naming a PID now held by a process with another name |
| When | the app launches |
| Then | that process keeps running |

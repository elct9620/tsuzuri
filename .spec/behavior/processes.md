# Processes

Launching Components as child processes so that none outlives the app: those alive at a normal exit are killed then, and those a crash leaves behind are killed on the next launch.

## Includes

- `src-tauri/src/processes.rs`
- `src-tauri/src/steps.rs`

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

## `PR-005` Delivering all output before the exit status

| Step | Statement |
| --- | --- |
| Given | a Component that writes many lines to stderr and exits at once |
| When | it is launched |
| Then | every line arrives before its exit status |

## `PR-006` Running one Mode at a time

A second Mode waits rather than unloading or stopping the Model the first one is using.

| Step | Statement |
| --- | --- |
| Given | a Mode running |
| When | another Mode waits for its turn |
| Then | it starts only once the first one has ended |


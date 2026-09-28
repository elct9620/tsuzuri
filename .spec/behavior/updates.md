# Updates

How Tsuzuri finds an App Update and installs it: looking for one at launch or when asked, never installing without the user's say, and never while a Mode runs.

## Includes

- `src-tauri/src/updates.rs`
- `src-tauri/src/steps.rs`

## `UP-001` Finding a newer release

| Step | Statement |
| --- | --- |
| Given | an update manifest announcing a release newer than the App Build |
| When | Tsuzuri looks for an App Update |
| Then | it answers that release's number |

## `UP-002` Finding nothing when the running release is the latest

| Step | Statement |
| --- | --- |
| Given | an update manifest announcing the App Build's own release |
| When | Tsuzuri looks for an App Update |
| Then | it answers that there is none |

## `UP-003` Looking at launch until turned off

| Step | Statement |
| --- | --- |
| Given | update settings never saved |
| When | the update settings are read |
| Then | they look for an App Update at launch |

## `UP-004` Not looking at launch once turned off

| Step | Statement |
| --- | --- |
| Given | looking at launch turned off in the update settings |
| When | Tsuzuri launches |
| Then | the update manifest is not asked for, and there is no App Update |

## `UP-005` Staying silent when the launch check fails

| Step | Statement |
| --- | --- |
| Given | an update manifest that cannot be reached |
| When | Tsuzuri looks for an App Update at launch |
| Then | it answers that there is none and only the log records why |

## `UP-006` Failing a check asked for when the releases cannot be reached

| Step | Statement |
| --- | --- |
| Given | an update manifest that cannot be reached |
| When | About asks for an App Update |
| Then | it fails as `update-failed` with what went wrong |

## `UP-007` Refusing to install while a Mode runs

| Step | Statement |
| --- | --- |
| Given | an App Update found while a Mode runs |
| When | it is asked to be installed |
| Then | it is refused as `update-during-mode` and nothing is downloaded |

## `UP-008` Refusing to install before an App Update is found

| Step | Statement |
| --- | --- |
| Given | no App Update found in this launch |
| When | one is asked to be installed |
| Then | it is refused as `no-update` |

## `UP-009` Stopping every Component before installing

| Step | Statement |
| --- | --- |
| Given | an App Update found while a Component runs |
| When | it is installed |
| Then | it is downloaded first, every Component is stopped, and only then is it installed |

## `UP-010` Keeping a Mode from starting while installing

| Step | Statement |
| --- | --- |
| Given | an App Update being installed |
| When | a Mode is asked to run |
| Then | it waits until the install ends |

## `UP-011` Reporting how much has downloaded

| Step | Statement |
| --- | --- |
| Given | an App Update being downloaded |
| When | each whole percent of it arrives, or each MiB when its size is unknown |
| Then | `update-progress` carries the bytes received so far and the size when the release names it |

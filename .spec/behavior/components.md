# Components

Finding every Component the running platform needs before a Mode runs: the path the user chose, else one found by Detection, else the Bundled Variant. Nothing is downloaded.

## Includes

- `src-tauri/src/components.rs`
- `src-tauri/src/components/**/*.rs`
- `src/controllers/components_controller.test.ts`

## `CP-005` Telling how to install a Component that cannot be found

| Step | Statement |
| --- | --- |
| Given | a Component that was not chosen, is not found by Detection and has no Bundled Variant |
| When | its status is read |
| Then | it reads as missing with how to install it |

## `CP-007` Showing a ready Component

| Step | Statement |
| --- | --- |
| Given | a Component whose executable is in place |
| When | the components panel loads |
| Then | its status reads as ready |

## `CP-009` Using the executable the user chose

| Step | Statement |
| --- | --- |
| Given | an executable the user chose for a Component |
| When | its status is read |
| Then | it reads as ready at the chosen path |

## `CP-010` Detecting an installed executable

| Step | Statement |
| --- | --- |
| Given | no executable chosen and one in a Detection directory that answers its version flag |
| When | its status is read |
| Then | it reads as ready at the detected path |

## `CP-011` Passing over an executable that does not run

| Step | Statement |
| --- | --- |
| Given | a Detection directory holding a file of the Component's name that fails its version flag |
| When | its status is read |
| Then | that file is not taken |

## `CP-013` Choosing a Component's executable

| Step | Statement |
| --- | --- |
| Given | the components panel |
| When | an executable is chosen for a Component |
| Then | its status shows the chosen path |

## `CP-014` Reporting a Bundled Variant that does not run

| Step | Statement |
| --- | --- |
| Given | a Bundled Variant whose executable fails its version flag, as when a driver or system library it needs is missing |
| When | its status is read |
| Then | it reads as not ready and says the executable does not run |

## `CP-015` Using the Bundled Variant

| Step | Statement |
| --- | --- |
| Given | no executable chosen, none found by Detection, and a Bundled Variant that answers its version flag |
| When | its status is read |
| Then | it reads as ready at the bundled path |

## `CP-016` Logging how long finding a Component took

| Step | Statement |
| --- | --- |
| Given | a Component found by Detection |
| When | its status is found |
| Then | the log holds a line naming the Component, where it was found and the seconds it took |

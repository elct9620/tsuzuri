# Components

Finding every Component the running platform needs before a Mode runs: the path the user chose, else one found by Detection, else the Bundled Variant Auto-Selection takes. Nothing is downloaded.

## Includes

- `src-tauri/src/toolchain.rs`
- `src-tauri/src/toolchain/*.rs`
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

## `CP-020` Returning a Component to its default

| Step | Statement |
| --- | --- |
| Given | an executable the user chose for a Component that also has a Bundled Variant |
| When | the choice is forgotten |
| Then | it reads as ready at the bundled path |

## `CP-021` Restoring a Component's default from the components panel

| Step | Statement |
| --- | --- |
| Given | the components panel with an executable chosen for a Component |
| When | its default is restored |
| Then | its status shows where it is found without the choice |

## `CP-022` Offering the default only for a chosen executable

| Step | Statement |
| --- | --- |
| Given | a Component found by Detection |
| When | the components panel loads |
| Then | it offers no restoring of the default |

## `CP-023` Showing a Placeholder while Components are found

Finding a Component runs it, which takes a moment on first use.

| Step | Statement |
| --- | --- |
| Given | the components panel whose statuses are still being found |
| When | it shows |
| Then | each status is a Placeholder |

## `CP-014` Reporting Bundled Variants that do not run

| Step | Statement |
| --- | --- |
| Given | Bundled Variants whose executables all fail their version flag, as when a driver or system library they need is missing |
| When | its status is read |
| Then | it reads as not ready and says the executable does not run |

## `CP-015` Using the Bundled Variant

| Step | Statement |
| --- | --- |
| Given | no executable chosen, none found by Detection, and a Bundled Variant that answers its version flag |
| When | its status is read |
| Then | it reads as ready at the bundled path, naming its Variant |

## `CP-017` Passing over a Bundled Variant that does not run

| Step | Statement |
| --- | --- |
| Given | no executable chosen and none found by Detection |
| Given | a first Bundled Variant that fails its version flag and a second that answers it |
| When | its status is read |
| Then | it reads as ready at the second Variant's path |

## `CP-018` Trying Bundled Variants in the Build Manifest's order

| Step | Statement |
| --- | --- |
| Given | no executable chosen and none found by Detection |
| Given | two Bundled Variants that both answer their version flag |
| When | its status is read |
| Then | it reads as ready at the Variant the Build Manifest lists first |

## `CP-019` Showing the Variant Auto-Selection took

| Step | Statement |
| --- | --- |
| Given | a Component ready as a Bundled Variant |
| When | the components panel loads |
| Then | its status names the Variant |

## `CP-016` Logging how long finding a Component took

| Step | Statement |
| --- | --- |
| Given | a Component found by Detection |
| When | its status is found |
| Then | the log holds a line naming the Component, where it was found and the seconds it took |

# Components

Getting every Component the running platform needs ready before a Mode runs: the path the user chose, else one found by Detection, else one downloaded, checked and unpacked into app data once.

## Includes

- `src-tauri/src/components.rs`
- `src-tauri/src/components/**/*.rs`
- `src/controllers/components_controller.test.ts`

## `CP-001` Installing a missing Component

| Step | Statement |
| --- | --- |
| Given | a downloaded Component that is not installed |
| When | it is installed |
| Then | its executable exists at the path the Manifest names inside the Component's directory |

## `CP-002` Skipping an installed Component

| Step | Statement |
| --- | --- |
| Given | a downloaded Component installed from the archives its Manifest entry pins |
| When | it is installed again |
| Then | no archive is requested |

## `CP-003` Resuming an interrupted download

| Step | Statement |
| --- | --- |
| Given | an archive whose download stopped partway, leaving its first bytes on disk |
| When | the Component is installed |
| Then | the archive is requested from the first byte not yet on disk |

## `CP-004` Refusing an archive that does not match its hash

| Step | Statement |
| --- | --- |
| Given | an archive whose SHA256 differs from its Manifest entry |
| When | the Component is installed |
| Then | the install fails and the Component still reads as not installed |

## `CP-005` Telling how to install a Component that cannot be found

| Step | Statement |
| --- | --- |
| Given | an external Component that was not chosen and is not found by Detection |
| When | its status is read |
| Then | it reads as missing with how to install it |

## `CP-006` Showing download progress

| Step | Statement |
| --- | --- |
| Given | a Component being downloaded |
| When | a progress event arrives for it |
| Then | its status shows the downloaded percentage |

## `CP-007` Showing a ready Component

| Step | Statement |
| --- | --- |
| Given | a Component whose executable is in place |
| When | the components panel loads |
| Then | its status reads as ready |

## `CP-008` Showing a failed download

| Step | Statement |
| --- | --- |
| Given | a Component being downloaded |
| When | the install fails |
| Then | its status says the download failed and resumes on the next launch |

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

## `CP-012` Not downloading a Component already found

| Step | Statement |
| --- | --- |
| Given | a downloadable Component found by Detection |
| When | Components are installed |
| Then | no archive is requested |

## `CP-013` Choosing a Component's executable

| Step | Statement |
| --- | --- |
| Given | the components panel |
| When | an executable is chosen for a Component |
| Then | its status shows the chosen path |

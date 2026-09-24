# Components

Getting every Component the running platform needs ready before a Mode runs: downloaded ones fetched, checked and unpacked into app data once, vendored ones found under `vendor/`.

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

## `CP-005` Reporting a Vendored Component that was never built

| Step | Statement |
| --- | --- |
| Given | a Vendored Component whose executable is absent from `vendor/` |
| When | its status is read |
| Then | it reads as missing with a hint to run `scripts/vendor.sh` |

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

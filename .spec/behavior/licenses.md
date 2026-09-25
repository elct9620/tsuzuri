# Licenses

Which licenses the packages the webview bundles may carry, and the notice every build ships with their texts, so the app keeps each license's terms beside the Rust crates' own.

## Includes

- `scripts/webview-licenses.test.ts`

## `LC-001` Accepting a package under a license the project accepts

| Step | Statement |
| --- | --- |
| Given | the licenses accepted for Rust crates, among them `MIT` |
| When | a package under `Apache-2.0 OR MIT` is checked |
| Then | it is accepted, since one of its choices is |

## `LC-002` Refusing a package under a license the project does not accept

| Step | Statement |
| --- | --- |
| Given | the licenses accepted for Rust crates, without `GPL-3.0` |
| When | a package under `GPL-3.0` is checked |
| Then | the check fails naming the package and its license |

## `LC-003` Carrying each bundled package's license text into the notice

| Step | Statement |
| --- | --- |
| Given | `lucide` 1.48.0 under `ISC`, with its license file |
| When | the notice is written |
| Then | it names `lucide` 1.48.0 and `ISC` beside the text of that file |

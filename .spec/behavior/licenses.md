# Licenses

Which licenses the packages the webview bundles may carry, and the License Notice each build writes with every text Tsuzuri ships, so the app keeps each license's terms beside the work it covers.

## Includes

- `scripts/licenses.test.ts`
- `src/components/settings/general/About.test.ts`

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
| When | the License Notice is written |
| Then | it names `lucide` 1.48.0 and `ISC` beside the text of that file |

## `LC-011` Leaving out a package only the build uses

The packages come from what the bundle carries, not from what the dependencies declare: a compiler that turns components into the bundle's code does not ship.

| Step | Statement |
| --- | --- |
| Given | a webview importing `kept`, beside an installed `build-only` it never imports |
| When | the webview is bundled |
| Then | the packages listed for the License Notice name `kept` and not `build-only` |

## `LC-012` Naming who wrote a package that ships no license text

A package can state its license in its manifest without shipping the text. Its author and repository stand in for the copyright line the text would carry.

| Step | Statement |
| --- | --- |
| Given | `is-reference` 3.0.3 under `MIT` by Rich Harris, from its repository, shipping no license file |
| When | the License Notice is written |
| Then | it names `is-reference` 3.0.3 and `MIT` beside its author and repository, without a license text |

## `LC-004` Opening the notice with Tsuzuri's own license

| Step | Statement |
| --- | --- |
| Given | Tsuzuri's `LICENSE` holding the Apache License 2.0 |
| When | the License Notice is written |
| Then | its first section is Tsuzuri under that text |

## `LC-005` Carrying the licenses a Bundled Variant keeps

A Bundled Variant keeps, beside its programs, the license files of everything they carry, one directory per project.

| Step | Statement |
| --- | --- |
| Given | the `metal` Variant of `llama` at `b11149`, keeping the `LICENSE` of `cpp-httplib` |
| When | the License Notice is written |
| Then | it names `llama` `metal` `b11149`, and under it `cpp-httplib` beside the text of that file |

## `LC-006` Carrying each crate's license with the crates it covers

| Step | Statement |
| --- | --- |
| Given | cargo-about attributing `MIT` to `serde` 1.0.228 |
| When | the License Notice is written |
| Then | it names `MIT` with `serde` 1.0.228 beside that license's text |

## `LC-007` Opening the License Notice from the settings

| Step | Statement |
| --- | --- |
| Given | a build whose interface carries the License Notice |
| When | the full licenses are chosen under About in the settings |
| Then | a dialog over the settings shows the License Notice |

## `LC-008` Saying a development build carries no License Notice

A development build has no License Notice, since CI writes it into each build.

| Step | Statement |
| --- | --- |
| Given | a build whose interface does not carry the License Notice |
| When | the full licenses are chosen under About in the settings |
| Then | the dialog says the notice comes with each released build |

## `LC-009` Opening where the source of the bundled ffmpeg is

| Step | Statement |
| --- | --- |
| Given | the settings open at About |
| When | the source is chosen |
| Then | Rust is asked to open the releases page, each release carrying the source of its ffmpeg |

## `LC-010` Carrying the license of the code Speaker Diarization adapts

| Step | Statement |
| --- | --- |
| Given | the parakeet-rs code Speaker Diarization adapts |
| When | the License Notice is written |
| Then | it carries the MIT License parakeet-rs is under, naming the version adapted |


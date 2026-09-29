# Contributing to Tsuzuri

[繁體中文](CONTRIBUTING.zh-TW.md)

## Development

Requires Rust, Node.js and pnpm. The architecture is in [docs/architecture.md](docs/architecture.md) and the design in [docs/design.md](docs/design.md).

```bash
pnpm install
pnpm tauri dev      # run the app
pnpm test           # frontend tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml
sumi verify         # check code against .spec/
```

## Components

```bash
scripts/vendor.sh               # every Component
scripts/vendor.sh whisper cpu   # one Component, one Variant
```

| Building on | Needs |
|---|---|
| Every platform | cmake, make and jq |
| Linux, OpenBLAS and Vulkan builds | pkg-config, libopenblas-dev, libvulkan-dev, glslc and spirv-headers |
| Windows | MSYS2 UCRT64 |

Tsuzuri uses the executable chosen in the app, else one it finds installed (Homebrew, Nix, `PATH`), else the bundled one. Development builds bundle nothing: `scripts/vendor.sh` builds from the source [`components.json`](components.json) pins into `vendor/<component>/<variant>/`, which debug builds look in first, taking the first Variant listed for the platform unless one is named.

## Packaging

```bash
pnpm tauri build --config src-tauri/tauri.bundle.conf.json
```

This configuration bundles `vendor/` into the installer, and the app takes the first bundled Variant that runs, in the order `components.json` lists them. CI builds the first Variant listed for each platform the same way, caching each by its pin.

## Releasing

```
Title: chore(stable): release Build 20260929+143

Releases Preview Build 20260929+143 (173c0ed).

## Verified
- <what testers checked>

## Known issues
- <or none>

## After merging
1. Approve and run the CI of the release PR release-please opens
2. Merge it; release-assets publishes the draft release
```

| Rule | Why |
|---|---|
| Title names the Build | Testers checked it |
| `main` is the head | Trunk, no release branch |
| No push to `main` until merged | The head stays the Build |
| Merge with a merge commit | `stable` keeps every commit |
| The merge commit takes the PR title | Its first line stays conventional |

A release PR brings `main` into `stable`. release-please picks the version only after it merges, so the title names the Preview Build instead; before merging, check the PR's head is still the Build's commit.

## Tests that run the engines

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<ggml whisper model> TSUZURI_E2E_MEDIA=<video or audio> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<gguf> \
  cargo test -- --ignored --nocapture
```

These two tests are skipped by default and need Models and a media file.

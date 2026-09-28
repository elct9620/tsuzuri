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

## Tests that run the engines

```bash
cd src-tauri
TSUZURI_E2E_MODEL=<ggml whisper model> TSUZURI_E2E_MEDIA=<video or audio> \
TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<gguf> \
  cargo test -- --ignored --nocapture
```

These two tests are skipped by default and need Models and a media file.

# Tsuzuri

Local transcription, subtitle editing and translation. Audio and text never leave the machine; the network is only used to download the engines and models.

## Development

Requires Rust, Node.js and pnpm.

```bash
pnpm install
pnpm tauri dev      # run the app
pnpm test           # frontend tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml
sumi verify         # check code against .spec/
```

On macOS, build the Components upstream ships no prebuilt executable for (whisper-cli, ffmpeg) into `vendor/` first; it needs cmake and make:

```bash
scripts/vendor.sh
```

The frontend is plain TypeScript with [Stimulus](https://stimulus.hotwired.dev/) controllers under `src/controllers/`.

This project uses FFmpeg under the LGPL, downloaded at runtime and run as a separate process.

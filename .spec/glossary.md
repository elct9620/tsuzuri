# Glossary

The words this project keeps, and the ones it turns down in their place.

## Everywhere

### Includes

- `src/**/*.ts`
- `src-tauri/src/**/*.rs`
- `README.md`

### Segment

One piece of speech with a start time, an end time and its text. The unit every mode reads and writes.

### Transcript

The ordered Segments of one media file. Transcribe produces it, Translate consumes it, and SRT is how it is stored on disk.

### Mode

What the user asks Tsuzuri to do with one input: Transcribe (media to Transcript), Translate (an existing SRT to a translated Transcript), or Transcribe and Translate (both, in that order).

### Component

An upstream executable Tsuzuri runs as a child process: ffmpeg, whisper.cpp (`whisper-cli`) or llama.cpp (`llama-server`). Tsuzuri takes the first of: the path the user chose, one found by Detection, one downloaded as the Manifest pins. Failing all three, the user is told how to install it.

#### Rejected

- `Sidecar` - Tauri's sidecar means a binary bundled into the installer; Components are downloaded at runtime and launched by absolute path.

### Manifest

The list built into the app that says, for each platform, how every Component is downloaded: its release tag, archive URLs, SHA256 and the executable's path after extraction; upgrading means editing these. A Component upstream publishes no prebuilt executable for on a platform is external there, and its entry carries how to install it instead.

### Detection

Looking for a Component already on the computer: `vendor/` in debug builds, then the `PATH` and the directories package managers install into. The first executable that answers its version flag is taken. A macOS app does not inherit the shell's `PATH`, so those directories are listed explicitly.

### Vendored Component

A Component `scripts/vendor.sh` builds from pinned upstream source into `vendor/`, for development and for CI. Only debug builds look there; a release build never refers to `vendor/` and ships no Component.

### Model

A weights file an engine loads, always passed by absolute path. The user points at a file already on disk; Tsuzuri neither downloads Models nor lists them in the Manifest.

### Model Slot

Which job a Model is chosen for: transcription (whisper-cli) or translation (llama-server). Each slot holds one Model path.

### Step

One Component run inside a Mode: convert (ffmpeg), transcribe (whisper-cli) or translate (llama-server). A Step starts only after the previous Step's process has exited, so two Models are never loaded at once.

### Stray Process

A Component process left alive after the app that launched it has exited or crashed. Tsuzuri records the PID of every process it launches so the next start can kill what the last one left.

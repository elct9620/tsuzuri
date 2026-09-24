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

An upstream executable Tsuzuri runs as a child process: ffmpeg, whisper.cpp (`whisper-cli`) or llama.cpp (`llama-server`). The Manifest says, per platform, whether it is downloaded or local.

#### Rejected

- `Sidecar` - Tauri's sidecar means a binary bundled into the installer; Components are downloaded at runtime and launched by absolute path.

### Manifest

The list built into the app that says, for each platform, how every Component is obtained. A downloaded Component pins its release tag, archive URLs, SHA256 and the executable's path after extraction; upgrading means editing these. A local Component is one upstream publishes no prebuilt executable for on that platform, so the user points at one already installed.

### Local Component

A Component the Manifest marks local for the running platform - on macOS, whisper-cli and ffmpeg - whose executable path the user chooses, the way a Model is chosen.

### Model

A weights file an engine loads, always passed by absolute path. The user points at a local file or downloads one into the Model Directory; the Manifest never lists Models.

### Model Slot

Which job a Model is chosen for: transcription (whisper-cli) or translation (llama-server). Each slot holds one Model path.

### Model Directory

The folder under app data where Tsuzuri keeps the Models it downloads.

### Step

One Component run inside a Mode: convert (ffmpeg), transcribe (whisper-cli) or translate (llama-server). A Step starts only after the previous Step's process has exited, so two Models are never loaded at once.

### Stray Process

A Component process left alive after the app that launched it has exited or crashed. Tsuzuri records the PID of every process it launches so the next start can kill what the last one left.

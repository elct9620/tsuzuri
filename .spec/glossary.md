# Glossary

The words this project keeps, and the ones it turns down in their place.

## Everywhere

### Includes

- `src/**/*.ts`
- `src-tauri/src/**/*.rs`
- `README.md`

### Segment

One piece of speech with a start time, an end time and its text, and its translation once translated. The unit every mode reads and writes.

### Transcript

The ordered Segments of one media file. Transcribe produces it, Translate consumes it, and SRT is how it is stored on disk.

### Bilingual SRT

An SRT whose every cue carries the original text above its translation, so any player shows both languages without support of its own. A Segment without a translation is written with its original text alone.

### Mode

What the user asks Tsuzuri to do with one input: Transcribe (media to Transcript), Translate (an existing SRT to a translated Transcript), or Transcribe and Translate (both, in that order).

### Component

An upstream executable Tsuzuri runs as a child process: ffmpeg, whisper.cpp (`whisper-cli`) or llama.cpp (`llama-server`). Tsuzuri takes the first of: the path the user chose, one found by Detection, the Bundled Variant. Failing all three, the user is told how to install it.

#### Rejected

- `Sidecar` - Tauri's sidecar is one binary per target triple; a Variant is a directory that can carry its own libraries, so it is bundled as a resource and launched by absolute path.

### Detection

Looking for a Component already on the computer: `vendor/` in debug builds, then the `PATH` and the directories package managers install into. The first executable that answers its version flag is taken. A macOS app does not inherit the shell's `PATH`, so those directories are listed explicitly.

### Vendored Component

A Component `scripts/vendor.sh` builds from the source the Build Manifest pins into `vendor/`, one Variant per Component, for development and for CI. Only debug builds look there; a release build never refers to `vendor/` and finds Components among its Bundled Variants instead.

### Build Manifest

`components.json`: for each Component, the upstream source version and SHA256 Tsuzuri builds from, and the Variants built on each platform. The first Variant listed for a platform is its Bundled Variant.

### Variant

One build of a Component for a kind of hardware: `cpu`, `openblas`, `vulkan` or `metal` for whisper.cpp and llama.cpp, and a single `audio` build for ffmpeg.

### Bundled Variant

The one Variant per Component the installer carries in its resources, first in the Build Manifest's list for the platform: `vulkan` on Windows and Linux, `metal` on macOS, `audio` for ffmpeg. Other Variants are chosen by the user until the app selects among them itself.

### Model

A weights file an engine loads, always passed by absolute path. The user points at a file already on disk; Tsuzuri never downloads Models.

### Model Slot

Which job a Model is chosen for: transcription (whisper-cli) or translation (llama-server). Each slot holds one Model path.

### Step

One Component run inside a Mode: convert (ffmpeg), transcribe (whisper-cli) or translate (llama-server). A Step starts only after the previous Step's process has exited, so two Models are never loaded at once.

### Phase

One timed part of a Mode's run, reported to the user and written to the log: preparing the Components, then each Step - split into loading its Model and doing its work when the Step's process loads one. A Phase that cannot tell how far along it is shows no percentage.

### Stray Process

A Component process left alive after the app that launched it has exited or crashed. Tsuzuri records the PID of every process it launches so the next start can kill what the last one left.

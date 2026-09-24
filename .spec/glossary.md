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

### Project

The work on one input that Rust holds as the single source of truth: the media file, when there is one, or the SRT file it was opened from, and its Transcript with the translations and edits, the Language the Transcript is in and the Language of its translations, and the Translation Glossary once loaded. Transcribing a media file or opening an SRT file replaces it; translating, editing and exporting work on it. For now only one exists, in memory.

### Mode

What the user asks Tsuzuri to do with one input: Transcribe (media to Transcript), Translate (the Project's Transcript into another language), or Transcribe and Translate (both, in that order).

### Component

An upstream executable Tsuzuri runs as a child process: ffmpeg, whisper.cpp (`whisper-cli`) or llama.cpp (`llama-server`). Tsuzuri takes the first of: the path the user chose, one found by Detection, the Bundled Variant. Failing all three, the user is told how to install it.

#### Rejected

- `Sidecar` - Tauri's sidecar is one binary per target triple; a Variant is a directory that can carry its own libraries, so it is bundled as a resource and launched by absolute path.

### Detection

Looking for a Component already on the computer: `vendor/` in debug builds, then the `PATH` and the directories package managers install into. The first executable that answers its version flag is taken. A macOS app does not inherit the shell's `PATH`, so those directories are listed explicitly.

### Vendored Component

A Component `scripts/vendor.sh` builds from the source the Build Manifest pins into `vendor/<component>/<variant>/`, for development and for CI. Only debug builds look there; a release build never refers to `vendor/` and finds Components among its Bundled Variants instead.

### Build Manifest

`components.json`: for each Component, the upstream source version and SHA256 Tsuzuri builds from, and the Variants built on each platform, in the order Auto-Selection tries them.

### Variant

One build of a Component for a kind of hardware: `cpu`, `openblas`, `vulkan` or `metal` for whisper.cpp and llama.cpp, and a single `audio` build for ffmpeg.

### Bundled Variant

A Variant the installer carries in its resources, under `components/<component>/<variant>/`. Until every Variant is bundled, each platform carries the first the Build Manifest lists: `vulkan` on Windows and Linux, `metal` on macOS, `audio` for ffmpeg.

### Auto-Selection

Taking the first Bundled Variant, in the Build Manifest's order for the platform, whose executable answers its version flag. A Variant that does not run, as when the driver or library its backend loads is missing, is passed over for the next.

### Model

A weights file an engine loads, always passed by absolute path. The user points at a file already on disk; Tsuzuri never downloads Models.

### Batch

The Segments one request asks the Model to translate, each sent with its position as an index so every translation in the answer is matched back by index rather than by order.

### Split Sentence

Consecutive Segments the Model reports as one sentence cut apart by transcription. A Split Sentence is kept inside one Batch, which may grow past the Batch size for it, unless the merged run exceeds twice the Batch size.

### Speaker Label

The `name:` or `name：` before a line of dialogue, up to twenty characters with no digits-only name, such as `co:`. When the user turns them on, translation sends only the dialogue and puts each label back in front of its line.

### Translation Glossary

The terms the user gives, as a CSV of `source,target` rows such as names and titles, whose target term each translation of a line using the source term must contain. It belongs to the Project, so a new Project starts without one; translation uses it only once loaded. Unrelated to this file.

### Rolling Summary

A summary of the translation so far, within a word limit the user sets, that the Model rewrites after each Batch and every later Batch carries. It keeps names and tone consistent beyond the few reference lines, at the cost of one more request per Batch; it is off unless turned on.

### Self-Review

An optional second look in which the Model, two lines at a time, restates what each translation says and names the line it belongs to. A translation it places on a neighbouring line is repaired like any other flaw. It checks placement only, not completeness.

### Model Slot

Which job a Model is chosen for: transcription (whisper-cli) or translation (llama-server). Each slot holds one Model path.

### Step

One Component run inside a Mode: convert (ffmpeg), transcribe (whisper-cli) or translate (llama-server). A Step starts only after the previous Step's process has exited, so two Models are never loaded at once.

### Phase

One timed part of a Mode's run, reported to the user and written to the log: preparing the Components, then each Step - split into loading its Model and doing its work when the Step's process loads one. A Phase that cannot tell how far along it is shows no percentage.

### Language

A language Tsuzuri transcribes from or translates into, named by its code: `zh-TW`, `en` or `ja`. The webview sends only the code; Rust keeps what each code means to a Component, such as the name a Model is told.

### Interface Language

The language the webview's text is written in: the system's language when Tsuzuri has a translation for it, otherwise English. Only the webview writes interface text.

### Failure

Why a command did not finish, sent to the webview as a `code` with the data it names, such as the cue of a malformed SRT. The webview words it in the interface language; text only a system or a Component wrote travels as its `detail` untranslated.

### Stray Process

A Component process left alive after the app that launched it has exited or crashed. Tsuzuri records the PID of every process it launches so the next start can kill what the last one left.

# Glossary

The words this project keeps, and the ones it turns down in their place.

## Everywhere

### Includes

- `src/**/*.ts`
- `src-tauri/src/**/*.rs`
- `README.md`

### Segment

One piece of speech with a start time, an end time, its text and, when known, its Speaker, and its translation once translated. The unit every mode reads and writes.

### Speaker

Who says a Segment, named by the user and never detected. In an SRT it is the Speaker Label on the cue's first line when no other line carries one, and it is written back as `name: ` before both the original and the translation.

### Transcript

The ordered Segments of one media file. Transcribe produces it, Translate consumes it, and SRT is how it is stored on disk.

### Bilingual SRT

An SRT whose every cue carries the original text and its translation in the Bilingual Order, so any player shows both languages without support of its own. A Segment without a translation is written with its original text alone.

### Bilingual Order

Which text a Bilingual SRT puts first in each cue and first in its file name: the original, unless the Project Options put the translation first.

### Project

A directory the user opens, holding the Resources of one series of work, a Project Config and, when present, a Translation Glossary. Rust holds the open Project as the single source of truth, and the directory's files are where its subtitles live: edits are written back to them, never kept as a copy of Tsuzuri's own.

### Resource

The files of a Project sharing one name: a media file, the Primary Language subtitle `[name].srt` or `[name].[code].srt`, and a translation `[name].[code].srt` for each other Language. A Resource may have any of them but needs one of the first two.

### Current Resource

The one Resource of the Project that the editor shows and a Mode works on. Opening a Project selects its first Resource; opening an SRT file selects that file's.

### Primary Language

The Language a Project's Resources are spoken and transcribed in, and the one every translation starts from. The Project Config records it; without one it follows the Interface Language.

### Project Config

`tsuzuri.config.json` in the Project's directory: the Primary Language, the Language of the last translation and the Project Options. Written the first time any of them changes.

### Project Options

What the user sets for one Project in the settings, beside its Primary Language: its Bilingual Order, whether a Bilingual SRT is saved beside each translation, and whether a subtitle about to be overwritten is kept as a Backup. Each has a default the Project keeps until it is changed.

### Mode

What the user starts on the Current Resource from a task dialog: Transcribe (its media file to its Primary Language subtitle), Translate (its Primary Language subtitle into another Language), or Transcribe and Translate (both, in that order). Its results appear in the editor as they arrive.

#### Rejected

- `Tab` - Modes used to be tabs; the editor is now the one screen and a Mode is started over it.

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

The `name:` or `name：` before a line of dialogue, up to twenty characters with no digits-only name, such as `co:`. The label of a cue with one becomes its Segment's Speaker; the labels of a cue whose lines name several stay in its text, and when the user turns them on, translation sends only the dialogue and puts each label back in front of its line.

### Translation Glossary

The terms the user gives, such as names and titles, as a CSV with one column per Language headed by its code, like `zh-TW,en,ja`, and one row per term. Translating uses the Primary Language column as the source term and the target Language column as the term each translation of a line using the source must contain. A `source,target` header stands for the Primary Language and the Project's translation Language, and is refused while the Project has none. It is the Project's `glossary.csv`, read when the Project opens and again before each translation, and written with Language codes when edited; without the file there is none. Unrelated to this file.

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

### Notification

A short message in a corner of the window about something that has just happened: a task finished or failed, an edit was saved or was not written. It goes away on its own after a moment, except one saying something failed, which stays until it is closed.

### Placeholder

A grey shape standing where content is still being made or read, such as a row before a transcription writes its first Segment, so the screen shows something is coming rather than nothing being there.

### Segment Change

A change to the Segments themselves rather than to a text: new times for one, one inserted before or after another, one deleted, one split in two at a point in its text, a run of them merged, or a run of them shifted in time. It is made to the original and every translation of the Current Resource together, since a translation is matched to its original by time.

### Backup

A copy of a subtitle kept in the Project's `.tsuzuri/history/` just before Tsuzuri overwrites it, named `[name].srt` or `[name].[lang].srt` with the UTC time it was taken before `.srt`, such as `ep01.en.20260925T023000Z.srt`. Only taken when the Project Options ask for it; the Resource list never shows one.

### Version

A subtitle of the Current Resource as it stands now, or as one of its Backups kept it. Versions of one subtitle can be compared cue by cue, matched by their times, and a Backup can be restored over the subtitle, which is itself kept as a Backup first.

### Stray Process

A Component process left alive after the app that launched it has exited or crashed. Tsuzuri records the PID of every process it launches so the next start can kill what the last one left.

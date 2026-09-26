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

Who says a Segment, named by the user and never detected. In an SRT it is the Speaker Label on the cue's first line when no other line carries one, and it is written back as `name: ` before the original, and before the translation as the Translation Glossary names that Speaker in the translation's Language, or as it is where the glossary names it no other way; reading a translation takes off only that label, so dialogue opening like one stays as written.

### Transcript

The ordered Segments of one media file. Transcribe produces it, Translate consumes it, and SRT is how it is stored on disk.

### Bilingual SRT

An SRT whose every cue carries the original text and its translation in the Bilingual Order, so any player shows both languages without support of its own. A Segment without a translation is written with its original text alone.

### Bilingual Order

Which text a Bilingual SRT puts first in each cue and first in its file name: the original, unless the Project Options put the translation first.

### Project

A directory the user opens, holding the Resources of one series of work, a Project Config and, when present, a Translation Glossary. Rust holds the open Project as the single source of truth, and the directory's files are where its subtitles live: edits are written back to them, never kept as a copy of Tsuzuri's own.

### Resource

The files of a Project sharing one name: a media file, the Primary Language subtitle `[name].srt` or `[name].[code].srt`, and a translation `[name].[code].srt` for each other Language. A Resource may have any of them but needs one of the first two. The name is the whole name of its media file or of a subtitle without a Language code, even one ending like a code, as `talk.hd` does.

### Current Resource

The one Resource of the Project that the editor shows and a Mode works on. Opening a Project selects its first Resource; opening an SRT file selects that file's.

### Primary Language

The Language a Project's Resources are spoken and transcribed in, and the one every translation starts from. The Project Config records it; without one it follows the Interface Language.

### Project Config

`tsuzuri.config.json` in the Project's directory: the Primary Language, the Language of the last translation and the Project Options. Written the first time any of them changes.

### Project Options

What the user sets for one Project in the settings, beside its Primary Language: its Bilingual Order, whether a Bilingual SRT is saved beside each translation, whether a subtitle about to be overwritten is kept as an Overwrite Backup, its Project Models, and the Transcription Settings it sets for itself. Each has a default the Project keeps until it is changed.

### Project Model

A Model one Project chooses for the transcription or the translation Model Slot in place of the one the general settings hold, as for Resources spoken in a Language the general Model does not suit. A slot without one uses the general settings' Model.

### Preview

The Current Resource's media above the editor: a player, its Waveform with a region for each Segment, and the controls to play it. It appears only for a Resource with a media file.

### Current Segment

The one Segment whose row last took a click or focus in the editor, or whose region was last clicked on the timeline, shown with its own background; Space plays on from it, or plays it alone when the user turns that on. Choosing another one pauses the media there, at its start or where its region was clicked. It stays on its Segment through the Segment Changes around it, moves to the second half of a split and into a Segment just inserted, and is let go only when the Segments change in number by other means. It is the webview's to hold and changes nothing in the Project, unlike the Checked Segments.

### Cursor

Where editing stands in the Current Segment: a caret, or a range of text, in one of its fields. It is live while that field has focus and kept once focus leaves, so a menu chosen afterwards still acts where the user was; Tsuzuri draws it itself in both cases, so it looks the same. It belongs to the Current Segment alone, is the webview's to hold, and changes nothing in the Project.

### Checked Segment

A Segment checked in the editor, by its box or in a run Shift-clicked from the Current Segment, so one change reaches many at once: merging neighbours, shifting, deleting, naming a Speaker, or translating again. Checking changes nothing in the Project, and the checks are cleared once the Segments change.

#### Rejected

- `Selected Segment` - selecting is what a Cursor does to text; a Segment is checked.
- `selected rows` - a row stands for a Segment on screen, and it is checked, not selected.
- `selected Segments` - Segments are checked; selecting is what a Cursor does to text.
- `rows selected` - a row stands for a Segment on screen, and it is checked, not selected.

### Waveform

How loud the Current Resource's media is over time, as one Peak for every 10 ms. Rust takes it from the media with ffmpeg, so the webview never decodes the whole audio.

### Snap

Where an edge dragged on the timeline lands when it comes within 8 pixels of another Segment's edge or of where the media is: on that time instead. Shift held while dragging does the opposite of what the timeline is set to.

### Peak

The loudest sample within one 10 ms slice of a Waveform, from 0 for silence to 1 for full scale.

### Mode

What the user starts on the Current Resource from a task dialog: Transcribe (its media file to its Primary Language subtitle), Translate (its Primary Language subtitle into another Language), or Transcribe and Translate (both, in that order). Its results appear in the editor as they arrive. While a Mode runs on a Resource, nothing else changes the subtitles it writes: a transcription holds every subtitle of the Resource, a translation only the one it writes. One Mode runs at a time; another started meanwhile waits for it to end.

#### Rejected

- `Tab` - Modes used to be tabs; the editor is now the one screen and a Mode is started over it.

### Mode Run

One run of a Mode, from taking its turn to its end: it owns the Components it starts, so cancelling it stops those and nothing else.

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

### Resident llama-server

The llama-server kept running between translations in router mode, started without a Model: a translation loads the translation Model into it, and it frees the Model again a chosen number of seconds after the translation ends, or at once when a transcription starts, so only one Model is loaded at a time.

### Batch

The Segments one request asks the Model to translate, each sent with its position as an index so every translation in the answer is matched back by index rather than by order.

### Split Sentence

Consecutive Segments the Model reports as one sentence cut apart by transcription. A Split Sentence is kept inside one Batch, which may grow past the Batch size for it, unless the merged run exceeds twice the Batch size.

### Speaker Label

The `name:` or `name：` before a line of dialogue, everything up to the line's first colon not followed by a digit, as a clock time's is, unless it is digits only, such as `co:`; a name of any length reads back as it was written. The label of a cue with one becomes its Segment's Speaker; the labels of a cue whose lines name several stay in its text, and when the user turns them on, translation sends only the dialogue and puts each label back in front of its line.

### Translation Glossary

The terms the user gives, such as names and titles, as a CSV with one column per Language headed by its code, like `zh-TW,en,ja`, and one row per term, then a last `type` column where `speaker` marks a term that names a Speaker; a file without the column holds no Speakers. Translating uses the Primary Language column as the source term and the target Language column as the term each translation of a line using the source must contain. A `source,target` header stands for the Primary Language and the Project's translation Language, and is refused while the Project has none. It is the Project's `glossary.csv`, read when the Project opens and again before each translation, and written with Language codes when edited; without the file there is none. Unrelated to this file.

### Rolling Summary

A summary of the translation so far, within a word limit the user sets, that the Model rewrites after each Batch and every later Batch carries. It keeps names and tone consistent beyond the few reference lines, at the cost of one more request per Batch; it is off unless turned on.

### Self-Review

An optional second look in which the Model, two lines at a time, restates what each translation says and names the line it belongs to. A translation it places on a neighbouring line is repaired like any other flaw. It checks placement only, not completeness.

### Model Slot

Which job a Model is chosen for: transcription (whisper-cli), VAD (whisper-cli) or translation (llama-server). Each slot holds one Model path.

### Transcription Settings

How whisper-cli transcribes beyond the Language and the Model: whether VAD runs first, whether non-speech tokens are suppressed, and whether each window carries the text before it as context. The general settings hold their defaults, which leave whisper-cli as it behaves on its own; a Project may set any of them for itself and follows the general settings in the rest.

### VAD

Voice activity detection: whisper-cli finds where speech is with the VAD Model and transcribes only there, so silence and music do not lead a Model to write text nobody said.

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

A short message in a corner of the window about something that has just happened: a task finished or failed, an edit was saved or was not written. Its title says what happened, marked by the icon and colour of its kind; below the title it may say why in a sentence, or list items with their values, such as how long each Phase took. Each thing that happened has a Notification of its own. It goes away on its own after a moment, except one saying something failed, which stays until it is closed.

### Placeholder

A grey shape standing where content is still being made or read, such as a row before a transcription writes its first Segment, so the screen shows something is coming rather than nothing being there.

### Segment Change

A change to the Segments themselves rather than to a text: new times for one, the edge two neighbours share moved for both, one inserted before or after another or at times of its own, any of them deleted, one split in two at a point in its text, a run of them merged, or a run of them shifted in time. It is made to the original and every translation of the Current Resource together, since a translation is matched to its original by time.

### Backup

A copy of a subtitle kept in the Project's `.tsuzuri/history/`, of one of two kinds. An Output is what a transcription or translation has just written, always kept, so the edits after it can be compared with what the Mode made. An Overwrite is a subtitle just before Tsuzuri writes over it: kept before every transcription or translation that writes over it when the Project Options ask for it, always before a restore, and before any change the first time Tsuzuri changes the subtitle since the Project was opened, unless a Backup of it was kept since; later changes in that time are left to the Undo History. What Tsuzuri last held of a subtitle changed elsewhere is kept as an Overwrite too, before the change is read in. Each is named `[name].srt` or `[name].[lang].srt` with the UTC time it was taken before `.srt`, and an Output with `.output` after the time, such as `ep01.en.20260925T023000Z.output.srt`; the Resource list never shows one.

#### Rejected

- `Baseline` - an Output is what a comparison starts from; a second name would split one kept file into two ideas.

### Version

A subtitle of the Current Resource as it stands now, or as one of its Backups kept it. Two Versions of one subtitle are compared as Comparison Rows; a Backup can be restored over the subtitle, which is itself kept as an Overwrite first, or taken back one row at a time.

### Comparison Row

One place where two Versions of a subtitle are lined up: the cues of each that cover the same speech. Cues pair when they overlap by at least half of the shorter one, so cues that only touch at their edges stay apart; a cue that pairs with none takes the unpaired cue of the other Version with the same text, as a cue moved in time does. A row is a Pair of one cue each, an Addition only in the later Version, a Removal only in the earlier, a Split of one cue into several, or a Merge of several into one, and it says whether its text changed, its times changed, or both.

### Undo History

What can be undone and redone for one Resource since the Project was opened: its subtitles as they were before each change Tsuzuri made to them - an edit, a Segment Change, a restore, or what a transcription or translation wrote - at most 100 back. It is kept only while the Project stays open, and forgotten once a subtitle of the Resource is changed elsewhere; undoing and redoing write the subtitles back without a Backup.

### Stray Process

A Component process left alive after the app that launched it has exited or crashed. Tsuzuri records the PID of every process it launches so the next start can kill what the last one left.

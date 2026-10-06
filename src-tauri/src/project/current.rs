use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::Serialize;

use super::directory_name;
use super::files;
use super::glossary::{GlossaryRow, GlossaryTable, TranslationGlossary, TranslationGlossaryView};
use super::history::UndoHistory;
use super::mode_hold::{
    is_always_written, is_written_by_edit, ModeHold, ModeProgress, RunningMode,
};
use super::opened_project::missing_segment;
use super::versions::{ComparedCue, RevertPart, SubtitleVersions};
use super::{
    translation_only, translation_srt, BackupKind, CleanupScope, DiarizationTarget, ExportFormat,
    Project, ProjectModelPresets, ProjectOptions, Resource, Restoration, SegmentField, SegmentSpan,
    TextMatch, TranscriptionRequest, TranscriptionTarget, TranslationSource,
};
use crate::failure::Failure;
use crate::language::Language;
use crate::replacement::{Finder, Replacement, Replacer, Search};
use crate::segment_change::SegmentChange;
use crate::transcript::{Segment, Transcript, WrittenText};

/// How a Mode's result keeps the subtitle it writes over, and whether it keeps what it wrote.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResultBackup {
    /// As a Mode keeps its output: before, as the Project Options ask, and afterwards as an Output.
    ModeOutput,
    /// As an edit does: once before Tsuzuri first changes it since the Project was opened.
    FirstChange,
}

/// Writes `srt` to `subtitle` of the Resource `name` in `directory`, kept as `backup` says, and,
/// while `project` still holds that directory, pairs its files again, writes what `feed` makes
/// of it and records it all as one change.
fn write_mode_result(
    mut project: Option<&mut Project>,
    directory: &Path,
    name: &str,
    subtitle: &Path,
    srt: String,
    backup: ResultBackup,
    feed: impl FnOnce(&mut Project) -> Result<(), Failure>,
) -> Result<(), Failure> {
    if let Some(project) = project.as_deref_mut() {
        match backup {
            ResultBackup::ModeOutput => project.keep_before_mode_writes(name, subtitle)?,
            ResultBackup::FirstChange => {
                project.back_up_changed_elsewhere_of(name)?;
                project.back_up_first_change(subtitle)?;
            }
        }
    }
    let before = project
        .as_deref()
        .map(|project| project.subtitle_snapshot(name))
        .transpose()?;
    files::write_text(subtitle, srt)?;
    if let Some(project) = project.as_deref_mut() {
        project.pair_again(Some(name))?;
    }
    if backup == ResultBackup::ModeOutput {
        match project.as_deref_mut() {
            Some(project) => project.keep_backup(subtitle, BackupKind::Output)?,
            None => files::back_up(directory, subtitle, SystemTime::now(), BackupKind::Output)?,
        }
    }
    if let Some(project) = project {
        feed(project)?;
        if let Some(before) = before {
            project.record_change(name, before)?;
        }
    }
    Ok(())
}

/// The Resource `source` was taken from, as `project` pairs it while `source` is from it, else as
/// its directory pairs now.
fn resource_in(project: Option<&Project>, source: &TranslationSource) -> Result<Resource, Failure> {
    match project {
        Some(project) => Ok(project.resource(&source.name)?.clone()),
        None => files::resources_in(&source.directory, source.language)?
            .into_iter()
            .find(|resource| resource.name == source.name)
            .ok_or(Failure::NoResource),
    }
}

/// A Resource as the Resource list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct ResourceView {
    name: String,
    has_media: bool,
    has_subtitle: bool,
    translation_languages: Vec<Language>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct ProjectView {
    directory: PathBuf,
    name: String,
    /// The name the Project takes from its directory without a Project Name of its own.
    directory_name: String,
    language: Language,
    translation_language: Option<Language>,
    options: ProjectOptions,
    translation_glossary: Option<TranslationGlossaryView>,
    resources: Vec<ResourceView>,
    current_resource: Option<String>,
    media: Option<PathBuf>,
    segments: Vec<Segment>,
    shown_translation: Option<Language>,
    /// What the Translation Glossary calls each Speaker in the translation shown, by its name in
    /// the Primary Language, so the webview names a Speaker as the saved subtitle does.
    shown_speaker_names: HashMap<String, String>,
    has_undo: bool,
    has_redo: bool,
    running_mode: Option<RunningMode>,
    pending_batch: Option<SegmentSpan>,
    /// Which Preset Model each Project Model is; the Preset Models belong to the toolchain, so the
    /// command answering the view fills this in.
    project_model_presets: ProjectModelPresets,
}

impl ProjectView {
    /// This view naming which Preset Model each Project Model is.
    pub fn with_project_model_presets(mut self, presets: ProjectModelPresets) -> ProjectView {
        self.project_model_presets = presets;
        self
    }

    pub fn pending_batch(&self) -> Option<SegmentSpan> {
        self.pending_batch
    }

    pub fn language(&self) -> Language {
        self.language
    }

    pub fn options(&self) -> &ProjectOptions {
        &self.options
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn translation_language(&self) -> Option<Language> {
        self.translation_language
    }

    pub fn translation_glossary(&self) -> Option<&TranslationGlossaryView> {
        self.translation_glossary.as_ref()
    }

    pub fn segments(&self) -> &[Segment] {
        &self.segments
    }

    pub fn shown_speaker_names(&self) -> &HashMap<String, String> {
        &self.shown_speaker_names
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    pub fn resource_names(&self) -> Vec<&str> {
        self.resources
            .iter()
            .map(|resource| resource.name.as_str())
            .collect()
    }

    pub fn current_resource(&self) -> Option<&str> {
        self.current_resource.as_deref()
    }

    pub fn has_undo(&self) -> bool {
        self.has_undo
    }

    pub fn has_redo(&self) -> bool {
        self.has_redo
    }

    pub fn running_mode(&self) -> Option<RunningMode> {
        self.running_mode.clone()
    }
}

#[derive(Debug, Default)]
struct HeldProject {
    project: Option<Project>,
    mode_hold: Option<ModeHold>,
}

impl HeldProject {
    /// The Resources the Project's directory pairs into now.
    fn resources_in_directory(&self) -> Result<Vec<Resource>, Failure> {
        let project = self.project.as_ref().ok_or(Failure::NoProject)?;
        files::resources_in(&project.directory, project.language)
    }

    /// Takes `resources` as the directory's pairing and reads the Current Resource again,
    /// answering whether it kept what a change made elsewhere replaced.
    fn reload(&mut self, resources: Vec<Resource>) -> Result<bool, Failure> {
        self.project
            .as_mut()
            .ok_or(Failure::NoProject)?
            .reload(resources)
    }
}

/// What reloading the Project did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reload {
    /// Nothing had changed, so nothing was read again.
    Unchanged,
    /// The Project was read again.
    Changed,
    /// The Project was read again over a subtitle changed elsewhere, keeping what Tsuzuri last
    /// held of it as an Overwrite Backup.
    ChangedWithBackup,
}

impl Reload {
    /// A Project read again, with a Backup kept of a subtitle changed elsewhere or without.
    fn new(is_backed_up: bool) -> Reload {
        match is_backed_up {
            true => Reload::ChangedWithBackup,
            false => Reload::Changed,
        }
    }
}

/// A Mode's hold on its Resource, let go when dropped, however the Mode ends.
pub struct ResourceHold<'a>(&'a CurrentProject);

impl Drop for ResourceHold<'_> {
    fn drop(&mut self) {
        self.0.lock().mode_hold = None;
    }
}

/// The one Project every screen reads from and writes to; Rust holds it so no screen keeps its own copy.
#[derive(Debug, Default)]
pub struct CurrentProject(Mutex<HeldProject>);

impl CurrentProject {
    pub fn replace(&self, project: Project) {
        self.lock().project = Some(project);
    }

    /// The directory of the open Project, none before one is opened.
    pub fn directory(&self) -> Option<PathBuf> {
        Some(self.lock().project.as_ref()?.directory.clone())
    }

    /// Keeps the subtitles `mode` writes of the named Resource in `directory` from being changed
    /// by anything else until the answer is dropped, as a Mode's hold does.
    #[cfg(test)]
    pub fn hold_resource(
        &self,
        directory: &Path,
        name: &str,
        mode: RunningMode,
    ) -> ResourceHold<'_> {
        self.lock().mode_hold = Some(ModeHold::new(directory, name, mode));
        ResourceHold(self)
    }

    /// Holds the Current Resource's translation into `target`, or only its Segments at `indexes`,
    /// for a translation to write, answering what it starts from: the Segments and that
    /// translation as the files hold them. Both are taken in one hold of the lock, so nothing
    /// changes between them; translating chosen Segments again also shows `target`.
    pub fn hold_for_translation(
        &self,
        target: Language,
        indexes: Option<Vec<usize>>,
    ) -> Result<(TranslationSource, ResourceHold<'_>), Failure> {
        let mut held_project = self.lock();
        let project = held_project.project.as_mut().ok_or(Failure::NoProject)?;
        let source = project.translation_source(target)?;
        let count = source.transcript.segments.len();
        if let Some(index) = indexes.iter().flatten().find(|index| **index >= count) {
            return Err(missing_segment(*index));
        }
        if indexes.is_some() {
            project.show_translation(Some(target))?;
        }
        held_project.mode_hold = Some(ModeHold::new(
            &source.directory,
            &source.name,
            RunningMode::Translation {
                language: target,
                indexes,
            },
        ));
        Ok((source, ResourceHold(self)))
    }

    /// Names the Batch the running Mode translates next, or none once every Batch is done.
    pub fn mark_pending_batch(&self, pending_batch: Option<SegmentSpan>) {
        if let Some(hold) = self.lock().mode_hold.as_mut() {
            hold.pending_batch = pending_batch;
        }
    }

    /// Makes `change` to the Project, refused when a Mode running on the Current Resource holds a
    /// translation `is_written` says it changes, given the translation shown, the Language the Mode
    /// writes and the Segments it holds, if only some; a transcription holds every change.
    fn change_unless_held<T>(
        &self,
        is_written: impl Fn(Option<Language>, Language, Option<&[usize]>) -> bool,
        change: impl FnOnce(&mut Project) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        let mut held_project = self.lock();
        let HeldProject {
            project, mode_hold, ..
        } = &mut *held_project;
        let project = project.as_mut().ok_or(Failure::NoProject)?;
        if mode_hold
            .as_ref()
            .is_some_and(|hold| hold.is_holding(project, is_written))
        {
            return Err(Failure::ModeRunning);
        }
        change(project)
    }

    /// Makes `change` to the Project as one change that can be undone, unless a running Mode
    /// writes what it changes, as `change_unless_held` says, or a subtitle was changed elsewhere
    /// since Tsuzuri last read or wrote it.
    fn change_undoably<T>(
        &self,
        is_written: impl Fn(Option<Language>, Language, Option<&[usize]>) -> bool,
        change: impl FnOnce(&mut Project) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        self.change_unless_held(is_written, |project| {
            project.refuse_changed_elsewhere()?;
            project.make_undoable_change(change)
        })
    }

    pub fn select(&self, name: &str) -> Result<(), Failure> {
        self.update_project(|project| project.select(name))
    }

    /// The Language of the translation the Current Resource shows, which translating again writes into.
    pub fn shown_translation(&self) -> Result<Language, Failure> {
        self.read_project(|project| {
            project
                .current()?
                .translation
                .ok_or(Failure::NoTranslationShown)
        })
    }

    /// Shows the Current Resource's translation into `language`, or none; refused while a Mode
    /// runs on it, since what it shows is then the Mode's.
    pub fn show_translation(&self, language: Option<Language>) -> Result<(), Failure> {
        self.change_unless_held(is_always_written, |project| {
            project.show_translation(language)
        })
    }

    pub fn view(&self) -> Option<ProjectView> {
        let held_project = self.lock();
        held_project.project.as_ref().map(|project| {
            let current = project.current.as_ref();
            let history = current.and_then(|current| project.undo_histories.get(&current.name));
            let mode_hold = held_project
                .mode_hold
                .as_ref()
                .filter(|hold| hold.is_on_current(project));
            let (segments, shown_translation) = match current {
                Some(current) => {
                    let (segments, translation) =
                        (&current.transcript.segments[..], current.translation);
                    match mode_hold {
                        Some(hold) => (
                            hold.shown_segments(segments),
                            hold.shown_translation(translation),
                        ),
                        None => (segments.to_vec(), translation),
                    }
                }
                None => (Vec::new(), None),
            };
            ProjectView {
                directory: project.directory.clone(),
                name: project.name(),
                directory_name: directory_name(&project.directory),
                language: project.language,
                translation_language: project.translation_language,
                options: project.options.clone(),
                translation_glossary: project
                    .translation_glossary
                    .as_ref()
                    .map(|glossary| glossary.view(project.language)),
                resources: project
                    .resources
                    .iter()
                    .map(|resource| ResourceView {
                        name: resource.name.clone(),
                        has_media: resource.media.is_some(),
                        has_subtitle: resource.subtitle.is_some(),
                        translation_languages: resource
                            .translations
                            .iter()
                            .map(|(language, _)| *language)
                            .collect(),
                    })
                    .collect(),
                current_resource: current.map(|current| current.name.clone()),
                media: current
                    .and_then(|current| project.resource(&current.name).ok())
                    .and_then(|resource| resource.media.clone()),
                segments,
                shown_translation,
                shown_speaker_names: project.speaker_names(shown_translation),
                has_undo: history.is_some_and(UndoHistory::has_undo),
                has_redo: history.is_some_and(UndoHistory::has_redo),
                running_mode: mode_hold.map(|hold| hold.mode.clone()),
                pending_batch: mode_hold.and_then(|hold| hold.pending_batch),
                project_model_presets: ProjectModelPresets::default(),
            }
        })
    }

    /// The Current Resource as shown, taken as a translation's source for a test to hand
    /// [`CurrentProject::show_translations`] and [`CurrentProject::write_translations`] without
    /// the hold a translation takes through [`CurrentProject::hold_for_translation`].
    #[cfg(test)]
    pub fn snapshot(&self) -> Result<TranslationSource, Failure> {
        let held_project = self.lock();
        let project = held_project.project.as_ref().ok_or(Failure::NoProject)?;
        let current = project.current()?;
        Ok(TranslationSource {
            directory: project.directory.clone(),
            name: current.name.clone(),
            transcript: current.transcript.clone(),
            language: project.language,
            model: project.options.models.translation.clone(),
        })
    }

    /// The Current Resource's media file.
    pub fn current_media(&self) -> Result<PathBuf, Failure> {
        let held_project = self.lock();
        let project = held_project.project.as_ref().ok_or(Failure::NoProject)?;
        let resource = project.resource(&project.current()?.name)?;
        resource.media.clone().ok_or(Failure::NoMedia)
    }

    /// Holds the Current Resource for a transcription to write, answering what it starts from:
    /// the media file, the Language to transcribe it in, the subtitle to write and the Audio Window
    /// the request's scope covers; refused when that subtitle exists unless the request allows
    /// writing over it. Both are taken in one hold of the lock, so nothing changes between them.
    pub fn hold_for_transcription(
        &self,
        request: TranscriptionRequest,
    ) -> Result<(TranscriptionTarget, ResourceHold<'_>), Failure> {
        let mut held_project = self.lock();
        let project = held_project.project.as_ref().ok_or(Failure::NoProject)?;
        let target = project.transcription_target(request)?;
        held_project.mode_hold = Some(ModeHold::new(
            &target.directory,
            &target.name,
            RunningMode::Transcription,
        ));
        Ok((target, ResourceHold(self)))
    }

    /// Holds the Current Resource for a diarization to write, answering its media file and the
    /// original subtitle it gives Speakers to, refused without either, in one hold of the lock.
    pub fn hold_for_diarization(&self) -> Result<(DiarizationTarget, ResourceHold<'_>), Failure> {
        let mut held_project = self.lock();
        let project = held_project.project.as_ref().ok_or(Failure::NoProject)?;
        let target = project.diarization_target()?;
        held_project.mode_hold = Some(ModeHold::new(
            &target.directory,
            &target.name,
            RunningMode::Diarization,
        ));
        Ok((target, ResourceHold(self)))
    }

    /// Gives each Segment of the diarized Resource's original subtitle the Speaker `speakers`
    /// answers for it, kept as a Backup first, and each cue of its translations with the same
    /// times that Speaker, as one change, as a transcription writes.
    pub fn write_speakers(
        &self,
        job: &DiarizationTarget,
        speakers: impl FnOnce(&[Segment]) -> Vec<Option<String>>,
    ) -> Result<(), Failure> {
        // Only the Speakers change, so the translation shown stays shown.
        let is_translation_kept = true;
        self.write_original(
            &job.directory,
            &job.name,
            &job.subtitle,
            is_translation_kept,
            |previous| {
                let mut transcript = previous.clone();
                for (segment, speaker) in transcript
                    .segments
                    .iter_mut()
                    .zip(speakers(&previous.segments))
                {
                    segment.speaker = speaker;
                }
                Ok((transcript.to_srt(WrittenText::Original), ()))
            },
        )
    }

    /// Writes the SRT `srt_from` makes of the original subtitle as read as a Mode's result: kept as
    /// a Backup first, its translations given its Speakers, its bilingual subtitles written again
    /// and, while it is current, read again showing the translation shown when
    /// `is_translation_kept`; then what the Mode showed ends.
    fn write_original<T>(
        &self,
        directory: &Path,
        name: &str,
        subtitle: &Path,
        is_translation_kept: bool,
        srt_from: impl FnOnce(&Transcript) -> Result<(String, T), Failure>,
    ) -> Result<T, Failure> {
        let mut held_project = self.lock();
        let HeldProject { project, mode_hold } = &mut *held_project;
        let mut project = project
            .as_mut()
            .filter(|project| project.directory == directory);
        let previous = files::transcript_at(subtitle)?;
        let (srt, answer) = srt_from(&previous)?;
        write_mode_result(
            project.as_deref_mut(),
            directory,
            name,
            subtitle,
            srt,
            ResultBackup::ModeOutput,
            |project| {
                let policy = project.mode_backup_policy();
                project.write_speakers_to_translations(name, &previous, policy)?;
                project.write_bilingual_subtitles(name, None)
            },
        )?;
        if let Some(project) = project.as_mut() {
            if project.is_current(name) {
                let translation = project
                    .current()?
                    .translation
                    .filter(|_| is_translation_kept);
                project.read_again_showing(name, translation)?;
            }
        }
        if let Some(hold) = mode_hold.as_mut() {
            hold.progress = None;
        }
        Ok(answer)
    }

    /// Shows `segments` as what the running Mode has transcribed so far.
    pub fn show_transcript(&self, segments: Vec<Segment>) {
        self.change_progress(|progress| *progress = Some(ModeProgress::Transcript(segments)));
    }

    /// Adds a Segment just transcribed to what the running Mode shows, among the others by its start.
    pub fn push_segment(&self, segment: Segment) {
        self.change_progress(|progress| match progress {
            Some(ModeProgress::Transcript(segments)) => {
                let position = segments.partition_point(|shown| shown.start_ms <= segment.start_ms);
                segments.insert(position, segment);
            }
            _ => *progress = Some(ModeProgress::Transcript(vec![segment])),
        });
    }

    /// Shows the translations finished so far of the Segments `source` was taken with, by
    /// position, and none after them; translating chosen Segments again shows only theirs.
    pub fn show_translations(&self, source: &TranslationSource, translated_segments: &[Segment]) {
        let mut held_project = self.lock();
        let Some(hold) = held_project.mode_hold.as_mut() else {
            return;
        };
        let indexes = match &hold.mode {
            RunningMode::Translation {
                indexes: Some(indexes),
                ..
            } => indexes.clone(),
            _ => (0..source.transcript.segments.len()).collect(),
        };
        let translations = indexes
            .into_iter()
            .map(|index| {
                let translation = translated_segments
                    .get(index)
                    .and_then(|segment| segment.translation.clone());
                (index, translation)
            })
            .collect();
        hold.progress = Some(ModeProgress::Translations(translations));
    }

    fn change_progress(&self, change: impl FnOnce(&mut Option<ModeProgress>)) {
        if let Some(hold) = self.lock().mode_hold.as_mut() {
            change(&mut hold.progress);
        }
    }

    /// The Segments of `job`'s original subtitle that start outside its Audio Window, none when it
    /// covers the whole media file.
    pub fn kept_segments(&self, job: &TranscriptionTarget) -> Result<Vec<Segment>, Failure> {
        let Some(window) = job.window else {
            return Ok(Vec::new());
        };
        let mut segments = files::transcript_at(&job.subtitle)?.segments;
        segments.retain(|segment| !window.has_start_of(segment));
        Ok(segments)
    }

    /// Writes the transcription whisper-cli wrote as the original subtitle of `job`, in place of
    /// the Segments starting within its Audio Window when it has one, kept first as
    /// `keep_before_mode_writes` keeps it, its Speakers to each translation, and the
    /// Bilingual SRTs it feeds, as one change; the Current Resource is then read from them in
    /// place of what the Mode showed. It answers the positions of the Segments written within an
    /// Audio Window, none for the whole media file or when it wrote none.
    pub fn write_transcription(
        &self,
        job: &TranscriptionTarget,
        srt: String,
    ) -> Result<Option<SegmentSpan>, Failure> {
        // A transcription within an Audio Window changes only that window, so the translation shown
        // stays shown.
        let is_translation_kept = job.window.is_some();
        self.write_original(
            &job.directory,
            &job.name,
            &job.subtitle,
            is_translation_kept,
            |previous| match job.window {
                None => Ok((srt, None)),
                Some(window) => {
                    let mut transcript = previous.clone();
                    let window_segments = Transcript::from_srt(&srt)?
                        .segments
                        .into_iter()
                        .map(|segment| window.segment_in_media(segment))
                        .collect();
                    let positions = transcript.replace_within(window, window_segments);
                    let written_span = (!positions.is_empty()).then(|| SegmentSpan {
                        first: positions.start,
                        last: positions.end - 1,
                    });
                    Ok((transcript.to_srt(WrittenText::Original), written_span))
                }
            },
        )
    }

    /// Writes the translations into `target` to the Resource's translation file, whichever
    /// Resource is current now, and, while it is still current, shows them and records `target`
    /// as the Project's translation Language.
    pub fn write_translations(
        &self,
        source: &TranslationSource,
        target: Language,
        segments: Vec<Segment>,
    ) -> Result<Restoration, Failure> {
        self.write_translation_file(source, target, ResultBackup::ModeOutput, |_| {
            Ok(Transcript { segments })
        })
    }

    /// Writes the translations into `target` of the Segments at `indexes`, translated again, into
    /// the translation file as it is now, so each other cue keeps what it holds, as one change kept
    /// as a Backup first only as an edit is.
    pub fn write_retranslations(
        &self,
        source: &TranslationSource,
        target: Language,
        indexes: &[usize],
        segments: Vec<Segment>,
    ) -> Result<Restoration, Failure> {
        self.write_translation_file(source, target, ResultBackup::FirstChange, |project| {
            let speaker_names = project
                .map(|project| project.speaker_names(Some(target)))
                .unwrap_or_default();
            let mut translation =
                resource_in(project, source)?.transcript(Some(target), &speaker_names)?;
            for index in indexes {
                if let (Some(segment), Some(translated_segment)) =
                    (translation.segments.get_mut(*index), segments.get(*index))
                {
                    segment.translation = translated_segment.translation.clone();
                }
            }
            Ok(translation)
        })
    }

    /// Writes the translation into `target` that `translation` makes, given the Project while
    /// `source` is still from it, to the Resource `source` was taken from, with the Bilingual SRTs
    /// it feeds, as one change, kept as `backup` says. The Current Resource, while it is that
    /// Resource, is then read from the files in place of what the Mode showed. It answers how
    /// many Segments of the original, given times since `source` was taken, find no cue at them
    /// in what it wrote.
    fn write_translation_file(
        &self,
        source: &TranslationSource,
        target: Language,
        backup: ResultBackup,
        translation: impl FnOnce(Option<&Project>) -> Result<Transcript, Failure>,
    ) -> Result<Restoration, Failure> {
        let mut held_project = self.lock();
        let HeldProject { project, mode_hold } = &mut *held_project;
        let mut project = project
            .as_mut()
            .filter(|project| project.directory == source.directory);
        let path = source
            .directory
            .join(files::file_name(&source.name, [Some(target)]));
        let translation = translation(project.as_deref())?;
        let speaker_names = project
            .as_ref()
            .map(|project| project.speaker_names(Some(target)))
            .unwrap_or_default();
        write_mode_result(
            project.as_deref_mut(),
            &source.directory,
            &source.name,
            &path,
            translation_srt(&translation, speaker_names),
            backup,
            |project| project.write_bilingual_subtitles(&source.name, Some(target)),
        )?;
        if let Some(project) = project.as_mut() {
            if project.is_current(&source.name) {
                project.read_again_showing(&source.name, Some(target))?;
                project.translation_language = Some(target);
                if let Err(failure) = project.save_config() {
                    log::warn!("could not record the translation Language: {failure:?}");
                }
            }
        }
        if let Some(hold) = mode_hold.as_mut() {
            hold.progress = None;
        }
        let original = match &resource_in(project.as_deref(), source)?.subtitle {
            Some(subtitle) => files::transcript_at(subtitle)?,
            None => Transcript::default(),
        };
        Ok(Restoration::new(
            &source.transcript,
            &original,
            &[translation_only(&translation)],
        ))
    }

    /// Reads the directory's `glossary.csv` again into the Project, for a translation to use.
    pub fn reload_translation_glossary(&self) -> Result<Option<TranslationGlossary>, Failure> {
        self.update_project(|project| {
            project.translation_glossary =
                TranslationGlossary::from_directory(&project.directory, project.source_target())?;
            Ok(project.translation_glossary.clone())
        })
    }

    /// The directory's `glossary.csv` as a table to edit, or an empty one without the file.
    pub fn glossary_table(&self) -> Result<GlossaryTable, Failure> {
        self.read_project(|project| {
            Ok(
                TranslationGlossary::from_directory(&project.directory, project.source_target())?
                    .map_or_else(GlossaryTable::empty, |glossary| glossary.table()),
            )
        })
    }

    /// Writes an edited table to the directory's `glossary.csv` and holds it as the Project's.
    pub fn save_translation_glossary(&self, rows: &[GlossaryRow]) -> Result<(), Failure> {
        self.update_project(|project| {
            TranslationGlossary::write(&project.directory, rows)?;
            project.translation_glossary =
                TranslationGlossary::from_directory(&project.directory, project.source_target())?;
            Ok(())
        })
    }

    pub fn set_language(&self, language: Language) -> Result<(), Failure> {
        self.update_project(|project| project.set_language(language))
    }

    /// Pairs the directory's files again and reads the Current Resource again from them.
    pub fn reload(&self) -> Result<Reload, Failure> {
        let mut held_project = self.lock();
        let resources = held_project.resources_in_directory()?;
        Ok(Reload::new(held_project.reload(resources)?))
    }

    /// Reloads the Project when its directory pairs into other Resources, or a subtitle of the
    /// Current Resource was changed elsewhere, answering what it did.
    pub fn reload_if_changed(&self) -> Result<Reload, Failure> {
        let mut held_project = self.lock();
        let resources = held_project.resources_in_directory()?;
        let project = held_project.project.as_ref().ok_or(Failure::NoProject)?;
        let is_changed = resources != project.resources
            || (project.current.is_some() && project.is_changed_elsewhere()?);
        if !is_changed {
            return Ok(Reload::Unchanged);
        }
        Ok(Reload::new(held_project.reload(resources)?))
    }

    /// Makes an edit and writes it back, unless a subtitle was changed elsewhere since Tsuzuri last
    /// read or wrote it: then the Current Resource is read again instead, keeping that change.
    pub fn edit(&self, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {
        let is_written = |translation_shown: Option<Language>,
                          mode_language: Language,
                          held_indexes: Option<&[usize]>| {
            is_written_by_edit(
                field,
                Some(index),
                translation_shown,
                mode_language,
                held_indexes,
            )
        };
        self.change_undoably(is_written, |project| {
            project.edit_segment(index, field, &value)
        })
    }

    /// Gives each Segment at `indexes` the Speaker `speaker`, or none when it is empty, as one
    /// change, written back as an edited Speaker is.
    pub fn set_speakers(&self, indexes: &[usize], speaker: &str) -> Result<(), Failure> {
        self.change_undoably(is_always_written, |project| {
            project.set_speakers(indexes, speaker)
        })
    }

    /// Replaces every match of `replacement` in the `field` of each Segment of the Current
    /// Resource as one change, written back as an edit of that field is, and answers how many
    /// there were; with none nothing is written.
    pub fn replace_text(
        &self,
        field: SegmentField,
        replacement: &Replacement,
    ) -> Result<usize, Failure> {
        if field == SegmentField::Speaker {
            return Err(Failure::Internal {
                detail: "a Speaker is not searched".to_string(),
            });
        }
        let replacer = Replacer::try_new(replacement)?;
        let is_written = |translation_shown: Option<Language>,
                          mode_language: Language,
                          held_indexes: Option<&[usize]>| {
            is_written_by_edit(field, None, translation_shown, mode_language, held_indexes)
        };
        self.change_unless_held(is_written, |project| {
            project.refuse_changed_elsewhere()?;
            project.replace_text(field, &replacer)
        })
    }

    /// Where `search` matches `field` of each Segment of the Current Resource, in order; nothing
    /// is changed.
    pub fn text_matches(
        &self,
        field: SegmentField,
        search: &Search,
    ) -> Result<Vec<TextMatch>, Failure> {
        if field == SegmentField::Speaker {
            return Err(Failure::Internal {
                detail: "a Speaker is not searched".to_string(),
            });
        }
        let finder = Finder::try_new(search)?;
        self.read_project(|project| project.text_matches(field, &finder))
    }

    /// Cleans Simplified Chinese out of the Current Resource's `zh-TW` text within `scope` as one
    /// change, written back as an edit of that text is, and answers how many characters changed;
    /// with none nothing is written.
    pub fn clean_simplified(&self, scope: &CleanupScope) -> Result<usize, Failure> {
        let field = self.read_project(|project| project.traditional_chinese_field())?;
        let index = match scope {
            CleanupScope::Range { index, .. } => Some(*index),
            CleanupScope::Segments { .. } => None,
        };
        let is_written = |translation_shown: Option<Language>,
                          mode_language: Language,
                          held_indexes: Option<&[usize]>| {
            is_written_by_edit(field, index, translation_shown, mode_language, held_indexes)
        };
        self.change_unless_held(is_written, |project| {
            project.refuse_changed_elsewhere()?;
            project.clean_simplified(scope)
        })
    }

    pub fn subtitle_versions(&self) -> Result<Vec<SubtitleVersions>, Failure> {
        self.read_project(|project| project.subtitle_versions())
    }

    pub fn version_transcript(
        &self,
        language: Option<Language>,
        backup: Option<&str>,
    ) -> Result<Transcript, Failure> {
        self.read_project(|project| project.version_transcript(language, backup))
    }

    pub fn restore_version(
        &self,
        language: Option<Language>,
        backup: &str,
    ) -> Result<Restoration, Failure> {
        self.change_undoably(
            |_, mode_language, _| Some(mode_language) == language,
            |project| project.restore_version(language, backup),
        )
    }

    /// The cues of the Current Resource's translation into `language` as its file is written.
    pub fn translation_cues(&self, language: Language) -> Result<Vec<ComparedCue>, Failure> {
        self.read_project(|project| {
            let resource = project.resource(&project.current()?.name)?;
            let Some(path) = resource.translation_path(language) else {
                return Ok(Vec::new());
            };
            let translation = files::translation_at(path)?;
            Ok(translation.segments.iter().map(ComparedCue::from).collect())
        })
    }

    pub fn revert_row(
        &self,
        language: Option<Language>,
        backup: &str,
        row: usize,
        part: RevertPart,
    ) -> Result<Restoration, Failure> {
        self.change_undoably(
            |_, mode_language, _| Some(mode_language) == language,
            |project| project.revert_row(language, backup, row, part),
        )
    }

    pub fn undo(&self) -> Result<(), Failure> {
        self.change_unless_held(is_always_written, |project| {
            project.refuse_changed_elsewhere()?;
            project.undo()
        })
    }

    pub fn redo(&self) -> Result<(), Failure> {
        self.change_unless_held(is_always_written, |project| {
            project.refuse_changed_elsewhere()?;
            project.redo()
        })
    }

    pub fn change_segments(&self, change: SegmentChange) -> Result<(), Failure> {
        self.change_undoably(is_always_written, |project| project.change_segments(change))
    }

    pub fn export_path(
        &self,
        content: WrittenText,
        format: ExportFormat,
    ) -> Result<PathBuf, Failure> {
        self.read_project(|project| project.export_path(content, format))
    }

    pub fn to_srt(&self, content: WrittenText) -> Result<String, Failure> {
        self.read_project(|project| Ok(project.to_srt(content)?))
    }

    /// Writes the Current Resource to `path` as SRT carrying `content`.
    pub fn save_srt(&self, path: &Path, content: WrittenText) -> Result<(), Failure> {
        files::write_text(path, self.to_srt(content)?)
    }

    pub fn to_plain_text(
        &self,
        content: WrittenText,
        has_speakers: bool,
        has_blank_lines: bool,
    ) -> Result<String, Failure> {
        self.read_project(|project| {
            Ok(project.to_plain_text(content, has_speakers, has_blank_lines)?)
        })
    }

    /// Writes the Current Resource to `path` as Plain Text carrying `content`, its Speakers
    /// named unless `has_speakers` leaves them out and its blocks apart unless
    /// `has_blank_lines` leaves the blank lines out.
    pub fn save_text(
        &self,
        path: &Path,
        content: WrittenText,
        has_speakers: bool,
        has_blank_lines: bool,
    ) -> Result<(), Failure> {
        files::write_text(
            path,
            self.to_plain_text(content, has_speakers, has_blank_lines)?,
        )
    }

    pub fn set_options(&self, options: ProjectOptions) -> Result<(), Failure> {
        self.update_project(|project| project.set_options(options))
    }

    fn update_project<T>(
        &self,
        change: impl FnOnce(&mut Project) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        change(self.lock().project.as_mut().ok_or(Failure::NoProject)?)
    }

    fn read_project<T>(
        &self,
        read: impl FnOnce(&Project) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        read(self.lock().project.as_ref().ok_or(Failure::NoProject)?)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HeldProject> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// The directory an SRT file is in, opened with the file's Resource current.
pub(super) fn open_directory_of(path: &Path, language: Language) -> Result<Project, Failure> {
    let directory = path.parent().ok_or_else(|| Failure::Io {
        detail: format!("{} is in no directory", path.display()),
    })?;
    let mut project = Project::open(directory.to_path_buf(), language)?;
    let (name, translation) = project
        .resources
        .iter()
        .find_map(|resource| {
            if resource.subtitle.as_deref() == Some(path) {
                return Some((resource.name.clone(), None));
            }
            let (translation, _) = resource
                .translations
                .iter()
                .find(|(_, translation_path)| translation_path == path)?;
            Some((resource.name.clone(), Some(*translation)))
        })
        .ok_or(Failure::NoResource)?;
    project.select(&name)?;
    if translation.is_some() {
        project.show_translation(translation)?;
    }
    Ok(project)
}

#[cfg(test)]
mod tests;

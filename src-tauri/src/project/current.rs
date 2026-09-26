use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::Serialize;

use super::files;
use super::glossary::{GlossaryRow, GlossaryTable, TranslationGlossary, TranslationGlossaryView};
use super::history::{SubtitleSnapshot, UndoHistory};
use super::versions::{self, ComparedCue, RevertPart, SubtitleVersions};
use super::{
    translation_srt, translation_with_speakers, BackupKind, CurrentResource, KnownSubtitle,
    Project, ProjectConfig, ProjectOptions, Resource, Restoration, SegmentField,
    TranscriptionTarget, TranslationSource,
};
use crate::failure::Failure;
use crate::language::Language;
use crate::segment_change::SegmentChange;
use crate::transcript::{Segment, SpeakerNames, SrtContent, Transcript};

impl Project {
    /// The directory's Resources in the Primary Language its Project Config records, else in
    /// `language`, with the first of them current. A `glossary.csv` it cannot read is left out
    /// here and reported when a translation reads it again.
    pub fn open(directory: PathBuf, language: Language) -> Result<Project, Failure> {
        let config = ProjectConfig::load(&directory)?;
        let language = config.language.unwrap_or(language);
        let mut project = Project {
            resources: files::resources_in(&directory, language)?,
            translation_glossary: None,
            directory,
            language,
            translation_language: config.translation_language,
            options: config.options,
            current: None,
            undo_histories: HashMap::new(),
            backed_up_subtitles: HashSet::new(),
        };
        project.translation_glossary =
            TranslationGlossary::from_directory(&project.directory, project.source_target())
                .ok()
                .flatten();
        if let Some(first) = project.resources.first().map(|found| found.name.clone()) {
            project.select(&first)?;
        }
        Ok(project)
    }

    /// Reads the named Resource from the directory, showing the Language of the last
    /// translation when it has one, else its first translation.
    pub fn select(&mut self, name: &str) -> Result<(), Failure> {
        let resource = self.resource(name)?;
        let translation = self
            .translation_language
            .filter(|language| resource.translation_path(*language).is_some())
            .or(resource.translations.first().map(|(language, _)| *language));
        let transcript = resource.transcript(translation, &self.speaker_names(translation))?;
        self.current = Some(CurrentResource {
            name: name.to_string(),
            transcript,
            translation,
            known_subtitles: Vec::new(),
        });
        self.remember_subtitles()
    }

    /// Shows the Current Resource's translation into `language` from the directory, or none.
    pub fn show_translation(&mut self, language: Option<Language>) -> Result<(), Failure> {
        let speaker_names = self.speaker_names(language);
        let current = self.current.as_mut().ok_or(Failure::NoResource)?;
        let resource = self
            .resources
            .iter()
            .find(|resource| resource.name == current.name)
            .ok_or(Failure::NoResource)?;
        resource.carry_translations(&mut current.transcript.segments, language, &speaker_names)?;
        current.translation = language;
        self.remember_subtitles()
    }

    /// Whether the named Resource is the Current Resource.
    fn is_current(&self, name: &str) -> bool {
        self.current
            .as_ref()
            .is_some_and(|current| current.name == name)
    }

    /// Digests of the Current Resource's original subtitle and the translation file it shows.
    fn subtitle_contents(&self) -> Result<Vec<KnownSubtitle>, Failure> {
        let current = self.current()?;
        let resource = self.resource(&current.name)?;
        let translation_path = current
            .translation
            .and_then(|language| resource.translation_path(language));
        resource
            .subtitle
            .as_deref()
            .into_iter()
            .chain(translation_path)
            .map(files::content_of)
            .collect()
    }

    /// Records what the Current Resource's subtitle files hold now, as read or written by Tsuzuri.
    fn remember_subtitles(&mut self) -> Result<(), Failure> {
        let contents = self.subtitle_contents()?;
        self.current_mut()?.known_subtitles = contents;
        Ok(())
    }

    /// Whether a subtitle file of the Current Resource no longer holds what Tsuzuri last read or wrote.
    fn is_changed_elsewhere(&self) -> Result<bool, Failure> {
        Ok(self.subtitle_contents()? != self.current()?.known_subtitles)
    }

    /// Pairs the directory's files again and reads the Current Resource again from them, showing
    /// the same translation while its file is there.
    fn read_current_again(&mut self) -> Result<(), Failure> {
        let current = self.current()?;
        let (name, translation) = (current.name.clone(), current.translation);
        self.pair_again(Some(&name))?;
        self.read_again_showing(&name, translation)
    }

    /// Reads the Current Resource again after a subtitle of it was changed elsewhere, forgetting
    /// its Undo History, since what it would put back no longer follows from what is there.
    fn read_changed_elsewhere(&mut self) -> Result<(), Failure> {
        self.forget_changed_elsewhere()?;
        self.read_current_again()
    }

    /// Keeps what Tsuzuri last read or wrote of each subtitle of the Current Resource changed
    /// elsewhere as an Overwrite Backup, since nothing else holds it once the file is read again,
    /// and forgets its Undo History; answers whether it kept one. The version read in is then no
    /// longer kept this opening, so the next change keeps it first.
    fn forget_changed_elsewhere(&mut self) -> Result<bool, Failure> {
        let current = self.current()?;
        let name = current.name.clone();
        let mut is_kept = false;
        for (path, known) in current.known_subtitles.clone() {
            let (_, now) = files::content_of(&path)?;
            if now == known {
                continue;
            }
            self.undo_histories.remove(&name);
            self.backed_up_subtitles.remove(&path);
            if let Some(known) = known {
                files::keep_as_backup(
                    &self.directory,
                    &path,
                    &known,
                    SystemTime::now(),
                    BackupKind::Overwrite,
                )?;
                is_kept = true;
            }
        }
        Ok(is_kept)
    }

    /// Pairs the directory's files again after `writer`, the Resource whose files Tsuzuri just
    /// wrote, if any, changed them.
    fn pair_again(&mut self, writer: Option<&str>) -> Result<(), Failure> {
        let resources = files::resources_in(&self.directory, self.language)?;
        self.replace_resources(resources, writer);
        Ok(())
    }

    /// Takes `resources` as the directory's pairing, forgetting the Undo History of each Resource
    /// but `writer` whose files it changes: undoing would remove a file it did not know of.
    fn replace_resources(&mut self, resources: Vec<Resource>, writer: Option<&str>) {
        self.undo_histories.retain(|name, _| {
            Some(name.as_str()) == writer
                || resource_by_name(&self.resources, name) == resource_by_name(&resources, name)
        });
        self.resources = resources;
    }

    /// Takes `resources` as the directory's pairing and reads the Current Resource again from
    /// them, showing the same translation while its file is there, or the first Resource once it
    /// is gone; a Current Resource changed elsewhere is handled as `forget_changed_elsewhere`
    /// does, answering whether a Backup was kept.
    fn reload(&mut self, resources: Vec<Resource>) -> Result<bool, Failure> {
        let (current, is_kept) = match &self.current {
            Some(current) => {
                let shown = (current.name.clone(), current.translation);
                (Some(shown), self.forget_changed_elsewhere()?)
            }
            None => (None, false),
        };
        self.replace_resources(resources, None);
        match current.filter(|(name, _)| self.resource(name).is_ok()) {
            Some((name, translation)) => self.read_again_showing(&name, translation)?,
            None => self.select_first()?,
        }
        Ok(is_kept)
    }

    /// Reads the named Resource again from the directory, showing its translation into
    /// `translation` while that file is there.
    fn read_again_showing(
        &mut self,
        name: &str,
        translation: Option<Language>,
    ) -> Result<(), Failure> {
        self.select(name)?;
        let resource = self.resource(name)?;
        let translation =
            translation.filter(|language| resource.translation_path(*language).is_some());
        self.show_translation(translation)
    }

    /// Selects the first Resource, or none when there is none.
    fn select_first(&mut self) -> Result<(), Failure> {
        match self.resources.first().map(|first| first.name.clone()) {
            Some(name) => self.select(&name),
            None => {
                self.current = None;
                Ok(())
            }
        }
    }

    /// What a translation of the Current Resource into `target` starts from: its Segments and
    /// that translation as the files hold them.
    fn translation_source(&self, target: Language) -> Result<TranslationSource, Failure> {
        let current = self.current()?;
        Ok(TranslationSource {
            directory: self.directory.clone(),
            name: current.name.clone(),
            transcript: self
                .resource(&current.name)?
                .transcript(Some(target), &self.speaker_names(Some(target)))?,
            language: self.language,
            model: self.options.models.translation.clone(),
        })
    }

    /// Reads the Current Resource's Transcript from its files, with the same translation shown,
    /// so a change starts from what they hold rather than from what was last shown.
    fn read_current_transcript(&mut self) -> Result<(), Failure> {
        let current = self.current()?;
        let translation = current.translation;
        let transcript = self
            .resource(&current.name)?
            .transcript(translation, &self.speaker_names(translation))?;
        self.current_mut()?.transcript = transcript;
        Ok(())
    }

    /// Refuses a change when a subtitle of the Current Resource was changed elsewhere since
    /// Tsuzuri last read or wrote it, reading it again instead so that change is kept.
    fn refuse_changed_elsewhere(&mut self) -> Result<(), Failure> {
        if self.is_changed_elsewhere()? {
            self.read_changed_elsewhere()?;
            return Err(Failure::ChangedElsewhere);
        }
        Ok(())
    }

    fn subtitle_snapshot(&self, name: &str) -> Result<SubtitleSnapshot, Failure> {
        files::subtitle_snapshot(self.resource(name)?)
    }

    /// Keeps `before` in the named Resource's Undo History when its subtitles no longer hold it.
    fn record_change(&mut self, name: &str, before: SubtitleSnapshot) -> Result<(), Failure> {
        if self.subtitle_snapshot(name)? != before {
            self.undo_histories
                .entry(name.to_string())
                .or_default()
                .record(before);
        }
        Ok(())
    }

    /// Makes `change` to the Current Resource's subtitles so that it can be undone.
    fn make_undoable_change<T>(
        &mut self,
        change: impl FnOnce(&mut Project) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        let name = self.current()?.name.clone();
        let before = self.subtitle_snapshot(&name)?;
        let result = change(self)?;
        self.record_change(&name, before)?;
        Ok(result)
    }

    fn undo(&mut self) -> Result<(), Failure> {
        self.put_back_from_history(UndoHistory::undo)
    }

    fn redo(&mut self) -> Result<(), Failure> {
        self.put_back_from_history(UndoHistory::redo)
    }

    /// Puts back the subtitles `take` answers from the Current Resource's Undo History, given what
    /// they hold now, and reads the Current Resource again, showing the same translation while it
    /// is still there.
    fn put_back_from_history(
        &mut self,
        take: impl FnOnce(&mut UndoHistory, SubtitleSnapshot) -> Option<SubtitleSnapshot>,
    ) -> Result<(), Failure> {
        let current = self.current()?;
        let (name, translation) = (current.name.clone(), current.translation);
        let now = self.subtitle_snapshot(&name)?;
        let Some(history) = self.undo_histories.get_mut(&name) else {
            return Ok(());
        };
        let Some(snapshot) = take(history, now.clone()) else {
            return Ok(());
        };
        files::put_back(&now, &snapshot)?;
        self.pair_again(Some(&name))?;
        self.read_again_showing(&name, translation)?;
        self.write_bilingual_subtitles(&name, None)
    }

    /// Pairs the directory's subtitles again as in `language`, keeping the Current Resource
    /// when it is still one, and records `language` in the Project Config.
    pub fn set_language(&mut self, language: Language) -> Result<(), Failure> {
        ProjectConfig {
            language: Some(language),
            ..self.config()
        }
        .save(&self.directory)?;
        self.language = language;
        self.pair_again(None)?;
        match self
            .current
            .as_ref()
            .map(|current| current.name.clone())
            .filter(|name| self.resource(name).is_ok())
        {
            Some(name) => self.select(&name),
            None => self.select_first(),
        }
    }

    /// Writes the Current Resource's subtitles that `field` belongs to back to the directory, and
    /// the Bilingual SRTs they feed; `previous` is the Current Resource as it was before the edit.
    fn write_back(&mut self, field: SegmentField, previous: &Transcript) -> Result<(), Failure> {
        let current = self.current()?;
        let name = current.name.clone();
        let content = match field {
            SegmentField::Text | SegmentField::Speaker => SrtContent::Original,
            SegmentField::Translation => SrtContent::Translation,
        };
        let written_translation = match field {
            SegmentField::Translation => current.translation,
            SegmentField::Text | SegmentField::Speaker => None,
        };
        self.write_subtitle(content)?;
        self.pair_again(Some(&name))?;
        if field == SegmentField::Speaker {
            self.write_speakers_to_translations(&name, previous, false)?;
        }
        self.write_bilingual_subtitles(&name, written_translation)?;
        self.remember_subtitles()
    }

    /// Writes the Current Resource's original, or the translation shown, which holds only the
    /// Segments translated; with no translation shown there is none to write.
    fn write_subtitle(&mut self, content: SrtContent) -> Result<(), Failure> {
        let current = self.current()?;
        let srt = match (content, current.translation) {
            (SrtContent::Translation, None) => return Ok(()),
            (SrtContent::Translation, Some(language)) => {
                translation_srt(&current.transcript, self.speaker_names(Some(language)))
            }
            _ => current.transcript.to_srt(SrtContent::Original),
        };
        let resource = self.resource(&current.name)?;
        let path = match (content, current.translation) {
            (SrtContent::Translation, Some(language)) => {
                resource.translation_path(language).map(Path::to_path_buf)
            }
            _ => resource.subtitle.clone(),
        };
        let path = match path {
            Some(path) => path,
            None => self.export_path(content)?,
        };
        self.back_up_first_change(&path)?;
        files::write_srt(&path, srt)
    }

    /// Keeps `subtitle` as an Overwrite Backup before Tsuzuri first changes it since the Project
    /// was opened, unless a Backup of it was kept since, so what the Undo History held can still
    /// be taken back once the Project is closed.
    fn back_up_first_change(&mut self, subtitle: &Path) -> Result<(), Failure> {
        if self.backed_up_subtitles.insert(subtitle.to_path_buf()) {
            files::back_up(
                &self.directory,
                subtitle,
                SystemTime::now(),
                BackupKind::Overwrite,
            )?;
        }
        Ok(())
    }

    /// Gives each cue of the named Resource's translations the Speaker of its original's Segment with
    /// the same times, named as the Translation Glossary names it in that Language, in place of the
    /// label it carried for that Segment in `previous`; first keeps each translation it changes as a
    /// Backup when `is_backed_up`, else as its first change does.
    fn write_speakers_to_translations(
        &mut self,
        name: &str,
        previous: &Transcript,
        is_backed_up: bool,
    ) -> Result<(), Failure> {
        let resource = self.resource(name)?;
        let Some(subtitle) = &resource.subtitle else {
            return Ok(());
        };
        let original = files::transcript_at(subtitle)?;
        let mut writes = Vec::new();
        for (language, path) in &resource.translations {
            let translation = files::translation_at(path)?;
            let as_read = translation.to_srt(SrtContent::Original);
            let speaker_names = self.speaker_names(Some(*language));
            let srt = translation_with_speakers(&translation, &original, previous, &speaker_names)
                .to_srt_with(
                    SrtContent::Original,
                    &SpeakerNames {
                        text: speaker_names,
                        ..SpeakerNames::default()
                    },
                );
            if srt != as_read {
                writes.push((path.clone(), srt));
            }
        }
        for (path, srt) in writes {
            if is_backed_up {
                files::back_up(
                    &self.directory,
                    &path,
                    SystemTime::now(),
                    BackupKind::Overwrite,
                )?;
                self.backed_up_subtitles.insert(path.clone());
            } else {
                self.back_up_first_change(&path)?;
            }
            files::write_srt(&path, srt)?;
        }
        Ok(())
    }

    /// Makes `change` to the Current Resource's original and to each of its translations, since a
    /// translation is matched to its original by time, and writes them all back.
    fn change_segments(&mut self, change: SegmentChange) -> Result<(), Failure> {
        self.read_current_transcript()?;
        let current = self.current()?;
        let (name, translation) = (current.name.clone(), current.translation);
        let mut original = current.transcript.clone();
        change.clone().apply(&mut original.segments)?;
        let resource = self.resource(&name)?;
        let mut translations = Vec::new();
        for (language, path) in &resource.translations {
            let mut translation =
                resource.transcript(Some(*language), &self.speaker_names(Some(*language)))?;
            change.clone().apply(&mut translation.segments)?;
            translations.push((
                path.clone(),
                translation_srt(&translation, self.speaker_names(Some(*language))),
            ));
        }
        self.current_mut()?.transcript = original;
        self.write_subtitle(SrtContent::Original)?;
        for (path, srt) in translations {
            self.back_up_first_change(&path)?;
            files::write_srt(&path, srt)?;
        }
        self.pair_again(Some(&name))?;
        self.read_again_showing(&name, translation)?;
        self.write_bilingual_subtitles(&name, None)
    }

    fn subtitle_versions(&self) -> Result<Vec<SubtitleVersions>, Failure> {
        let current = self.current()?;
        let resource = self.resource(&current.name)?;
        std::iter::once(None)
            .chain(
                resource
                    .translations
                    .iter()
                    .map(|(language, _)| Some(*language)),
            )
            .map(|language| {
                Ok(SubtitleVersions {
                    language,
                    backups: files::backups_of(&self.directory, &self.subtitle_path(language)?)?,
                })
            })
            .collect()
    }

    /// Where the Backup named `backup` of the subtitle in `language` is, refused unless that
    /// subtitle's own Backups hold the name.
    fn backup_of(&self, language: Option<Language>, backup: &str) -> Result<PathBuf, Failure> {
        let backups = files::backups_of(&self.directory, &self.subtitle_path(language)?)?;
        if !backups.iter().any(|each| each.file == backup) {
            return Err(Failure::NoBackup {
                backup: backup.to_string(),
            });
        }
        Ok(files::backup_path(&self.directory, backup))
    }

    /// The subtitle in `language` as the named Backup kept it, or as it is now without one.
    fn version_transcript(
        &self,
        language: Option<Language>,
        backup: Option<&str>,
    ) -> Result<Transcript, Failure> {
        let path = match backup {
            Some(backup) => self.backup_of(language, backup)?,
            None => self.subtitle_path(language)?,
        };
        version_at(&path, language)
    }

    /// Takes back the Comparison Row at `row` of the named Backup against the subtitle in
    /// `language`, writing only that subtitle and the Bilingual SRTs it feeds.
    fn revert_row(
        &mut self,
        language: Option<Language>,
        backup: &str,
        row: usize,
        part: RevertPart,
    ) -> Result<Restoration, Failure> {
        let previous = self.current()?.transcript.clone();
        let subtitle = self.subtitle_path(language)?;
        let transcript = versions::reverted_transcript(
            &version_at(&self.backup_of(language, backup)?, language)?,
            &version_at(&subtitle, language)?,
            row,
            part,
        )
        .ok_or(Failure::NoRow { row })?;
        self.back_up_first_change(&subtitle)?;
        files::write_srt(&subtitle, transcript.to_srt(SrtContent::Original))?;
        let name = self.current()?.name.clone();
        self.read_current_again()?;
        self.write_bilingual_subtitles(&name, language)?;
        self.restoration(language, &previous)
    }

    /// Keeps the subtitle in `language` as a Backup, puts the named Backup in its place and reads
    /// the Current Resource again.
    fn restore_version(
        &mut self,
        language: Option<Language>,
        backup: &str,
    ) -> Result<Restoration, Failure> {
        let previous = self.current()?.transcript.clone();
        let backup_path = self.backup_of(language, backup)?;
        let subtitle = self.subtitle_path(language)?;
        let name = self.current()?.name.clone();
        files::back_up(
            &self.directory,
            &subtitle,
            SystemTime::now(),
            BackupKind::Overwrite,
        )?;
        self.backed_up_subtitles.insert(subtitle.clone());
        files::copy(&backup_path, &subtitle)?;
        self.read_current_again()?;
        self.write_bilingual_subtitles(&name, language)?;
        self.restoration(language, &previous)
    }

    /// What restoring the subtitle in `language` left behind, given the original as it was before;
    /// restoring a translation gives no Segment new times.
    fn restoration(
        &self,
        language: Option<Language>,
        previous: &Transcript,
    ) -> Result<Restoration, Failure> {
        if language.is_some() {
            return Ok(Restoration::default());
        }
        let current = self.current()?;
        let translations = self
            .resource(&current.name)?
            .translations
            .iter()
            .map(|(_, path)| files::translation_at(path))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Restoration::new(
            previous,
            &current.transcript,
            &translations,
        ))
    }

    /// Writes the Bilingual SRT beside each translation of the named Resource, or beside its
    /// translation into `only`, when the Project Options keep them.
    fn write_bilingual_subtitles(&self, name: &str, only: Option<Language>) -> Result<(), Failure> {
        if !self.options.is_bilingual_autosaved {
            return Ok(());
        }
        let resource = self.resource(name)?;
        for (language, _) in &resource.translations {
            if only.is_some_and(|only| only != *language) {
                continue;
            }
            let transcript =
                resource.transcript(Some(*language), &self.speaker_names(Some(*language)))?;
            files::write_srt(
                &self
                    .directory
                    .join(self.bilingual_file_name(name, *language)),
                self.bilingual_srt(&transcript, Some(*language)),
            )?;
        }
        Ok(())
    }

    /// Replaces the Project Options and records them in the Project Config.
    pub fn set_options(&mut self, options: ProjectOptions) -> Result<(), Failure> {
        ProjectConfig {
            options: options.clone(),
            ..self.config()
        }
        .save(&self.directory)?;
        self.options = options;
        Ok(())
    }

    fn save_config(&self) -> Result<(), Failure> {
        Ok(self.config().save(&self.directory)?)
    }
}

/// The Version of a subtitle at `path`: an original read for its Speakers, a translation as
/// written, so a comparison and what it takes back see each cue the same way.
fn version_at(path: &Path, language: Option<Language>) -> Result<Transcript, Failure> {
    match language {
        None => files::transcript_at(path),
        Some(_) => files::translation_at(path),
    }
}

/// The Speaker `value` names, trimmed; an empty one names none.
fn speaker_from(value: &str) -> Option<String> {
    let speaker = value.trim();
    (!speaker.is_empty()).then(|| speaker.to_string())
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

/// The Resource of `resources` named `name`, if any.
fn resource_by_name<'a>(resources: &'a [Resource], name: &str) -> Option<&'a Resource> {
    resources.iter().find(|resource| resource.name == name)
}

/// A Resource as the Resource list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ResourceView {
    name: String,
    has_media: bool,
    has_subtitle: bool,
    translation_languages: Vec<Language>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProjectView {
    directory: PathBuf,
    language: Language,
    translation_language: Option<Language>,
    options: ProjectOptions,
    translation_glossary: Option<TranslationGlossaryView>,
    resources: Vec<ResourceView>,
    current_resource: Option<String>,
    media: Option<PathBuf>,
    segments: Vec<Segment>,
    shown_translation: Option<Language>,
    has_undo: bool,
    has_redo: bool,
    running_mode: Option<RunningMode>,
    pending_batch: Option<SegmentSpan>,
}

impl ProjectView {
    pub fn pending_batch(&self) -> Option<SegmentSpan> {
        self.pending_batch
    }

    pub fn media(&self) -> Option<&Path> {
        self.media.as_deref()
    }

    pub fn language(&self) -> Language {
        self.language
    }

    pub fn options(&self) -> &ProjectOptions {
        &self.options
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
    Reloaded,
    /// The Project was read again over a subtitle changed elsewhere, keeping what Tsuzuri last
    /// held of it as an Overwrite Backup.
    ReloadedKeeping,
}

impl Reload {
    fn from_kept(is_kept: bool) -> Reload {
        match is_kept {
            true => Reload::ReloadedKeeping,
            false => Reload::Reloaded,
        }
    }
}

/// A Mode running on one Resource, and so which of its subtitles nothing else may change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "mode", rename_all = "kebab-case")]
pub enum RunningMode {
    /// Holds every subtitle of the Resource.
    Transcription,
    /// Holds only the translation into `language`, or only its Segments at `indexes` while they
    /// are translated again.
    Translation {
        language: Language,
        indexes: Option<Vec<usize>>,
    },
}

/// The Segments from `first` through `last`, by position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SegmentSpan {
    pub first: usize,
    pub last: usize,
}

/// The Resource a Mode runs on, by the directory it is in and its name, and the Batch it is
/// translating, if any.
#[derive(Debug, Clone, PartialEq, Eq)]
struct ModeHold {
    directory: PathBuf,
    name: String,
    mode: RunningMode,
    pending_batch: Option<SegmentSpan>,
    progress: Option<ModeProgress>,
}

/// What a running Mode has made so far, shown in place of what the files hold and never written
/// as a subtitle: the Mode writes its own result once done, and what it shows ends with it.
#[derive(Debug, Clone, PartialEq, Eq)]
enum ModeProgress {
    /// The Segments transcribed so far, in place of the whole Transcript.
    Transcript(Vec<Segment>),
    /// The translation of each Segment at its position, in place of the translation shown.
    Translations(BTreeMap<usize, Option<String>>),
}

impl ModeHold {
    /// The Segments and the translation shown, given `segments` and `translation` as the files
    /// hold them: what the Mode has made so far stands in their place.
    fn shown(
        &self,
        segments: &[Segment],
        translation: Option<Language>,
    ) -> (Vec<Segment>, Option<Language>) {
        match (&self.progress, &self.mode) {
            (Some(ModeProgress::Transcript(transcribed)), _) => (transcribed.clone(), None),
            (
                Some(ModeProgress::Translations(translations)),
                RunningMode::Translation { language, .. },
            ) => {
                let mut segments = segments.to_vec();
                for (index, translation) in translations {
                    if let Some(segment) = segments.get_mut(*index) {
                        segment.translation = translation.clone();
                    }
                }
                (segments, Some(*language))
            }
            _ => (segments.to_vec(), translation),
        }
    }

    fn is_on_current(&self, project: &Project) -> bool {
        self.directory == project.directory
            && project
                .current
                .as_ref()
                .is_some_and(|current| current.name == self.name)
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

    /// Keeps the subtitles `mode` writes of the named Resource in `directory` from being changed
    /// by anything else until the answer is dropped.
    pub fn hold_resource(
        &self,
        directory: &Path,
        name: &str,
        mode: RunningMode,
    ) -> ResourceHold<'_> {
        self.lock().mode_hold = Some(ModeHold {
            directory: directory.to_path_buf(),
            name: name.to_string(),
            mode,
            pending_batch: None,
            progress: None,
        });
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
        let mut held = self.lock();
        let project = held.project.as_mut().ok_or(Failure::NoProject)?;
        let source = project.translation_source(target)?;
        let count = source.transcript.segments.len();
        if let Some(index) = indexes.iter().flatten().find(|index| **index >= count) {
            return Err(Failure::Internal {
                detail: format!("no Segment at {index}"),
            });
        }
        if indexes.is_some() {
            project.show_translation(Some(target))?;
        }
        held.mode_hold = Some(ModeHold {
            directory: source.directory.clone(),
            name: source.name.clone(),
            mode: RunningMode::Translation {
                language: target,
                indexes,
            },
            pending_batch: None,
            progress: None,
        });
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
        let mut held = self.lock();
        let HeldProject {
            project, mode_hold, ..
        } = &mut *held;
        let project = project.as_mut().ok_or(Failure::NoProject)?;
        if let Some(hold) = mode_hold
            .as_ref()
            .filter(|hold| hold.is_on_current(project))
        {
            let is_held = match &hold.mode {
                RunningMode::Transcription => true,
                RunningMode::Translation { language, indexes } => {
                    let translation = project
                        .current
                        .as_ref()
                        .and_then(|current| current.translation);
                    let (_, shown) = hold.shown(&[], translation);
                    is_written(shown, *language, indexes.as_deref())
                }
            };
            if is_held {
                return Err(Failure::ModeRunning);
            }
        }
        change(project)
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
        self.change_unless_held(|_, _, _| true, |project| project.show_translation(language))
    }

    pub fn view(&self) -> Option<ProjectView> {
        let held = self.lock();
        held.project.as_ref().map(|project| {
            let current = project.current.as_ref();
            let history = current.and_then(|current| project.undo_histories.get(&current.name));
            let mode_hold = held
                .mode_hold
                .as_ref()
                .filter(|hold| hold.is_on_current(project));
            let (segments, shown_translation) = match current {
                Some(current) => {
                    let (segments, translation) =
                        (&current.transcript.segments[..], current.translation);
                    match mode_hold {
                        Some(hold) => hold.shown(segments, translation),
                        None => (segments.to_vec(), translation),
                    }
                }
                None => (Vec::new(), None),
            };
            ProjectView {
                directory: project.directory.clone(),
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
                has_undo: history.is_some_and(UndoHistory::has_undo),
                has_redo: history.is_some_and(UndoHistory::has_redo),
                running_mode: mode_hold.map(|hold| hold.mode.clone()),
                pending_batch: mode_hold.and_then(|hold| hold.pending_batch),
            }
        })
    }

    /// What a translation of the Current Resource starts from, to hand back to
    /// [`CurrentProject::show_translations`] and [`CurrentProject::write_translations`].
    #[cfg(test)]
    pub fn snapshot(&self) -> Result<TranslationSource, Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
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
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        let resource = project.resource(&project.current()?.name)?;
        resource.media.clone().ok_or(Failure::NoMedia)
    }

    /// The Current Resource's media file, the Language to transcribe it in and the subtitle to
    /// write, refused when that subtitle exists unless `overwrite`.
    pub fn transcription_target(&self, overwrite: bool) -> Result<TranscriptionTarget, Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        let resource = project.resource(&project.current()?.name)?;
        let media = resource.media.clone().ok_or(Failure::NoMedia)?;
        let subtitle = match &resource.subtitle {
            Some(path) if !overwrite => return Err(Failure::SubtitleExists { path: path.clone() }),
            Some(path) => path.clone(),
            None => project.export_path(SrtContent::Original)?,
        };
        Ok(TranscriptionTarget {
            directory: project.directory.clone(),
            name: project.current()?.name.clone(),
            media,
            subtitle,
            language: project.language,
            model: project.options.models.transcription.clone(),
            overrides: project.options.transcription,
        })
    }

    /// Shows `segments` as what the running Mode has transcribed so far.
    pub fn show_transcribed(&self, segments: Vec<Segment>) {
        self.show_progress(|progress| *progress = Some(ModeProgress::Transcript(segments)));
    }

    /// Adds a Segment just transcribed to what the running Mode shows.
    pub fn push_segment(&self, segment: Segment) {
        self.show_progress(|progress| match progress {
            Some(ModeProgress::Transcript(segments)) => segments.push(segment),
            _ => *progress = Some(ModeProgress::Transcript(vec![segment])),
        });
    }

    /// Shows the translations finished so far of the Segments `source` was taken with, by
    /// position, and none after them; translating chosen Segments again shows only theirs.
    pub fn show_translations(&self, source: &TranslationSource, translated_segments: &[Segment]) {
        let mut held = self.lock();
        let Some(hold) = held.mode_hold.as_mut() else {
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

    fn show_progress(&self, change: impl FnOnce(&mut Option<ModeProgress>)) {
        if let Some(hold) = self.lock().mode_hold.as_mut() {
            change(&mut hold.progress);
        }
    }

    /// Writes the transcription whisper-cli wrote as the original subtitle of `job`, kept as a
    /// Backup first when the Project Options say so, its Speakers to each translation, and the
    /// Bilingual SRTs it feeds, as one change; the Current Resource is then read from them in
    /// place of what the Mode showed.
    pub fn write_transcription(
        &self,
        job: &TranscriptionTarget,
        srt: String,
    ) -> Result<(), Failure> {
        let mut held = self.lock();
        let HeldProject { project, mode_hold } = &mut *held;
        let mut project = project
            .as_mut()
            .filter(|project| project.directory == job.directory);
        let previous = files::transcript_at(&job.subtitle)?;
        let before = project
            .as_ref()
            .map(|project| project.subtitle_snapshot(&job.name))
            .transpose()?;
        if project
            .as_ref()
            .is_some_and(|project| project.options.is_overwrite_backed_up)
        {
            files::back_up(
                &job.directory,
                &job.subtitle,
                SystemTime::now(),
                BackupKind::Overwrite,
            )?;
        }
        files::write_srt(&job.subtitle, srt)?;
        if let Some(project) = project.as_mut() {
            project.pair_again(Some(&job.name))?;
        }
        files::back_up(
            &job.directory,
            &job.subtitle,
            SystemTime::now(),
            BackupKind::Output,
        )?;
        if let Some(project) = project.as_mut() {
            project.backed_up_subtitles.insert(job.subtitle.clone());
            project.write_speakers_to_translations(
                &job.name,
                &previous,
                project.options.is_overwrite_backed_up,
            )?;
            project.write_bilingual_subtitles(&job.name, None)?;
            if let Some(before) = before {
                project.record_change(&job.name, before)?;
            }
            if project.is_current(&job.name) {
                project.read_again_showing(&job.name, None)?;
            }
        }
        if let Some(hold) = mode_hold.as_mut() {
            hold.progress = None;
        }
        Ok(())
    }

    /// Writes the translations into `target` to the Resource's translation file, whichever
    /// Resource is current now, and, while it is still current, shows them and records `target`
    /// as the Project's translation Language.
    pub fn write_translations(
        &self,
        source: &TranslationSource,
        target: Language,
        segments: Vec<Segment>,
    ) -> Result<(), Failure> {
        self.write_translation_file(source, target, true, |_| Ok(Transcript { segments }))
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
    ) -> Result<(), Failure> {
        self.write_translation_file(source, target, false, |project| {
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
    /// it feeds, as one change; with `is_backed_up` it first keeps the file it replaces when the
    /// Project Options ask, and afterwards the new one, as Backups, and else keeps the file as its
    /// first change since the Project was opened does. The Current Resource, while it is that Resource, is then read
    /// from the files in place of what the Mode showed.
    fn write_translation_file(
        &self,
        source: &TranslationSource,
        target: Language,
        is_backed_up: bool,
        translation: impl FnOnce(Option<&Project>) -> Result<Transcript, Failure>,
    ) -> Result<(), Failure> {
        let mut held = self.lock();
        let HeldProject { project, mode_hold } = &mut *held;
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
        let before = project
            .as_ref()
            .map(|project| project.subtitle_snapshot(&source.name))
            .transpose()?;
        if is_backed_up
            && project
                .as_ref()
                .is_some_and(|project| project.options.is_overwrite_backed_up)
        {
            files::back_up(
                &source.directory,
                &path,
                SystemTime::now(),
                BackupKind::Overwrite,
            )?;
        }
        if let Some(project) = project.as_mut().filter(|_| !is_backed_up) {
            project.back_up_first_change(&path)?;
        }
        files::write_srt(&path, translation_srt(&translation, speaker_names))?;
        if let Some(project) = project.as_mut() {
            project.pair_again(Some(&source.name))?;
        }
        if is_backed_up {
            files::back_up(
                &source.directory,
                &path,
                SystemTime::now(),
                BackupKind::Output,
            )?;
            if let Some(project) = project.as_mut() {
                project.backed_up_subtitles.insert(path.clone());
            }
        }
        if let Some(project) = project.as_mut() {
            project.write_bilingual_subtitles(&source.name, Some(target))?;
            if let Some(before) = before {
                project.record_change(&source.name, before)?;
            }
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
        Ok(())
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
        let mut held = self.lock();
        let resources = held.resources_in_directory()?;
        Ok(Reload::from_kept(held.reload(resources)?))
    }

    /// Reloads the Project when its directory pairs into other Resources, or a subtitle of the
    /// Current Resource was changed elsewhere, answering what it did.
    pub fn reload_if_changed(&self) -> Result<Reload, Failure> {
        let mut held = self.lock();
        let resources = held.resources_in_directory()?;
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        let is_changed = resources != project.resources
            || (project.current.is_some() && project.is_changed_elsewhere()?);
        if !is_changed {
            return Ok(Reload::Unchanged);
        }
        Ok(Reload::from_kept(held.reload(resources)?))
    }

    /// Makes an edit and writes it back, unless a subtitle was changed elsewhere since Tsuzuri last
    /// read or wrote it: then the Current Resource is read again instead, keeping that change.
    pub fn edit(&self, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {
        let is_written =
            |shown: Option<Language>, written: Language, indexes: Option<&[usize]>| match field {
                SegmentField::Text => false,
                SegmentField::Translation => {
                    shown == Some(written) && indexes.is_none_or(|indexes| indexes.contains(&index))
                }
                SegmentField::Speaker => true,
            };
        self.change_unless_held(is_written, |project| {
            project.refuse_changed_elsewhere()?;
            project.make_undoable_change(|project| {
                project.read_current_transcript()?;
                let previous = project.current()?.transcript.clone();
                let segment = project
                    .current_mut()?
                    .transcript
                    .segments
                    .get_mut(index)
                    .ok_or_else(|| Failure::Internal {
                        detail: format!("no Segment at {index}"),
                    })?;
                match field {
                    SegmentField::Text => segment.text = value,
                    SegmentField::Translation => segment.translation = Some(value),
                    SegmentField::Speaker => segment.speaker = speaker_from(&value),
                }
                project.write_back(field, &previous)
            })
        })
    }

    /// Gives each Segment at `indexes` the Speaker `speaker`, or none when it is empty, as one
    /// change, written back as an edited Speaker is.
    pub fn set_speakers(&self, indexes: &[usize], speaker: &str) -> Result<(), Failure> {
        self.change_unless_held(
            |_, _, _| true,
            |project| {
                project.refuse_changed_elsewhere()?;
                project.make_undoable_change(|project| {
                    project.read_current_transcript()?;
                    let previous = project.current()?.transcript.clone();
                    let segments = &mut project.current_mut()?.transcript.segments;
                    if let Some(index) = indexes.iter().find(|index| **index >= segments.len()) {
                        return Err(Failure::Internal {
                            detail: format!("no Segment at {index}"),
                        });
                    }
                    for index in indexes {
                        segments[*index].speaker = speaker_from(speaker);
                    }
                    project.write_back(SegmentField::Speaker, &previous)
                })
            },
        )
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
        self.change_unless_held(
            |_, written, _| Some(written) == language,
            |project| {
                project.refuse_changed_elsewhere()?;
                project.make_undoable_change(|project| project.restore_version(language, backup))
            },
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
        self.change_unless_held(
            |_, written, _| Some(written) == language,
            |project| {
                project.refuse_changed_elsewhere()?;
                project
                    .make_undoable_change(|project| project.revert_row(language, backup, row, part))
            },
        )
    }

    pub fn undo(&self) -> Result<(), Failure> {
        self.change_unless_held(
            |_, _, _| true,
            |project| {
                project.refuse_changed_elsewhere()?;
                project.undo()
            },
        )
    }

    pub fn redo(&self) -> Result<(), Failure> {
        self.change_unless_held(
            |_, _, _| true,
            |project| {
                project.refuse_changed_elsewhere()?;
                project.redo()
            },
        )
    }

    pub fn change_segments(&self, change: SegmentChange) -> Result<(), Failure> {
        self.change_unless_held(
            |_, _, _| true,
            |project| {
                project.refuse_changed_elsewhere()?;
                project.make_undoable_change(|project| project.change_segments(change))
            },
        )
    }

    pub fn export_path(&self, content: SrtContent) -> Result<PathBuf, Failure> {
        let held = self.lock();
        held.project
            .as_ref()
            .ok_or(Failure::NoProject)?
            .export_path(content)
    }

    pub fn to_srt(&self, content: SrtContent) -> Result<String, Failure> {
        let held = self.lock();
        held.project
            .as_ref()
            .ok_or(Failure::NoProject)?
            .to_srt(content)
            .map_err(Failure::from)
    }

    /// Writes the Current Resource to `path` as SRT carrying `content`.
    pub fn save_srt(&self, path: &Path, content: SrtContent) -> Result<(), Failure> {
        files::write_srt(path, self.to_srt(content)?)
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
mod tests {
    use super::*;
    use crate::project::{BilingualOrder, ProjectConfig, ProjectModels, TranscriptionOverrides};
    use crate::test_support::{backups, output_backups, overwrite_backups, project_of, TempDir};

    fn segment(text: &str, translation: Option<&str>) -> Segment {
        Segment {
            start_ms: 0,
            end_ms: 1_000,
            speaker: None,
            text: text.to_string(),
            translation: translation.map(str::to_string),
        }
    }

    fn cue(text: &str) -> String {
        format!("1\n00:00:00,000 --> 00:00:01,000\n{text}\n")
    }

    fn directory_of(name: &str, files: &[(&str, &str)]) -> TempDir {
        let dir = TempDir::new(name);
        for (file_name, content) in files {
            std::fs::write(dir.path().join(file_name), content).unwrap();
        }
        dir
    }

    fn current_project_of(segments: Vec<Segment>) -> CurrentProject {
        let current = CurrentProject::default();
        current.replace(project_of(segments));
        current
    }

    fn project_in(dir: &TempDir) -> CurrentProject {
        let current = CurrentProject::default();
        current.replace(
            Project::open(dir.path().to_path_buf(), Language::TraditionalChinese).unwrap(),
        );
        current
    }

    fn segments(current: &CurrentProject) -> Vec<Segment> {
        current.view().unwrap().segments().to_vec()
    }

    fn texts(current: &CurrentProject) -> Vec<String> {
        segments(current)
            .into_iter()
            .map(|segment| segment.translation.unwrap_or(segment.text))
            .collect()
    }

    // @behavior PJ-001
    #[test]
    fn opens_a_directory_as_the_project() {
        let dir = directory_of(
            "pj-open",
            &[
                ("ep01.mp4", ""),
                ("ep01.srt", &cue("你好")),
                ("ep02.mp4", ""),
            ],
        );

        let current = project_in(&dir);

        assert_eq!(
            current.view().unwrap().resource_names(),
            vec!["ep01", "ep02"]
        );
    }

    // @behavior PJ-015
    #[test]
    fn selects_the_first_resource_of_an_opened_directory() {
        let dir = directory_of(
            "pj-first",
            &[("ep02.srt", &cue("第二集")), ("ep01.srt", &cue("第一集"))],
        );

        let current = project_in(&dir);

        let view = current.view().unwrap();
        assert_eq!(
            (view.current_resource(), texts(&current)),
            (Some("ep01"), vec!["第一集".to_string()])
        );
    }

    #[test]
    fn opens_a_directory_without_resources_with_none_current() {
        let dir = directory_of("pj-empty", &[("notes.txt", "")]);

        let current = project_in(&dir);

        assert_eq!(current.view().unwrap().current_resource(), None);
    }

    // @behavior PJ-020
    #[test]
    fn shows_another_translation_of_the_current_resource() {
        let dir = directory_of(
            "pj-show",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Hello")),
                ("ep01.ja.srt", &cue("こんにちは")),
            ],
        );
        let current = project_in(&dir);

        current.show_translation(Some(Language::Japanese)).unwrap();

        assert_eq!(texts(&current), vec!["こんにちは".to_string()]);
    }

    // @behavior PJ-108
    #[test]
    fn shows_a_translation_again_after_showing_none() {
        let dir = directory_of(
            "pj-show-again",
            &[("talk.hd.mp4", ""), ("talk.hd.srt", &cue("你好"))],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("你好", Some("Hello"))],
            )
            .unwrap();
        current.show_translation(None).unwrap();

        current.show_translation(Some(Language::English)).unwrap();

        assert_eq!(texts(&current), vec!["Hello".to_string()]);
    }

    #[test]
    fn keeps_edited_text_when_showing_another_translation() {
        let dir = directory_of(
            "pj-show-edited",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "大家好".to_string())
            .unwrap();

        current.show_translation(None).unwrap();

        assert_eq!(segments(&current), vec![segment("大家好", None)]);
    }

    // @behavior PJ-021
    #[test]
    fn selects_another_resource() {
        let dir = directory_of(
            "pj-select",
            &[("ep01.srt", &cue("第一集")), ("ep02.srt", &cue("第二集"))],
        );
        let current = project_in(&dir);

        current.select("ep02").unwrap();

        assert_eq!(texts(&current), vec!["第二集".to_string()]);
    }

    #[test]
    fn refuses_a_resource_the_project_does_not_have() {
        let current = current_project_of(vec![]);

        assert_eq!(current.select("ep09"), Err(Failure::NoResource));
    }

    // @behavior PJ-007
    #[test]
    fn opens_the_directory_of_an_srt_file() {
        let dir = directory_of(
            "pj-open-srt",
            &[("interview.srt", &cue("訪談")), ("talk.srt", &cue("演講"))],
        );

        let project =
            open_directory_of(&dir.path().join("talk.srt"), Language::TraditionalChinese).unwrap();

        assert_eq!(
            (
                project.directory.as_path(),
                project.current.map(|current| current.name)
            ),
            (dir.path(), Some("talk".to_string()))
        );
    }

    // @behavior PJ-023
    #[test]
    fn opens_a_translation_srt_file_showing_that_translation() {
        let dir = directory_of(
            "pj-open-translation",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Hello")),
                ("ep01.ja.srt", &cue("こんにちは")),
            ],
        );

        let project = open_directory_of(
            &dir.path().join("ep01.ja.srt"),
            Language::TraditionalChinese,
        )
        .unwrap();

        let current = project.current.unwrap();
        assert_eq!(
            (current.name.as_str(), current.translation),
            ("ep01", Some(Language::Japanese))
        );
    }

    // @behavior PJ-011
    #[test]
    fn starts_a_new_project_without_a_translation_glossary() {
        let with_glossary = directory_of(
            "pj-glossary",
            &[("glossary.csv", "zh-TW,en\n阿福,Alfred\n")],
        );
        let without_glossary = directory_of("pj-no-glossary", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&with_glossary);

        current.replace(
            Project::open(
                without_glossary.path().to_path_buf(),
                Language::TraditionalChinese,
            )
            .unwrap(),
        );

        assert_eq!(current.view().unwrap().translation_glossary(), None);
    }

    // @behavior PJ-024
    #[test]
    fn reads_the_primary_language_from_the_project_config() {
        let dir = directory_of(
            "pj-config-read",
            &[("tsuzuri.config.json", r#"{"language":"ja"}"#)],
        );

        let current = project_in(&dir);

        assert_eq!(current.view().unwrap().language(), Language::Japanese);
    }

    fn config_of(dir: &TempDir) -> ProjectConfig {
        ProjectConfig::load(dir.path()).unwrap()
    }

    // @behavior PJ-025
    #[test]
    fn records_a_new_primary_language_in_the_project_config() {
        let dir = directory_of("pj-config-write", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);

        current.set_language(Language::Japanese).unwrap();

        assert_eq!(config_of(&dir).language, Some(Language::Japanese));
    }

    // @behavior PJ-026
    #[test]
    fn pairs_subtitles_again_under_a_new_primary_language() {
        let dir = directory_of("pj-config-pair", &[("ep01.ja.srt", &cue("こんにちは"))]);
        let current = project_in(&dir);

        current.set_language(Language::Japanese).unwrap();

        assert_eq!(texts(&current), vec!["こんにちは".to_string()]);
    }

    // @behavior PJ-027
    #[test]
    fn records_the_translation_language_in_the_project_config() {
        let dir = directory_of("pj-config-translation", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("你好", Some("Hello"))],
            )
            .unwrap();

        assert_eq!(
            config_of(&dir).translation_language,
            Some(Language::English)
        );
    }

    fn file_text(dir: &TempDir, name: &str) -> String {
        std::fs::read_to_string(dir.path().join(name)).unwrap()
    }

    // @behavior PJ-028
    #[test]
    fn writes_an_edited_original_back_to_its_file() {
        let dir = directory_of("pj-write-original", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Text, "大家好".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.srt"), cue("大家好"));
    }

    // @behavior PJ-029
    #[test]
    fn writes_an_edited_translation_back_to_its_file() {
        let dir = directory_of(
            "pj-write-translation",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
    }

    // @behavior PJ-030
    #[test]
    fn leaves_untranslated_segments_out_of_a_translation_file() {
        let original =
            "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n";
        let dir = directory_of(
            "pj-write-untranslated",
            &[("ep01.srt", original), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
    }

    // @behavior PJ-012
    #[test]
    fn names_an_export_by_the_resource_and_its_languages() {
        let mut project = project_of(vec![segment("大家好", Some("Hello"))]);
        if let Some(current) = project.current.as_mut() {
            current.translation = Some(Language::English);
        }
        let current = CurrentProject::default();
        current.replace(project);

        let paths = [
            SrtContent::Original,
            SrtContent::Translation,
            SrtContent::Bilingual,
        ]
        .map(|content| current.export_path(content).unwrap());

        assert_eq!(
            paths,
            [
                PathBuf::from("/talks/lecture.srt"),
                PathBuf::from("/talks/lecture.en.srt"),
                PathBuf::from("/talks/lecture.zh-TW.en.srt"),
            ]
        );
    }

    // @behavior PJ-031
    #[test]
    fn writes_the_translation_beside_its_original() {
        let original =
            "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n";
        let dir = directory_of("tl-write-file", &[("ep01.srt", original)]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        let translation: Vec<Segment> = source
            .transcript
            .segments
            .iter()
            .map(|segment| Segment {
                translation: Some(format!("EN:{}", segment.text)),
                ..segment.clone()
            })
            .collect();

        current
            .write_translations(&source, Language::English, translation)
            .unwrap();

        assert_eq!(
            file_text(&dir, "ep01.en.srt"),
            "1\n00:00:00,000 --> 00:00:01,000\nEN:你好\n\n2\n00:00:01,000 --> 00:00:02,000\nEN:世界\n"
        );
    }

    // @behavior PJ-032
    #[test]
    fn writes_the_translation_of_a_resource_no_longer_current() {
        let dir = directory_of(
            "tl-write-other",
            &[("ep01.srt", &cue("你好")), ("ep02.srt", &cue("再見"))],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        current.select("ep02").unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("你好", Some("Hello"))],
            )
            .unwrap();

        assert_eq!(
            (file_text(&dir, "ep01.en.srt"), segments(&current)),
            (cue("Hello"), vec![segment("再見", None)])
        );
    }

    // @behavior PJ-003
    #[test]
    fn holds_edits_to_text_and_translation() {
        let dir = directory_of(
            "pj-edit",
            &[
                ("ep01.srt", &cue("竹子搞")),
                ("ep01.en.srt", &cue("Bamboo")),
            ],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();
        current
            .edit(0, SegmentField::Translation, "Transcript".to_string())
            .unwrap();

        assert_eq!(
            segments(&current),
            vec![segment("逐字稿", Some("Transcript"))]
        );
    }

    /// A Project in `zh-TW` of `ep01` translated into `en`, whose Bilingual Order puts the
    /// translation first.
    fn translation_first_project_in(dir: &TempDir) -> CurrentProject {
        std::fs::write(dir.path().join("ep01.srt"), cue("大家好")).unwrap();
        std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();
        let current = project_in(dir);
        current
            .set_options(ProjectOptions {
                bilingual_order: BilingualOrder::TranslationFirst,
                ..ProjectOptions::default()
            })
            .unwrap();
        current
    }

    // @behavior PJ-044
    #[test]
    fn puts_the_translation_first_in_a_bilingual_srt() {
        let dir = TempDir::new("pj-translation-first");
        let current = translation_first_project_in(&dir);

        let srt = current.to_srt(SrtContent::Bilingual).unwrap();

        assert_eq!(srt, cue("Hello\n大家好"));
    }

    // @behavior PJ-045
    #[test]
    fn names_a_bilingual_srt_in_its_bilingual_order() {
        let dir = TempDir::new("pj-translation-first-name");
        let current = translation_first_project_in(&dir);

        let path = current.export_path(SrtContent::Bilingual).unwrap();

        assert_eq!(path, dir.path().join("ep01.en.zh-TW.srt"));
    }

    // @behavior PJ-046
    #[test]
    fn keeps_the_project_options_in_the_project_config() {
        let dir = TempDir::new("pj-options-kept");
        translation_first_project_in(&dir);

        let reopened_project = project_in(&dir);

        assert_eq!(
            reopened_project.view().unwrap().options().bilingual_order,
            BilingualOrder::TranslationFirst
        );
    }

    // @behavior PJ-104
    #[test]
    fn keeps_the_project_models_and_transcription_settings_in_the_project_config() {
        let dir = TempDir::new("pj-models-kept");
        let options = ProjectOptions {
            models: ProjectModels {
                transcription: Some(PathBuf::from("/models/kotoba.bin")),
                ..ProjectModels::default()
            },
            transcription: TranscriptionOverrides {
                has_vad: Some(true),
                ..TranscriptionOverrides::default()
            },
            ..ProjectOptions::default()
        };
        project_in(&dir).set_options(options.clone()).unwrap();

        let reopened_project = project_in(&dir);

        assert_eq!(reopened_project.view().unwrap().options(), &options);
    }

    /// A Project in `zh-TW` of `ep01` translated into each of `translations`, saving Bilingual
    /// SRTs as `is_bilingual_autosaved` says.
    fn bilingual_project_in(
        dir: &TempDir,
        translations: &[(&str, &str)],
        is_bilingual_autosaved: bool,
    ) -> CurrentProject {
        std::fs::write(dir.path().join("ep01.srt"), cue("大家好")).unwrap();
        for (code, text) in translations {
            std::fs::write(dir.path().join(format!("ep01.{code}.srt")), cue(text)).unwrap();
        }
        let current = project_in(dir);
        current
            .set_options(ProjectOptions {
                is_bilingual_autosaved,
                ..ProjectOptions::default()
            })
            .unwrap();
        current
    }

    fn read(dir: &TempDir, file_name: &str) -> String {
        std::fs::read_to_string(dir.path().join(file_name)).unwrap()
    }

    // @behavior PJ-050
    #[test]
    fn saves_the_bilingual_srt_of_an_edited_translation() {
        let dir = TempDir::new("pj-bilingual-translation");
        let current = bilingual_project_in(&dir, &[("en", "Hello")], true);

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.zh-TW.en.srt"), cue("大家好\nHi"));
    }

    // @behavior PJ-051
    #[test]
    fn saves_every_bilingual_srt_when_the_original_is_edited() {
        let dir = TempDir::new("pj-bilingual-original");
        let current = bilingual_project_in(&dir, &[("en", "Hello"), ("ja", "こんにちは")], true);

        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();

        assert_eq!(
            [
                read(&dir, "ep01.zh-TW.en.srt"),
                read(&dir, "ep01.zh-TW.ja.srt")
            ],
            [cue("您好\nHello"), cue("您好\nこんにちは")]
        );
    }

    // @behavior PJ-052
    #[test]
    fn saves_the_bilingual_srt_once_translated() {
        let dir = TempDir::new("pj-bilingual-translated");
        let current = bilingual_project_in(&dir, &[], true);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some("Hello"))],
            )
            .unwrap();

        assert_eq!(read(&dir, "ep01.zh-TW.en.srt"), cue("大家好\nHello"));
    }

    // @behavior PJ-056
    #[test]
    fn writes_an_edited_speaker_back_to_the_subtitle() {
        let dir = directory_of("pj-speaker", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Speaker, "co".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), cue("co: 你好"));
    }

    /// SRT text of cues each `(start ms, end ms, text)`.
    fn srt_of(cues: &[(u64, u64, &str)]) -> String {
        Transcript {
            segments: cues
                .iter()
                .map(|(start_ms, end_ms, text)| Segment {
                    start_ms: *start_ms,
                    end_ms: *end_ms,
                    speaker: None,
                    text: text.to_string(),
                    translation: None,
                })
                .collect(),
        }
        .to_srt(SrtContent::Original)
    }

    /// A Project in `zh-TW` of `ep01` holding `original`, and `translation` as its `en` translation.
    fn changing_project_in(
        dir: &TempDir,
        original: &[(u64, u64, &str)],
        translation: &[(u64, u64, &str)],
    ) -> CurrentProject {
        std::fs::write(dir.path().join("ep01.srt"), srt_of(original)).unwrap();
        if !translation.is_empty() {
            std::fs::write(dir.path().join("ep01.en.srt"), srt_of(translation)).unwrap();
        }
        project_in(dir)
    }

    // @behavior PJ-057
    #[test]
    fn changes_a_segments_times_in_every_subtitle() {
        let dir = TempDir::new("pj-change-times");
        let current = changing_project_in(&dir, &[(0, 1_000, "你好")], &[(0, 1_000, "Hello")]);

        current
            .change_segments(SegmentChange::Times {
                index: 0,
                start_ms: 500,
                end_ms: 1_500,
            })
            .unwrap();

        assert_eq!(
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
            [
                srt_of(&[(500, 1_500, "你好")]),
                srt_of(&[(500, 1_500, "Hello")])
            ]
        );
    }

    // @behavior PJ-058
    #[test]
    fn inserts_a_segment_into_the_gap_after_another() {
        let dir = TempDir::new("pj-insert-after");
        let current = changing_project_in(&dir, &[(0, 1_000, "你好"), (3_000, 4_000, "再見")], &[]);

        current
            .change_segments(SegmentChange::InsertionAfter { index: 0 })
            .unwrap();

        assert_eq!(
            segments(&current)
                .iter()
                .map(|segment| (segment.start_ms, segment.end_ms, segment.text.as_str()))
                .collect::<Vec<_>>(),
            [
                (0, 1_000, "你好"),
                (1_000, 3_000, ""),
                (3_000, 4_000, "再見")
            ]
        );
    }

    // @behavior PJ-059
    #[test]
    fn inserts_a_segment_before_the_first() {
        let dir = TempDir::new("pj-insert-before");
        let current = changing_project_in(&dir, &[(5_000, 6_000, "你好")], &[]);

        current
            .change_segments(SegmentChange::InsertionBefore { index: 0 })
            .unwrap();

        let first = &segments(&current)[0];
        assert_eq!(
            (first.start_ms, first.end_ms, first.text.as_str()),
            (3_000, 5_000, "")
        );
    }

    // @behavior PJ-060
    #[test]
    fn deletes_a_segment_from_every_subtitle() {
        let dir = TempDir::new("pj-delete");
        let current = changing_project_in(
            &dir,
            &[(0, 1_000, "你好"), (1_000, 2_000, "世界")],
            &[(0, 1_000, "Hello"), (1_000, 2_000, "world")],
        );

        current
            .change_segments(SegmentChange::Deletion { indexes: vec![0] })
            .unwrap();

        assert_eq!(
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
            [
                srt_of(&[(1_000, 2_000, "世界")]),
                srt_of(&[(1_000, 2_000, "world")])
            ]
        );
    }

    // @behavior PJ-121
    #[test]
    fn deletes_segments_apart_from_each_other_as_one_change() {
        let dir = TempDir::new("pj-delete-apart");
        let current = changing_project_in(
            &dir,
            &[
                (0, 1_000, "你好"),
                (1_000, 2_000, "今天"),
                (2_000, 3_000, "世界"),
            ],
            &[
                (0, 1_000, "Hello"),
                (1_000, 2_000, "today"),
                (2_000, 3_000, "world"),
            ],
        );

        current
            .change_segments(SegmentChange::Deletion {
                indexes: vec![2, 0],
            })
            .unwrap();
        let after_deletion = [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")];
        current.undo().unwrap();

        assert_eq!(
            (
                after_deletion,
                [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")]
            ),
            (
                [
                    srt_of(&[(1_000, 2_000, "今天")]),
                    srt_of(&[(1_000, 2_000, "today")])
                ],
                [
                    srt_of(&[
                        (0, 1_000, "你好"),
                        (1_000, 2_000, "今天"),
                        (2_000, 3_000, "世界")
                    ]),
                    srt_of(&[
                        (0, 1_000, "Hello"),
                        (1_000, 2_000, "today"),
                        (2_000, 3_000, "world")
                    ])
                ]
            )
        );
    }

    // @behavior PJ-061
    #[test]
    fn splits_a_segment_at_a_point_in_its_text() {
        let dir = TempDir::new("pj-split");
        let current = changing_project_in(
            &dir,
            &[(0, 2_000, "你好世界")],
            &[(0, 2_000, "Hello world")],
        );

        current
            .change_segments(SegmentChange::Split { index: 0, at: 2 })
            .unwrap();

        assert_eq!(
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
            [
                srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
                srt_of(&[(0, 1_000, "Hello world")])
            ]
        );
    }

    // @behavior PJ-062
    #[test]
    fn merges_a_run_of_segments() {
        let dir = TempDir::new("pj-merge");
        let current = changing_project_in(
            &dir,
            &[(0, 1_000, "你好"), (1_000, 2_000, "世界")],
            &[(0, 1_000, "Hello"), (1_000, 2_000, "world")],
        );

        current
            .change_segments(SegmentChange::Merge { first: 0, last: 1 })
            .unwrap();

        assert_eq!(
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
            [
                srt_of(&[(0, 2_000, "你好\n世界")]),
                srt_of(&[(0, 2_000, "Hello\nworld")])
            ]
        );
    }

    // @behavior PJ-063
    #[test]
    fn shifts_a_run_of_segments() {
        let dir = TempDir::new("pj-shift");
        let current = changing_project_in(
            &dir,
            &[(0, 1_000, "一"), (1_000, 2_000, "二"), (2_000, 3_000, "三")],
            &[],
        );

        current
            .change_segments(SegmentChange::Shift {
                first: 1,
                last: 2,
                offset_ms: 500,
            })
            .unwrap();

        assert_eq!(
            read(&dir, "ep01.srt"),
            srt_of(&[(0, 1_000, "一"), (1_500, 2_500, "二"), (2_500, 3_500, "三")])
        );
    }

    // @behavior PJ-064
    #[test]
    fn stops_a_shift_at_the_start_of_the_media() {
        let dir = TempDir::new("pj-shift-back");
        let current = changing_project_in(&dir, &[(1_000, 3_000, "你好")], &[]);

        current
            .change_segments(SegmentChange::Shift {
                first: 0,
                last: 0,
                offset_ms: -2_000,
            })
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_000, "你好")]));
    }

    // @behavior PJ-065
    #[test]
    fn refuses_a_segment_that_ends_before_it_starts() {
        let dir = TempDir::new("pj-invalid-times");
        let current = changing_project_in(&dir, &[(0, 1_000, "你好")], &[]);

        let result = current.change_segments(SegmentChange::Times {
            index: 0,
            start_ms: 2_000,
            end_ms: 1_000,
        });

        assert_eq!(
            (result, read(&dir, "ep01.srt")),
            (Err(Failure::InvalidTimes), srt_of(&[(0, 1_000, "你好")]))
        );
    }

    // @behavior PJ-101
    #[test]
    fn moves_the_edge_two_segments_share_in_every_subtitle() {
        let dir = TempDir::new("pj-boundary");
        let current = changing_project_in(
            &dir,
            &[(0, 1_000, "你好"), (1_000, 2_000, "世界")],
            &[(0, 1_000, "Hello"), (1_000, 2_000, "world")],
        );

        current
            .change_segments(SegmentChange::Boundary {
                index: 0,
                at_ms: 1_500,
            })
            .unwrap();

        assert_eq!(
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
            [
                srt_of(&[(0, 1_500, "你好"), (1_500, 2_000, "世界")]),
                srt_of(&[(0, 1_500, "Hello"), (1_500, 2_000, "world")])
            ]
        );
    }

    // @behavior PJ-102
    #[test]
    fn refuses_to_move_a_shared_edge_past_either_segment() {
        let dir = TempDir::new("pj-boundary-past");
        let current = changing_project_in(&dir, &[(0, 1_000, "你好"), (1_000, 2_000, "世界")], &[]);

        let result = current.change_segments(SegmentChange::Boundary {
            index: 0,
            at_ms: 2_500,
        });

        assert_eq!(
            (result, read(&dir, "ep01.srt")),
            (
                Err(Failure::InvalidTimes),
                srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")])
            )
        );
    }

    // @behavior PJ-103
    #[test]
    fn inserts_a_segment_at_times_of_its_own() {
        let dir = TempDir::new("pj-insert-at");
        let current = changing_project_in(&dir, &[(0, 1_000, "你好"), (3_000, 4_000, "再見")], &[]);

        current
            .change_segments(SegmentChange::Insertion {
                start_ms: 1_500,
                end_ms: 2_500,
            })
            .unwrap();

        assert_eq!(
            segments(&current)
                .iter()
                .map(|segment| (segment.start_ms, segment.end_ms, segment.text.as_str()))
                .collect::<Vec<_>>(),
            [
                (0, 1_000, "你好"),
                (1_500, 2_500, ""),
                (3_000, 4_000, "再見")
            ]
        );
    }

    /// Whether `backups` is one Backup of `stem`, stamped with a UTC time, holding `content`.
    fn is_one_backup_of(backups: &[(String, String)], stem: &str, content: &str) -> bool {
        match backups {
            [(name, held)] => {
                let stamp = name
                    .strip_prefix(&format!("{stem}."))
                    .and_then(|rest| rest.strip_suffix("Z.srt"));
                stamp.is_some_and(|stamp| stamp.len() == 15) && held == content
            }
            _ => false,
        }
    }

    /// A Project in `zh-TW` of `ep01` translated into `en` as `Hello`, keeping Backups as asked.
    fn backup_project_in(dir: &TempDir, is_overwrite_backed_up: bool) -> CurrentProject {
        std::fs::write(dir.path().join("ep01.srt"), cue("大家好")).unwrap();
        std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();
        let current = project_in(dir);
        current
            .set_options(ProjectOptions {
                is_overwrite_backed_up,
                ..ProjectOptions::default()
            })
            .unwrap();
        current
    }

    // @behavior PJ-067
    #[test]
    fn backs_up_a_translation_before_it_is_written_again() {
        let dir = TempDir::new("pj-backup-translation");
        let current = backup_project_in(&dir, true);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some("Hi"))],
            )
            .unwrap();

        assert!(is_one_backup_of(
            &overwrite_backups(dir.path()),
            "ep01.en",
            &cue("Hello")
        ));
    }

    // @behavior PJ-068
    #[test]
    fn keeps_no_overwrite_unless_asked() {
        let dir = TempDir::new("pj-backup-off");
        let current = backup_project_in(&dir, false);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some("Hi"))],
            )
            .unwrap();

        let files: Vec<String> = backups(dir.path())
            .into_iter()
            .map(|(file, _)| file)
            .collect();
        assert!(
            matches!(files.as_slice(), [file] if file.starts_with("ep01.en.") && file.ends_with(".output.srt"))
        );
    }

    // @behavior PJ-088
    #[test]
    fn keeps_what_a_transcription_wrote_as_an_output() {
        let dir = directory_of("pj-output-transcribed", &[("lecture.mp4", "")]);
        let current = project_in(&dir);
        let target = current.transcription_target(true).unwrap();

        current.write_transcription(&target, cue("你好")).unwrap();

        let contents: Vec<String> = output_backups(dir.path())
            .into_iter()
            .map(|(_, content)| content)
            .collect();
        assert_eq!(contents, [cue("你好")]);
    }

    // @behavior PJ-089
    #[test]
    fn keeps_what_a_translation_wrote_as_an_output() {
        let dir = directory_of("pj-output-translated", &[("ep01.srt", &cue("大家好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some("Hello"))],
            )
            .unwrap();

        assert!(output_backups(dir.path())
            .iter()
            .any(|(file, content)| file.starts_with("ep01.en.") && *content == cue("Hello")));
    }

    // @behavior PJ-109
    #[test]
    fn lists_a_translation_whose_output_could_not_be_kept() {
        let dir = directory_of(
            "pj-output-failed",
            &[("ep01.srt", &cue("大家好")), (".tsuzuri", "")],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();

        let result = current.write_translations(
            &source,
            Language::English,
            vec![segment("大家好", Some("Hello"))],
        );

        assert_eq!(
            (
                result.is_err(),
                current.view().unwrap().resources[0]
                    .translation_languages
                    .clone()
            ),
            (true, vec![Language::English])
        );
    }

    // @behavior PJ-069
    #[test]
    fn leaves_backups_out_of_the_resources() {
        let dir = directory_of("pj-backup-hidden", &[("ep01.srt", &cue("你好"))]);
        let history = dir.path().join(files::HISTORY_DIR);
        std::fs::create_dir_all(&history).unwrap();
        std::fs::write(history.join("ep01.20260925T023000Z.srt"), cue("舊的")).unwrap();
        std::fs::write(
            history.join("ep01.20260925T023001Z.output.srt"),
            cue("你好"),
        )
        .unwrap();

        let current = project_in(&dir);

        assert_eq!(current.view().unwrap().resource_names(), ["ep01"]);
    }

    /// Writes a Backup named `file` into the history of `dir` holding `content`.
    fn write_backup(dir: &TempDir, file: &str, content: &str) {
        let history = dir.path().join(files::HISTORY_DIR);
        std::fs::create_dir_all(&history).unwrap();
        std::fs::write(history.join(file), content).unwrap();
    }

    /// The files of each subtitle's Backups, the original first.
    fn backup_files(current: &CurrentProject) -> Vec<(Option<Language>, Vec<String>)> {
        current
            .subtitle_versions()
            .unwrap()
            .into_iter()
            .map(|versions| {
                let files = versions.backups.into_iter().map(|backup| backup.file);
                (versions.language, files.collect())
            })
            .collect()
    }

    // @behavior VR-001
    #[test]
    fn lists_a_subtitles_backups_newest_first() {
        let dir = directory_of(
            "vr-newest-first",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        write_backup(&dir, "ep01.en.20260925T023000Z.srt", &cue("Hi"));
        write_backup(&dir, "ep01.en.20260925T030000Z.srt", &cue("Hey"));
        let current = project_in(&dir);

        assert_eq!(
            backup_files(&current)[1],
            (
                Some(Language::English),
                vec![
                    "ep01.en.20260925T030000Z.srt".to_string(),
                    "ep01.en.20260925T023000Z.srt".to_string()
                ]
            )
        );
    }

    // @behavior VR-002
    #[test]
    fn keeps_each_subtitles_backups_apart() {
        let dir = directory_of(
            "vr-apart",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("您好"));
        write_backup(&dir, "ep01.en.20260925T023000Z.srt", &cue("Hi"));
        let current = project_in(&dir);

        assert_eq!(
            backup_files(&current)[0],
            (None, vec!["ep01.20260925T023000Z.srt".to_string()])
        );
    }

    // @behavior VR-010
    #[test]
    fn tells_an_output_from_an_overwrite() {
        let dir = directory_of("vr-kinds", &[("ep01.srt", &cue("你好"))]);
        write_backup(&dir, "ep01.20260925T023000Z.output.srt", &cue("您好"));
        write_backup(&dir, "ep01.20260925T030000Z.srt", &cue("妳好"));
        let current = project_in(&dir);

        let kinds: Vec<(String, BackupKind)> = current.subtitle_versions().unwrap()[0]
            .backups
            .iter()
            .map(|backup| (backup.taken_at.clone(), backup.kind))
            .collect();

        assert_eq!(
            kinds,
            [
                ("20260925T030000Z".to_string(), BackupKind::Overwrite),
                ("20260925T023000Z".to_string(), BackupKind::Output)
            ]
        );
    }

    // @behavior VR-004
    #[test]
    fn restores_a_backup() {
        let dir = directory_of("vr-restore", &[("ep01.srt", &cue("新的"))]);
        write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
        let current = project_in(&dir);

        current
            .restore_version(None, "ep01.20260925T023000Z.srt")
            .unwrap();

        assert_eq!(
            (read(&dir, "ep01.srt"), texts(&current)),
            (cue("舊的"), vec!["舊的".to_string()])
        );
    }

    // @behavior VR-050
    #[test]
    fn refuses_a_restore_over_a_subtitle_changed_elsewhere() {
        let dir = directory_of("vr-restore-elsewhere", &[("ep01.srt", &cue("新的"))]);
        write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();

        let result = current.restore_version(None, "ep01.20260925T023000Z.srt");

        assert_eq!(
            (result, read(&dir, "ep01.srt"), texts(&current)),
            (
                Err(Failure::ChangedElsewhere),
                cue("外面改的"),
                vec!["外面改的".to_string()]
            )
        );
    }

    // @behavior VR-005
    #[test]
    fn keeps_the_subtitle_a_restore_replaces() {
        let dir = directory_of("vr-restore-kept", &[("ep01.srt", &cue("新的"))]);
        write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
        let current = project_in(&dir);

        current
            .restore_version(None, "ep01.20260925T023000Z.srt")
            .unwrap();

        assert!(backups(dir.path()).iter().any(|(file, content)| {
            file != "ep01.20260925T023000Z.srt" && content == &cue("新的")
        }));
    }

    // @behavior VR-006
    #[test]
    fn refuses_a_backup_the_subtitle_does_not_have() {
        let dir = directory_of("vr-no-backup", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);

        let result = current.restore_version(None, "../ep01.srt");

        assert_eq!(
            (result, read(&dir, "ep01.srt")),
            (
                Err(Failure::NoBackup {
                    backup: "../ep01.srt".to_string()
                }),
                cue("你好")
            )
        );
    }

    // @behavior PJ-054
    #[test]
    fn saves_no_bilingual_srt_unless_asked() {
        let dir = TempDir::new("pj-bilingual-off");
        let current = bilingual_project_in(&dir, &[("en", "Hello")], false);

        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();

        assert!(!dir.path().join("ep01.zh-TW.en.srt").exists());
    }

    // @behavior PJ-004
    #[test]
    fn writes_the_current_resource_as_edited() {
        let dir = directory_of("pj-export-edited", &[("ep01.srt", &cue("竹子搞"))]);
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();

        let srt = current.to_srt(SrtContent::Original).unwrap();

        assert_eq!(srt, cue("逐字稿"));
    }

    // @behavior PJ-005
    #[test]
    fn refuses_work_without_a_project() {
        let current = CurrentProject::default();

        let failures = [
            current.snapshot().map(|_| ()).unwrap_err(),
            current
                .edit(0, SegmentField::Text, "x".to_string())
                .unwrap_err(),
            current
                .to_srt(SrtContent::Original)
                .map(|_| ())
                .unwrap_err(),
        ];

        assert_eq!(
            failures,
            [Failure::NoProject, Failure::NoProject, Failure::NoProject]
        );
    }

    #[test]
    fn refuses_to_transcribe_a_resource_without_media() {
        let current = current_project_of(vec![]);

        assert_eq!(current.transcription_target(false), Err(Failure::NoMedia));
    }

    // @behavior PJ-006
    #[test]
    fn leaves_a_replaced_project_untouched_by_a_late_translation() {
        let dir = directory_of("pj-replaced", &[("ep01.srt", &cue("大家好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        current.replace(project_of(vec![segment("另一份", None)]));

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some("Hello"))],
            )
            .unwrap();

        assert_eq!(segments(&current), vec![segment("另一份", None)]);
    }

    // @behavior PJ-010
    #[test]
    fn records_the_language_of_a_translation() {
        let dir = directory_of(
            "pj-translation-language",
            &[("ep01.srt", &cue("こんにちは"))],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("こんにちは", Some("Hello"))],
            )
            .unwrap();

        let view = current.view().unwrap();
        assert_eq!(
            (view.language(), view.translation_language()),
            (Language::TraditionalChinese, Some(Language::English))
        );
    }

    fn two_cues(first: &str, second: &str) -> String {
        format!(
            "1\n00:00:00,000 --> 00:00:01,000\n{first}\n\n2\n00:00:01,000 --> 00:00:02,000\n{second}\n"
        )
    }

    // @behavior PJ-039
    #[test]
    fn keeps_an_edit_off_a_subtitle_changed_elsewhere() {
        let dir = directory_of("pj-changed-kept", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

        let _ = current.edit(0, SegmentField::Text, "大家好".to_string());

        assert_eq!(file_text(&dir, "ep01.srt"), cue("您好"));
    }

    // @behavior PJ-040
    #[test]
    fn reads_again_a_subtitle_an_edit_found_changed_elsewhere() {
        let dir = directory_of("pj-changed-edit", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

        let result = current.edit(0, SegmentField::Text, "大家好".to_string());

        assert_eq!(
            (result, texts(&current)),
            (Err(Failure::ChangedElsewhere), vec!["您好".to_string()])
        );
    }

    // @behavior PJ-132
    #[test]
    fn keeps_what_tsuzuri_wrote_of_a_subtitle_changed_elsewhere() {
        let dir = directory_of("pj-kept-elsewhere", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();
        std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();

        let reload = current.reload_if_changed().unwrap();

        assert_eq!(
            (reload, texts(&current), kept_overwrites(&dir)),
            (
                Reload::ReloadedKeeping,
                vec!["外面改的".to_string()],
                vec![cue("你好"), cue("您好")]
            )
        );
    }

    // @behavior PJ-133
    #[test]
    fn keeps_a_version_read_in_from_elsewhere_before_changing_it() {
        let dir = directory_of("pj-kept-read-in", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();
        std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();
        current.reload_if_changed().unwrap();

        current
            .edit(0, SegmentField::Text, "大家好".to_string())
            .unwrap();

        assert_eq!(
            kept_overwrites(&dir),
            vec![cue("你好"), cue("您好"), cue("外面改的")]
        );
    }

    // @behavior PJ-041
    #[test]
    fn reads_again_a_subtitle_changed_elsewhere_on_focus() {
        let dir = directory_of("pj-changed-focus", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

        current.reload_if_changed().unwrap();

        assert_eq!(texts(&current), vec!["您好".to_string()]);
    }

    fn resource_names(current: &CurrentProject) -> Vec<String> {
        current
            .view()
            .unwrap()
            .resources
            .into_iter()
            .map(|resource| resource.name)
            .collect()
    }

    // @behavior PJ-110
    #[test]
    fn lists_files_added_elsewhere_when_the_project_is_reloaded() {
        let dir = directory_of("pj-reload-added", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();
        std::fs::write(dir.path().join("ep02.srt"), cue("再見")).unwrap();

        current.reload().unwrap();

        assert_eq!(
            (
                resource_names(&current),
                current.view().unwrap().resources[0]
                    .translation_languages
                    .clone()
            ),
            (
                vec!["ep01".to_string(), "ep02".to_string()],
                vec![Language::English]
            )
        );
    }

    // @behavior PJ-111
    #[test]
    fn keeps_the_undo_history_of_a_current_resource_no_one_else_changed() {
        let dir = directory_of("pj-reload-undo", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();

        current.reload().unwrap();

        assert!(current.view().unwrap().has_undo());
    }

    // @behavior PJ-112
    #[test]
    fn shows_the_same_translation_after_a_reload() {
        let dir = directory_of(
            "pj-reload-shown",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);
        current.show_translation(None).unwrap();

        current.reload().unwrap();

        assert_eq!(current.view().unwrap().shown_translation, None);
    }

    // @behavior PJ-119
    #[test]
    fn forgets_the_undo_history_of_a_resource_that_gained_a_subtitle_elsewhere() {
        let dir = directory_of("pj-reload-undo-added", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();
        std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();

        current.reload().unwrap();

        current.undo().unwrap();
        assert_eq!(
            (
                current.view().unwrap().has_undo(),
                dir.path().join("ep01.en.srt").exists()
            ),
            (false, true)
        );
    }

    #[test]
    fn reads_again_a_subtitle_changed_elsewhere_on_focus_while_a_mode_runs() {
        let dir = directory_of("pj-focus-held", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);
        std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

        let is_reloaded = current.reload_if_changed().unwrap();

        assert_eq!(
            (is_reloaded, texts(&current)),
            (Reload::ReloadedKeeping, vec!["您好".to_string()])
        );
    }

    // @behavior PJ-113
    #[test]
    fn selects_the_first_resource_once_the_current_resource_is_gone() {
        let dir = directory_of(
            "pj-reload-gone",
            &[("ep01.srt", &cue("你好")), ("ep02.srt", &cue("再見"))],
        );
        let current = project_in(&dir);
        current.select("ep02").unwrap();
        std::fs::remove_file(dir.path().join("ep02.srt")).unwrap();

        current.reload().unwrap();

        assert_eq!(
            current.view().unwrap().current_resource,
            Some("ep01".to_string())
        );
    }

    #[test]
    fn selects_no_resource_once_none_is_left() {
        let dir = directory_of("pj-reload-empty", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::remove_file(dir.path().join("ep01.srt")).unwrap();

        current.reload().unwrap();

        assert_eq!(current.view().unwrap().current_resource, None);
    }

    // @behavior PJ-114
    #[test]
    fn keeps_what_a_mode_shows_when_the_project_is_reloaded() {
        let dir = directory_of("pj-reload-held", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);
        current.show_translations(&source, &[segment("你好", Some("Hello"))]);
        std::fs::write(dir.path().join("ep02.srt"), cue("再見")).unwrap();

        current.reload().unwrap();

        assert_eq!(
            (resource_names(&current), texts(&current)),
            (
                vec!["ep01".to_string(), "ep02".to_string()],
                vec!["Hello".to_string()]
            )
        );
    }

    // @behavior PJ-115
    #[test]
    fn lists_files_added_elsewhere_when_the_window_regains_focus() {
        let dir = directory_of("pj-focus-added", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep02.srt"), cue("再見")).unwrap();

        let is_reloaded = current.reload_if_changed().unwrap();

        assert_eq!(
            (is_reloaded, resource_names(&current)),
            (
                Reload::Reloaded,
                vec!["ep01".to_string(), "ep02".to_string()]
            )
        );
    }

    // @behavior PJ-042
    #[test]
    fn writes_edit_after_edit() {
        let dir = directory_of(
            "pj-edit-after-edit",
            &[("ep01.srt", &two_cues("你好", "世界"))],
        );
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "大家好".to_string())
            .unwrap();

        current
            .edit(1, SegmentField::Text, "地球".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.srt"), two_cues("大家好", "地球"));
    }

    // @behavior PJ-043
    #[test]
    fn edits_a_translation_tsuzuri_just_wrote() {
        let dir = directory_of("pj-edit-written", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        let translation = vec![Segment {
            translation: Some("Hello".to_string()),
            ..source.transcript.segments[0].clone()
        }];
        current
            .write_translations(&source, Language::English, translation)
            .unwrap();

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
    }

    /// A Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`,
    /// whose `ep01.srt` reads `小明: 你好`, and holding `files` besides.
    fn xiao_ming_project_in(dir: &TempDir, files: &[(&str, &str)]) -> CurrentProject {
        std::fs::write(
            dir.path().join("glossary.csv"),
            "zh-TW,en,type\n小明,Xiao Ming,speaker\n",
        )
        .unwrap();
        std::fs::write(dir.path().join("ep01.srt"), cue("小明: 你好")).unwrap();
        for (file_name, content) in files {
            std::fs::write(dir.path().join(file_name), content).unwrap();
        }
        project_in(dir)
    }

    // @behavior PJ-071
    #[test]
    fn names_a_speaker_in_a_translation_as_the_translation_glossary_does() {
        let dir = TempDir::new("pj-speaker-name");
        let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("小明: Hello"))]);

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.en.srt"), cue("Xiao Ming: Hi"));
    }

    // @behavior PJ-072
    #[test]
    fn keeps_a_speakers_name_the_translation_glossary_does_not_give() {
        let dir = directory_of(
            "pj-speaker-same-name",
            &[
                ("ep01.srt", &cue("co: 你好")),
                ("ep01.en.srt", &cue("co: Hello")),
            ],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.en.srt"), cue("co: Hi"));
    }

    // @behavior PJ-073
    #[test]
    fn names_a_speaker_in_each_text_of_a_bilingual_srt() {
        let dir = TempDir::new("pj-speaker-bilingual");
        let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("小明: Hello"))]);
        current
            .set_options(ProjectOptions {
                is_bilingual_autosaved: true,
                ..ProjectOptions::default()
            })
            .unwrap();

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(
            read(&dir, "ep01.zh-TW.en.srt"),
            cue("小明: 你好\nXiao Ming: Hi")
        );
    }

    // @behavior PJ-074
    #[test]
    fn names_a_speaker_in_a_translation_just_made() {
        let dir = TempDir::new("pj-speaker-translated");
        let current = xiao_ming_project_in(&dir, &[]);
        let source = current.snapshot().unwrap();
        let translated_segment = Segment {
            speaker: Some("小明".to_string()),
            ..segment("你好", Some("Hello"))
        };

        current
            .write_translations(&source, Language::English, vec![translated_segment])
            .unwrap();

        assert_eq!(read(&dir, "ep01.en.srt"), cue("Xiao Ming: Hello"));
    }

    // @behavior PJ-075
    #[test]
    fn names_a_speaker_in_a_translation_saved_elsewhere() {
        let dir = TempDir::new("pj-speaker-saved");
        let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("Hello"))]);
        let path = dir.path().join("saved.srt");

        current.save_srt(&path, SrtContent::Translation).unwrap();

        assert_eq!(read(&dir, "saved.srt"), cue("Xiao Ming: Hello"));
    }

    // @behavior PJ-076
    #[test]
    fn names_a_speaker_in_a_translation_a_segment_change_rewrites() {
        let dir = TempDir::new("pj-speaker-changed");
        let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("Hello"))]);

        current
            .change_segments(SegmentChange::Times {
                index: 0,
                start_ms: 500,
                end_ms: 1_500,
            })
            .unwrap();

        assert_eq!(
            read(&dir, "ep01.en.srt"),
            "1\n00:00:00,500 --> 00:00:01,500\nXiao Ming: Hello\n"
        );
    }

    // @behavior PJ-077
    #[test]
    fn writes_an_edited_speaker_to_every_translation() {
        let dir = directory_of(
            "pj-speaker-every",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Hello")),
                ("ep01.ja.srt", &cue("こんにちは")),
            ],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Speaker, "co".to_string())
            .unwrap();

        assert_eq!(
            [read(&dir, "ep01.en.srt"), read(&dir, "ep01.ja.srt")],
            [cue("co: Hello"), cue("co: こんにちは")]
        );
    }

    // @behavior PJ-096
    #[test]
    fn clears_a_speaker_from_the_original_and_every_translation() {
        let dir = directory_of(
            "pj-speaker-cleared",
            &[
                ("ep01.srt", &cue("co: 你好")),
                ("ep01.en.srt", &cue("co: Hello")),
            ],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Speaker, String::new())
            .unwrap();

        assert_eq!(
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
            [cue("你好"), cue("Hello")]
        );
    }

    // @behavior PJ-099
    #[test]
    fn writes_a_translation_made_again_as_one_change() {
        let three =
            |second: &str| srt_of(&[(0, 1_000, "A"), (1_000, 2_000, second), (2_000, 3_000, "C")]);
        let dir = directory_of(
            "tl-retranslate-write",
            &[
                (
                    "ep01.srt",
                    &srt_of(&[(0, 1_000, "一"), (1_000, 2_000, "二"), (2_000, 3_000, "三")]),
                ),
                ("ep01.en.srt", &three("B")),
            ],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        let mut segments = source.transcript.segments.clone();
        segments[1].translation = Some("B2".to_string());

        current
            .write_retranslations(&source, Language::English, &[1], segments)
            .unwrap();
        let translation = read(&dir, "ep01.en.srt");
        current.undo().unwrap();

        assert_eq!(
            (
                translation,
                kept_overwrites(&dir),
                read(&dir, "ep01.en.srt")
            ),
            (three("B2"), vec![three("B")], three("B"))
        );
    }

    // @behavior PJ-100
    #[test]
    fn refuses_to_translate_again_with_no_translation_shown() {
        let current = current_project_of(vec![segment("大家好", None)]);

        assert_eq!(
            current.shown_translation(),
            Err(Failure::NoTranslationShown)
        );
    }

    // @behavior PJ-097
    #[test]
    fn names_the_speaker_of_several_segments_at_once() {
        let three = srt_of(&[
            (0, 1_000, "你好"),
            (1_000, 2_000, "嗨"),
            (2_000, 3_000, "再見"),
        ]);
        let dir = directory_of(
            "pj-speakers-at-once",
            &[
                ("ep01.srt", &three),
                (
                    "ep01.en.srt",
                    &srt_of(&[
                        (0, 1_000, "Hello"),
                        (1_000, 2_000, "Hi"),
                        (2_000, 3_000, "Bye"),
                    ]),
                ),
            ],
        );
        let current = project_in(&dir);

        current.set_speakers(&[0, 2], "co").unwrap();

        assert_eq!(
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
            [
                srt_of(&[
                    (0, 1_000, "co: 你好"),
                    (1_000, 2_000, "嗨"),
                    (2_000, 3_000, "co: 再見")
                ]),
                srt_of(&[
                    (0, 1_000, "co: Hello"),
                    (1_000, 2_000, "Hi"),
                    (2_000, 3_000, "co: Bye")
                ]),
            ]
        );
    }

    // @behavior PJ-098
    #[test]
    fn undoes_speakers_named_at_once_in_one_step() {
        let three = srt_of(&[
            (0, 1_000, "你好"),
            (1_000, 2_000, "嗨"),
            (2_000, 3_000, "再見"),
        ]);
        let dir = directory_of("pj-speakers-undo", &[("ep01.srt", &three)]);
        let current = project_in(&dir);
        current.set_speakers(&[0, 1, 2], "co").unwrap();

        current.undo().unwrap();

        assert_eq!(read(&dir, "ep01.srt"), three);
    }

    // @behavior PJ-078
    #[test]
    fn leaves_a_translations_cue_without_a_matching_segment_as_it_is() {
        let dir = directory_of(
            "pj-speaker-unmatched",
            &[
                ("ep01.srt", &cue("你好")),
                (
                    "ep01.ja.srt",
                    "1\n00:00:00,000 --> 00:00:01,000\nこんにちは\n\n2\n00:00:02,000 --> 00:00:03,000\ncl: さようなら\n",
                ),
            ],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Speaker, "co".to_string())
            .unwrap();

        assert_eq!(
            read(&dir, "ep01.ja.srt"),
            "1\n00:00:00,000 --> 00:00:01,000\nco: こんにちは\n\n2\n00:00:02,000 --> 00:00:03,000\ncl: さようなら\n"
        );
    }

    // @behavior PJ-079
    #[test]
    fn names_an_edited_speaker_in_every_translation_as_the_translation_glossary_does() {
        let dir = directory_of(
            "pj-speaker-every-named",
            &[
                ("glossary.csv", "zh-TW,en,type\n小明,Xiao Ming,speaker\n"),
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Hello")),
                ("ep01.ja.srt", &cue("こんにちは")),
            ],
        );
        let current = project_in(&dir);
        current.show_translation(Some(Language::Japanese)).unwrap();

        current
            .edit(0, SegmentField::Speaker, "小明".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.en.srt"), cue("Xiao Ming: Hello"));
    }

    /// A Project whose `ep01` has a media file, `ep01.srt` reading `co: 你好` and `ep01.en.srt`
    /// reading `co: Hello`, and a transcription of `你好` with no Speaker written over it.
    fn transcribe_over_speakers(dir: &TempDir, is_overwrite_backed_up: bool) {
        transcribe_over(dir, "co: ", is_overwrite_backed_up);
    }

    /// A Project whose `ep01` has a media file, `ep01.srt` reading `你好` and `ep01.en.srt`
    /// reading `Hello`, each after `label`, and a transcription of `你好` with no Speaker written over it.
    fn transcribe_over(dir: &TempDir, label: &str, is_overwrite_backed_up: bool) {
        for (file_name, content) in [
            ("ep01.mp4", String::new()),
            ("ep01.srt", cue(&format!("{label}你好"))),
            ("ep01.en.srt", cue(&format!("{label}Hello"))),
        ] {
            std::fs::write(dir.path().join(file_name), content).unwrap();
        }
        let current = project_in(dir);
        current
            .set_options(ProjectOptions {
                is_overwrite_backed_up,
                ..ProjectOptions::default()
            })
            .unwrap();
        let target = current.transcription_target(true).unwrap();

        current.write_transcription(&target, cue("你好")).unwrap();
    }

    // @behavior PJ-080
    #[test]
    fn carries_the_speakers_of_a_new_transcription_to_each_translation() {
        let dir = TempDir::new("pj-speaker-transcribed");

        transcribe_over_speakers(&dir, false);

        assert_eq!(read(&dir, "ep01.en.srt"), cue("Hello"));
    }

    // @behavior PJ-081
    #[test]
    fn keeps_a_backup_of_a_translation_a_transcription_changes() {
        let dir = TempDir::new("pj-speaker-transcribed-backup");

        transcribe_over_speakers(&dir, true);

        assert!(overwrite_backups(dir.path())
            .iter()
            .any(|(file, text)| file.starts_with("ep01.en.") && *text == cue("co: Hello")));
    }

    // @behavior PJ-082
    #[test]
    fn keeps_no_backup_of_a_translation_a_transcription_leaves_as_it_is() {
        let dir = TempDir::new("pj-transcribed-unchanged");

        transcribe_over(&dir, "", true);

        assert!(!overwrite_backups(dir.path())
            .iter()
            .any(|(file, _)| file.starts_with("ep01.en.")));
    }

    // @behavior PJ-083
    #[test]
    fn keeps_one_label_on_a_translation_with_a_long_speaker_name() {
        let dir = directory_of(
            "pj-speaker-long",
            &[
                (
                    "glossary.csv",
                    "zh-TW,en,type\n小明,Christopher Nolan Jr.,speaker\n",
                ),
                ("ep01.srt", &cue("小明: 你好")),
                ("ep01.en.srt", &cue("Christopher Nolan Jr.: Hello")),
            ],
        );
        let current = project_in(&dir);

        current
            .change_segments(SegmentChange::Times {
                index: 0,
                start_ms: 500,
                end_ms: 1_500,
            })
            .unwrap();

        assert_eq!(
            read(&dir, "ep01.en.srt"),
            "1\n00:00:00,500 --> 00:00:01,500\nChristopher Nolan Jr.: Hello\n"
        );
    }

    fn shown_translation(current: &CurrentProject) -> Option<String> {
        segments(current)[0].translation.clone()
    }

    // @behavior PJ-084
    #[test]
    fn reads_a_translations_dialogue_that_opens_like_a_label() {
        let dir = directory_of(
            "pj-translation-colon",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Note: hi")),
            ],
        );

        let current = project_in(&dir);

        assert_eq!(shown_translation(&current).as_deref(), Some("Note: hi"));
    }

    // @behavior PJ-085
    #[test]
    fn takes_off_only_the_label_a_translations_speaker_has() {
        let dir = directory_of(
            "pj-translation-expected-label",
            &[
                ("glossary.csv", "zh-TW,en,type\n小明,Xiao Ming,speaker\n"),
                ("ep01.srt", &cue("小明: 你好")),
                ("ep01.en.srt", &cue("Xiao Ming: Note: hi")),
            ],
        );

        let current = project_in(&dir);

        assert_eq!(shown_translation(&current).as_deref(), Some("Note: hi"));
    }

    // @behavior PJ-086
    #[test]
    fn puts_a_new_speaker_before_a_translations_dialogue_as_written() {
        let dir = directory_of(
            "pj-translation-new-speaker",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Note: hi")),
                ("ep01.ja.srt", &cue("メモ：やあ")),
            ],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Speaker, "co".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.ja.srt"), cue("co: メモ：やあ"));
    }

    // @behavior PJ-087
    #[test]
    fn takes_off_a_speakers_former_name_in_a_translation() {
        let dir = directory_of(
            "pj-translation-former-name",
            &[
                ("glossary.csv", "zh-TW,en,type\n小明,Ming,speaker\n"),
                ("ep01.srt", &cue("小明: 你好")),
                ("ep01.en.srt", &cue("Xiao Ming: Hello")),
            ],
        );

        let current = project_in(&dir);

        assert_eq!(shown_translation(&current).as_deref(), Some("Hello"));
    }
    fn edit_text(current: &CurrentProject, text: &str) {
        current
            .edit(0, SegmentField::Text, text.to_string())
            .unwrap();
    }

    // @behavior UD-001
    #[test]
    fn undoes_an_edit() {
        let dir = directory_of("ud-undo", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        edit_text(&current, "您好");

        current.undo().unwrap();

        assert_eq!(read(&dir, "ep01.srt"), cue("你好"));
        assert_eq!(current.view().unwrap().segments()[0].text, "你好");
    }

    // @behavior UD-002
    #[test]
    fn redoes_an_undone_edit() {
        let dir = directory_of("ud-redo", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        edit_text(&current, "您好");
        current.undo().unwrap();

        current.redo().unwrap();

        assert_eq!(read(&dir, "ep01.srt"), cue("您好"));
    }

    // @behavior UD-003
    #[test]
    fn undoes_a_segment_change_across_every_subtitle() {
        let dir = directory_of(
            "ud-merge",
            &[
                ("ep01.srt", &two_cues("你好", "世界")),
                ("ep01.en.srt", &two_cues("Hello", "world")),
            ],
        );
        let current = project_in(&dir);
        current
            .change_segments(SegmentChange::Merge { first: 0, last: 1 })
            .unwrap();

        current.undo().unwrap();

        assert_eq!(
            (read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")),
            (two_cues("你好", "世界"), two_cues("Hello", "world"))
        );
    }

    // @behavior UD-004
    #[test]
    fn undoes_a_translation_as_one_change() {
        let dir = directory_of("ud-translation", &[("ep01.srt", &cue("大家好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some("Hello"))],
            )
            .unwrap();

        current.undo().unwrap();

        assert!(!dir.path().join("ep01.en.srt").exists());
    }

    // @behavior UD-005
    #[test]
    fn undoes_a_transcription_as_one_change() {
        let dir = directory_of(
            "ud-transcription",
            &[("ep01.mp4", ""), ("ep01.srt", &cue("舊的"))],
        );
        let current = project_in(&dir);
        let target = current.transcription_target(true).unwrap();
        current.write_transcription(&target, cue("新的")).unwrap();

        current.undo().unwrap();

        assert_eq!(read(&dir, "ep01.srt"), cue("舊的"));
    }

    // @behavior UD-006
    #[test]
    fn undoes_a_restore() {
        let dir = directory_of("ud-restore", &[("ep01.srt", &cue("新的"))]);
        write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
        let current = project_in(&dir);
        current
            .restore_version(None, "ep01.20260925T023000Z.srt")
            .unwrap();

        current.undo().unwrap();

        assert_eq!(read(&dir, "ep01.srt"), cue("新的"));
    }

    // @behavior UD-007
    #[test]
    fn clears_what_can_be_redone_with_a_new_change() {
        let dir = directory_of("ud-redo-cleared", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        edit_text(&current, "您好");
        current.undo().unwrap();

        edit_text(&current, "妳好");

        assert!(!current.view().unwrap().has_redo());
    }

    // @behavior UD-008
    #[test]
    fn keeps_each_resources_changes_apart() {
        let dir = directory_of(
            "ud-apart",
            &[("ep01.srt", &cue("一")), ("ep02.srt", &cue("二"))],
        );
        let current = project_in(&dir);
        edit_text(&current, "壹");
        current.select("ep02").unwrap();
        edit_text(&current, "貳");
        current.select("ep01").unwrap();

        current.undo().unwrap();

        assert_eq!(
            (read(&dir, "ep01.srt"), read(&dir, "ep02.srt")),
            (cue("一"), cue("貳"))
        );
    }

    // @behavior UD-009
    #[test]
    fn undoes_at_most_100_changes() {
        let dir = directory_of("ud-depth", &[("ep01.srt", &cue("0"))]);
        let current = project_in(&dir);
        for text in 1..=101 {
            edit_text(&current, &text.to_string());
        }

        while current.view().unwrap().has_undo() {
            current.undo().unwrap();
        }

        assert_eq!(read(&dir, "ep01.srt"), cue("1"));
    }

    // @behavior UD-010
    #[test]
    fn forgets_the_changes_of_a_subtitle_changed_elsewhere() {
        let dir = directory_of("ud-elsewhere", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        edit_text(&current, "您好");
        std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();
        current.reload_if_changed().unwrap();

        assert!(!current.view().unwrap().has_undo());
    }

    // @behavior UD-018
    #[test]
    fn refuses_an_undo_over_a_subtitle_changed_elsewhere() {
        let dir = directory_of("ud-elsewhere", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        edit_text(&current, "您好");
        std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();

        let result = current.undo();

        assert_eq!(
            (
                result,
                file_text(&dir, "ep01.srt"),
                current.view().unwrap().has_undo()
            ),
            (Err(Failure::ChangedElsewhere), cue("外面改的"), false)
        );
    }

    // @behavior UD-011
    #[test]
    fn undoes_without_a_backup() {
        let dir = directory_of("ud-no-backup", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        current
            .set_options(ProjectOptions {
                is_overwrite_backed_up: true,
                ..ProjectOptions::default()
            })
            .unwrap();
        edit_text(&current, "您好");

        current.undo().unwrap();

        assert_eq!(kept_overwrites(&dir), vec![cue("你好")]);
    }

    // @behavior UD-012
    #[test]
    fn leaves_out_an_edit_that_changes_nothing() {
        let dir = directory_of("ud-unchanged", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);

        edit_text(&current, "你好");

        assert!(!current.view().unwrap().has_undo());
    }
    fn hold_ep01<'a>(
        current: &'a CurrentProject,
        dir: &TempDir,
        mode: RunningMode,
    ) -> ResourceHold<'a> {
        current.hold_resource(dir.path(), "ep01", mode)
    }

    const ENGLISH_TRANSLATION: RunningMode = RunningMode::Translation {
        language: Language::English,
        indexes: None,
    };

    // @behavior PJ-122
    #[test]
    fn keeps_a_translation_whole_when_edited_after_a_translation_ended_early() {
        let dir = directory_of(
            "pj-translation-ended",
            &[
                ("ep01.srt", &two_cues("你好", "世界")),
                ("ep01.en.srt", &two_cues("Hello", "World")),
            ],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        {
            let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);
            current.show_translations(&source, &[]);
        }

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "World"));
    }

    #[test]
    fn starts_an_edit_from_what_the_files_hold_rather_than_what_was_shown() {
        let dir = directory_of(
            "pj-edit-from-files",
            &[
                ("ep01.srt", &two_cues("你好", "世界")),
                ("ep01.en.srt", &two_cues("Hello", "World")),
            ],
        );
        let current = project_in(&dir);
        if let Some(shown) = current
            .lock()
            .project
            .as_mut()
            .and_then(|project| project.current.as_mut())
        {
            shown.transcript.segments[1].translation = None;
        }

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "World"));
    }

    fn translated_again(source: &TranslationSource, index: usize, text: &str) -> Vec<Segment> {
        let mut segments = source.transcript.segments.clone();
        segments[index].translation = Some(text.to_string());
        segments
    }

    fn translated_in_english(name: &str) -> (TempDir, CurrentProject) {
        let dir = directory_of(
            name,
            &[
                ("ep01.srt", &two_cues("你好", "世界")),
                ("ep01.en.srt", &two_cues("Hello", "World")),
            ],
        );
        let current = project_in(&dir);
        (dir, current)
    }

    // @behavior PJ-125
    #[test]
    fn translates_again_the_translation_chosen_whichever_is_shown_when_it_starts() {
        let (dir, current) = translated_in_english("pj-retranslate-shown");
        current.show_translation(None).unwrap();
        let (source, _hold) = current
            .hold_for_translation(Language::English, Some(vec![0]))
            .unwrap();

        current
            .write_retranslations(
                &source,
                Language::English,
                &[0],
                translated_again(&source, 0, "Hi"),
            )
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "World"));
    }

    // @behavior PJ-126
    #[test]
    fn keeps_an_edit_made_while_other_segments_are_translated_again() {
        let (dir, current) = translated_in_english("pj-retranslate-edit");
        let (source, _hold) = current
            .hold_for_translation(Language::English, Some(vec![0]))
            .unwrap();
        current
            .edit(1, SegmentField::Translation, "Earth".to_string())
            .unwrap();

        current
            .write_retranslations(
                &source,
                Language::English,
                &[0],
                translated_again(&source, 0, "Hi"),
            )
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "Earth"));
    }

    // @behavior PJ-127
    #[test]
    fn refuses_an_edit_of_a_segment_being_translated_again() {
        let (dir, current) = translated_in_english("pj-retranslate-held");
        let _held = current
            .hold_for_translation(Language::English, Some(vec![0]))
            .unwrap();

        let result = current.edit(0, SegmentField::Translation, "Hi".to_string());

        assert_eq!(
            (result, file_text(&dir, "ep01.en.srt")),
            (Err(Failure::ModeRunning), two_cues("Hello", "World"))
        );
    }

    // @behavior PJ-128
    #[test]
    fn refuses_to_show_another_translation_while_a_mode_runs() {
        let (dir, current) = translated_in_english("pj-show-held");
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

        let result = current.show_translation(None);

        assert_eq!(
            (result, current.view().unwrap().shown_translation),
            (Err(Failure::ModeRunning), Some(Language::English))
        );
    }

    /// What each Overwrite in the history of `dir` reads, oldest first.
    fn kept_overwrites(dir: &TempDir) -> Vec<String> {
        overwrite_backups(dir.path())
            .into_iter()
            .map(|(_, content)| content)
            .collect()
    }

    // @behavior PJ-129
    #[test]
    fn keeps_a_subtitle_once_before_its_first_change_since_opening() {
        let (dir, current) = translated_in_english("pj-first-change");

        for translation in ["Hi", "Hey"] {
            current
                .edit(0, SegmentField::Translation, translation.to_string())
                .unwrap();
        }

        assert_eq!(kept_overwrites(&dir), vec![two_cues("Hello", "World")]);
    }

    // @behavior PJ-130
    #[test]
    fn keeps_no_overwrite_of_what_a_mode_kept_as_an_output_since_opening() {
        let dir = directory_of("pj-first-change-output", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("你好", Some("Hello"))],
            )
            .unwrap();

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(
            (kept_overwrites(&dir), output_backups(dir.path()).len()),
            (Vec::<String>::new(), 1)
        );
    }

    // @behavior PJ-131
    #[test]
    fn keeps_a_subtitle_again_before_its_first_change_once_opened_again() {
        let (dir, current) = translated_in_english("pj-first-change-again");
        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();
        let reopened = project_in(&dir);

        reopened
            .edit(0, SegmentField::Translation, "Hey".to_string())
            .unwrap();

        assert_eq!(
            kept_overwrites(&dir),
            vec![two_cues("Hello", "World"), two_cues("Hi", "World")]
        );
    }

    // @behavior PJ-123
    #[test]
    fn keeps_an_original_whole_when_edited_after_a_transcription_ended_early() {
        let dir = directory_of(
            "pj-transcription-ended",
            &[("ep01.srt", &two_cues("你好", "世界"))],
        );
        let current = project_in(&dir);
        {
            let _hold = hold_ep01(&current, &dir, RunningMode::Transcription);
            current.show_transcribed(Vec::new());
            current.push_segment(segment("你好", None));
        }

        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.srt"), two_cues("您好", "世界"));
    }

    // @behavior PJ-124
    #[test]
    fn shows_what_the_files_hold_once_a_mode_ends_without_writing() {
        let dir = directory_of("pj-mode-ended", &[("ep01.srt", &two_cues("你好", "世界"))]);
        let current = project_in(&dir);
        let hold = hold_ep01(&current, &dir, RunningMode::Transcription);
        current.show_transcribed(vec![segment("大家好", None)]);
        let shown_while_running = texts(&current);

        drop(hold);

        assert_eq!(
            (shown_while_running, texts(&current)),
            (
                vec!["大家好".to_string()],
                vec!["你好".to_string(), "世界".to_string()]
            )
        );
    }

    // @behavior PJ-090
    #[test]
    fn refuses_an_edit_while_its_resource_is_transcribed() {
        let dir = directory_of("pj-hold-transcribed", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let _hold = hold_ep01(&current, &dir, RunningMode::Transcription);

        let result = current.edit(0, SegmentField::Text, "您好".to_string());

        assert_eq!(
            (result, read(&dir, "ep01.srt")),
            (Err(Failure::ModeRunning), cue("你好"))
        );
    }

    // @behavior PJ-091
    #[test]
    fn refuses_an_edit_of_the_translation_being_written() {
        let dir = directory_of(
            "pj-hold-translation",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);
        current.show_translation(Some(Language::English)).unwrap();
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

        let result = current.edit(0, SegmentField::Translation, "Hi".to_string());

        assert_eq!(result, Err(Failure::ModeRunning));
    }

    // @behavior PJ-092
    #[test]
    fn edits_the_original_while_it_is_translated() {
        let dir = directory_of("pj-hold-original", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), cue("您好"));
    }

    // @behavior PJ-093
    #[test]
    fn refuses_a_segment_change_or_an_undo_while_a_mode_runs() {
        let dir = directory_of("pj-hold-change", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

        let results = (
            current.change_segments(SegmentChange::Deletion { indexes: vec![0] }),
            current.undo(),
        );

        assert_eq!(
            results,
            (Err(Failure::ModeRunning), Err(Failure::ModeRunning))
        );
    }

    // @behavior PJ-094
    #[test]
    fn frees_the_subtitles_once_a_mode_ends() {
        let dir = directory_of("pj-hold-freed", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        drop(hold_ep01(&current, &dir, RunningMode::Transcription));

        current
            .edit(0, SegmentField::Text, "您好".to_string())
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), cue("您好"));
    }

    // @behavior PJ-095
    #[test]
    fn says_which_mode_runs_on_the_current_resource() {
        let dir = directory_of("pj-hold-view", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

        assert_eq!(
            current.view().unwrap().running_mode(),
            Some(ENGLISH_TRANSLATION)
        );
    }
    const BACKUP: &str = "ep01.20260925T023000Z.srt";

    /// A Current Resource `ep01` reading `now`, with a Backup of it reading `backup`.
    fn backed_up_project_in(dir: &TempDir, backup: &str, now: &str) -> CurrentProject {
        std::fs::write(dir.path().join("ep01.srt"), now).unwrap();
        write_backup(dir, BACKUP, backup);
        project_in(dir)
    }

    // @behavior VR-016
    #[test]
    fn takes_back_the_text_of_one_cue() {
        let dir = TempDir::new("vr-revert-text");
        let current = backed_up_project_in(
            &dir,
            &srt_of(&[(0, 1_000, "你好")]),
            &srt_of(&[(0, 1_200, "您好")]),
        );

        current
            .revert_row(None, BACKUP, 0, RevertPart::Text)
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_200, "你好")]));
    }

    // @behavior VR-017
    #[test]
    fn takes_back_the_times_of_one_cue() {
        let dir = TempDir::new("vr-revert-times");
        let current = backed_up_project_in(
            &dir,
            &srt_of(&[(0, 1_000, "你好")]),
            &srt_of(&[(0, 1_200, "您好")]),
        );

        current
            .revert_row(None, BACKUP, 0, RevertPart::Times)
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_000, "您好")]));
    }

    // @behavior VR-018
    #[test]
    fn takes_back_a_removed_cue() {
        let dir = TempDir::new("vr-revert-removed");
        let current = backed_up_project_in(
            &dir,
            &srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
            &srt_of(&[(0, 1_000, "你好")]),
        );

        current
            .revert_row(None, BACKUP, 1, RevertPart::Whole)
            .unwrap();

        assert_eq!(
            read(&dir, "ep01.srt"),
            srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")])
        );
    }

    // @behavior VR-019
    #[test]
    fn takes_back_an_added_cue() {
        let dir = TempDir::new("vr-revert-added");
        let current = backed_up_project_in(
            &dir,
            &srt_of(&[(0, 1_000, "你好")]),
            &srt_of(&[(0, 1_000, "你好"), (2_000, 3_000, "再見")]),
        );

        current
            .revert_row(None, BACKUP, 1, RevertPart::Whole)
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_000, "你好")]));
    }

    // @behavior VR-020
    #[test]
    fn takes_back_a_split() {
        let dir = TempDir::new("vr-revert-split");
        let current = backed_up_project_in(
            &dir,
            &srt_of(&[(0, 2_000, "你好世界")]),
            &srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
        );

        current
            .revert_row(None, BACKUP, 0, RevertPart::Whole)
            .unwrap();

        assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 2_000, "你好世界")]));
    }

    // @behavior VR-021
    #[test]
    fn undoes_a_cue_taken_back() {
        let dir = TempDir::new("vr-revert-undo");
        let now = srt_of(&[(0, 1_200, "您好")]);
        let current = backed_up_project_in(&dir, &srt_of(&[(0, 1_000, "你好")]), &now);
        current
            .revert_row(None, BACKUP, 0, RevertPart::Text)
            .unwrap();

        current.undo().unwrap();

        assert_eq!(read(&dir, "ep01.srt"), now);
    }

    /// A Current Resource `ep01` whose merged cue is translated, with a Backup from before the merge.
    fn merged_project_in(dir: &TempDir) -> CurrentProject {
        std::fs::write(
            dir.path().join("ep01.en.srt"),
            srt_of(&[(0, 2_000, "Hello world")]),
        )
        .unwrap();
        backed_up_project_in(
            dir,
            &srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
            &srt_of(&[(0, 2_000, "你好世界")]),
        )
    }

    // @behavior VR-047
    #[test]
    fn counts_the_segments_a_restore_leaves_without_a_translation() {
        let dir = TempDir::new("vr-restore-unmatched");
        let current = merged_project_in(&dir);

        let restoration = current.restore_version(None, BACKUP).unwrap();

        assert_eq!(restoration, Restoration { unmatched_count: 2 });
    }

    // @behavior VR-047
    #[test]
    fn counts_the_segments_a_row_taken_back_leaves_without_a_translation() {
        let dir = TempDir::new("vr-revert-unmatched");
        let current = merged_project_in(&dir);

        let restoration = current
            .revert_row(None, BACKUP, 0, RevertPart::Whole)
            .unwrap();

        assert_eq!(restoration, Restoration { unmatched_count: 2 });
    }

    // @behavior VR-022
    #[test]
    fn refuses_a_row_the_comparison_does_not_have() {
        let dir = TempDir::new("vr-revert-no-row");
        let now = srt_of(&[(0, 1_000, "您好")]);
        let current = backed_up_project_in(&dir, &srt_of(&[(0, 1_000, "你好")]), &now);

        let result = current.revert_row(None, BACKUP, 1, RevertPart::Whole);

        assert_eq!(
            (result, read(&dir, "ep01.srt")),
            (Err(Failure::NoRow { row: 1 }), now)
        );
    }

    // @behavior VR-037
    #[test]
    fn reads_a_translations_cues_as_written() {
        let dir = directory_of(
            "vr-reference",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.ja.srt", &cue("こんにちは")),
            ],
        );
        let current = project_in(&dir);

        let cues = current.translation_cues(Language::Japanese).unwrap();

        assert_eq!(
            cues,
            [ComparedCue {
                start_ms: 0,
                end_ms: 1_000,
                text: "こんにちは".to_string()
            }]
        );
    }
}

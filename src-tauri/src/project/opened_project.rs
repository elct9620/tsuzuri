use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use super::backups::BackupPolicy;
use super::files;
use super::glossary::TranslationGlossary;
use super::history::{SubtitleSnapshot, UndoHistory};
use super::trimmed_name;
use super::versions::{self, RevertPart, SubtitleVersions};
use super::{
    translation_srt, translation_with_speakers, BackupKind, CleanupScope, CurrentResource,
    DiarizationTarget, ExportFormat, KnownSubtitle, Project, ProjectConfig, ProjectOptions,
    Resource, Restoration, SegmentField, SegmentSpan, TextMatch, TranscriptionRequest,
    TranscriptionTarget, TranslationSource,
};
use crate::cleanup::{clean_range, clean_text};
use crate::failure::Failure;
use crate::language::Language;
use crate::replacement::{Finder, Replacer};
use crate::segment_change::SegmentChange;
use crate::transcript::{SpeakerNames, Transcript, WrittenText};

impl Project {
    /// The directory's Resources in the Primary Language its Project Config records, else in
    /// `language`, with the first of them current. A `glossary.csv` it cannot read is left out
    /// here and reported when a translation reads it again.
    pub fn open(directory: PathBuf, language: Language) -> Result<Project, Failure> {
        if !directory.try_exists()? {
            return Err(Failure::DirectoryNotFound { directory });
        }
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
            backups: Default::default(),
        };
        project.translation_glossary =
            TranslationGlossary::from_directory(&project.directory, project.source_target())
                .ok()
                .flatten();
        if let Some(first) = project
            .resources
            .first()
            .map(|resource| resource.name.clone())
        {
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
        let resource =
            resource_by_name(&self.resources, &current.name).ok_or(Failure::NoResource)?;
        resource.carry_translations(&mut current.transcript.segments, language, &speaker_names)?;
        current.translation = language;
        self.remember_subtitles()
    }

    /// Whether the named Resource is the Current Resource.
    pub(super) fn is_current(&self, name: &str) -> bool {
        self.current
            .as_ref()
            .is_some_and(|current| current.name == name)
    }

    /// What the Current Resource's original subtitle and the translation file it shows hold now.
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
    pub(super) fn is_changed_elsewhere(&self) -> Result<bool, Failure> {
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

    /// Reads the Current Resource again after a subtitle of it was changed elsewhere, once
    /// `back_up_changed_elsewhere` has kept what Tsuzuri held and forgotten its Undo History.
    fn read_changed_elsewhere(&mut self) -> Result<(), Failure> {
        self.back_up_changed_elsewhere()?;
        self.read_current_again()
    }

    /// Keeps what Tsuzuri last read or wrote of each subtitle of the Current Resource changed
    /// elsewhere as an Overwrite Backup, since nothing else holds it once the file is read again,
    /// and forgets its Undo History; answers whether it kept one. The version read in is then no
    /// longer kept this opening, so the next change keeps it first.
    fn back_up_changed_elsewhere(&mut self) -> Result<bool, Failure> {
        let current = self.current()?;
        let name = current.name.clone();
        let mut is_kept = false;
        for (path, known) in current.known_subtitles.clone() {
            let (_, now) = files::content_of(&path)?;
            if now == known {
                continue;
            }
            self.undo_histories.remove(&name);
            self.backups.forget(&path);
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
    pub(super) fn pair_again(&mut self, writer: Option<&str>) -> Result<(), Failure> {
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
    /// is gone; a Current Resource changed elsewhere is handled as `back_up_changed_elsewhere`
    /// does, answering whether a Backup was kept.
    pub(super) fn reload(&mut self, resources: Vec<Resource>) -> Result<bool, Failure> {
        let (current, is_kept) = match &self.current {
            Some(current) => {
                let shown_resource = (current.name.clone(), current.translation);
                (Some(shown_resource), self.back_up_changed_elsewhere()?)
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
    pub(super) fn read_again_showing(
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
    pub(super) fn translation_source(
        &self,
        target: Language,
    ) -> Result<TranslationSource, Failure> {
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
    pub(super) fn refuse_changed_elsewhere(&mut self) -> Result<(), Failure> {
        if self.is_changed_elsewhere()? {
            self.read_changed_elsewhere()?;
            return Err(Failure::ChangedElsewhere);
        }
        Ok(())
    }

    pub(super) fn subtitle_snapshot(&self, name: &str) -> Result<SubtitleSnapshot, Failure> {
        files::subtitle_snapshot(self.resource(name)?)
    }

    /// Keeps `before` in the named Resource's Undo History when its subtitles no longer hold it.
    pub(super) fn record_change(
        &mut self,
        name: &str,
        before: SubtitleSnapshot,
    ) -> Result<(), Failure> {
        if self.subtitle_snapshot(name)? != before {
            self.undo_histories
                .entry(name.to_string())
                .or_default()
                .record(before);
        }
        Ok(())
    }

    /// Makes `change` to the Current Resource's subtitles so that it can be undone.
    pub(super) fn make_undoable_change<T>(
        &mut self,
        change: impl FnOnce(&mut Project) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        let name = self.current()?.name.clone();
        let before = self.subtitle_snapshot(&name)?;
        let result = change(self)?;
        self.record_change(&name, before)?;
        Ok(result)
    }

    pub(super) fn undo(&mut self) -> Result<(), Failure> {
        self.put_back_from_history(UndoHistory::undo)
    }

    pub(super) fn redo(&mut self) -> Result<(), Failure> {
        self.put_back_from_history(UndoHistory::redo)
    }

    /// Puts back the subtitles `take` answers from the Current Resource's Undo History, given what
    /// they hold now, and reads the Current Resource again, showing the same translation while it
    /// is still there.
    fn put_back_from_history(
        &mut self,
        take: impl FnOnce(&mut UndoHistory, SubtitleSnapshot) -> Option<SubtitleSnapshot>,
    ) -> Result<(), Failure> {
        let name = self.current()?.name.clone();
        let now = self.subtitle_snapshot(&name)?;
        let Some(history) = self.undo_histories.get_mut(&name) else {
            return Ok(());
        };
        let Some(snapshot) = take(history, now.clone()) else {
            return Ok(());
        };
        files::put_back(&now, &snapshot)?;
        self.read_current_again()?;
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
            SegmentField::Text | SegmentField::Speaker => WrittenText::Original,
            SegmentField::Translation => WrittenText::Translation,
        };
        let written_translation = match field {
            SegmentField::Translation => current.translation,
            SegmentField::Text | SegmentField::Speaker => None,
        };
        self.write_subtitle(content)?;
        self.pair_again(Some(&name))?;
        if field == SegmentField::Speaker {
            self.write_speakers_to_translations(&name, previous, BackupPolicy::FirstChange)?;
        }
        self.write_bilingual_subtitles(&name, written_translation)?;
        self.remember_subtitles()
    }

    /// Writes the Current Resource's original, or the translation shown, which holds only the
    /// Segments translated; with no translation shown there is none to write.
    fn write_subtitle(&mut self, content: WrittenText) -> Result<(), Failure> {
        let current = self.current()?;
        let srt = match (content, current.translation) {
            (WrittenText::Translation, None) => return Ok(()),
            (WrittenText::Translation, Some(language)) => {
                translation_srt(&current.transcript, self.speaker_names(Some(language)))
            }
            _ => current.transcript.to_srt(WrittenText::Original),
        };
        let resource = self.resource(&current.name)?;
        let path = match (content, current.translation) {
            (WrittenText::Translation, Some(language)) => {
                resource.translation_path(language).map(Path::to_path_buf)
            }
            _ => resource.subtitle.clone(),
        };
        let path = match path {
            Some(path) => path,
            None => self.export_path(content, ExportFormat::Srt)?,
        };
        self.back_up_first_change(&path)?;
        files::write_text(&path, srt)
    }

    /// Keeps what a change made elsewhere replaced in the named Resource's subtitles while it is the
    /// Current Resource, as reading that change in does, before a Mode writes over them.
    pub(super) fn back_up_changed_elsewhere_of(&mut self, name: &str) -> Result<(), Failure> {
        if self.is_current(name) {
            self.back_up_changed_elsewhere()?;
        }
        Ok(())
    }

    /// Keeps `subtitle` of the named Resource before a transcription or translation writes over
    /// it: what a change made elsewhere replaced first, then the file as it is, every time when
    /// the Project Options ask for it and else once since the Project was opened.
    pub(super) fn keep_before_mode_writes(
        &mut self,
        name: &str,
        subtitle: &Path,
    ) -> Result<(), Failure> {
        self.back_up_changed_elsewhere_of(name)?;
        self.keep_before_write(subtitle, self.mode_backup_policy())
    }

    /// How a Mode keeps the subtitles it writes over: every time when the Project Options ask for
    /// it, else once since the Project was opened.
    pub(super) fn mode_backup_policy(&self) -> BackupPolicy {
        match self.options.is_overwrite_backed_up {
            true => BackupPolicy::EveryWrite,
            false => BackupPolicy::FirstChange,
        }
    }

    /// Keeps `subtitle` as an Overwrite Backup before Tsuzuri first changes it since the Project
    /// was opened.
    pub(super) fn back_up_first_change(&mut self, subtitle: &Path) -> Result<(), Failure> {
        self.keep_before_write(subtitle, BackupPolicy::FirstChange)
    }

    /// Keeps `subtitle` before it is written over, as `policy` asks.
    fn keep_before_write(&mut self, subtitle: &Path, policy: BackupPolicy) -> Result<(), Failure> {
        match policy {
            BackupPolicy::EveryWrite => self.keep_backup(subtitle, BackupKind::Overwrite),
            BackupPolicy::FirstChange if self.backups.note(subtitle) => Ok(files::back_up(
                &self.directory,
                subtitle,
                SystemTime::now(),
                BackupKind::Overwrite,
            )?),
            BackupPolicy::FirstChange => Ok(()),
        }
    }

    /// Keeps `subtitle` as a Backup of `kind` taken now, and notes it as kept.
    pub(super) fn keep_backup(&mut self, subtitle: &Path, kind: BackupKind) -> Result<(), Failure> {
        files::back_up(&self.directory, subtitle, SystemTime::now(), kind)?;
        self.backups.note(subtitle);
        Ok(())
    }

    /// Gives each cue of the named Resource's translations the Speaker of its original's Segment with
    /// the same times, named as the Translation Glossary names it in that Language, in place of the
    /// label it carried for that Segment in `previous`; first keeps each translation it changes as
    /// `policy` asks.
    pub(super) fn write_speakers_to_translations(
        &mut self,
        name: &str,
        previous: &Transcript,
        policy: BackupPolicy,
    ) -> Result<(), Failure> {
        let resource = self.resource(name)?;
        let Some(subtitle) = &resource.subtitle else {
            return Ok(());
        };
        let original = files::transcript_at(subtitle)?;
        let mut writes = Vec::new();
        for (language, path) in &resource.translations {
            let translation = files::translation_at(path)?;
            let as_read = translation.to_srt(WrittenText::Original);
            let speaker_names = self.speaker_names(Some(*language));
            let srt = translation_with_speakers(&translation, &original, previous, &speaker_names)
                .to_srt_with(
                    WrittenText::Original,
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
            self.keep_before_write(&path, policy)?;
            files::write_text(&path, srt)?;
        }
        Ok(())
    }

    /// Writes `value` into `field` of the Segment at `index` of the Current Resource, read again
    /// first, and writes it back.
    pub(super) fn edit_segment(
        &mut self,
        index: usize,
        field: SegmentField,
        value: &str,
    ) -> Result<(), Failure> {
        self.read_current_transcript()?;
        let previous = self.current()?.transcript.clone();
        let segment = self
            .current_mut()?
            .transcript
            .segments
            .get_mut(index)
            .ok_or_else(|| missing_segment(index))?;
        match field {
            SegmentField::Text => segment.text = text_from(value),
            SegmentField::Translation => segment.translation = Some(text_from(value)),
            SegmentField::Speaker => segment.speaker = speaker_from(value),
        }
        self.write_back(field, &previous)
    }

    /// Gives each Segment at `indexes` of the Current Resource, read again first, the Speaker
    /// `speaker`, or none when it is empty, and writes them back.
    pub(super) fn set_speakers(&mut self, indexes: &[usize], speaker: &str) -> Result<(), Failure> {
        self.read_current_transcript()?;
        let previous = self.current()?.transcript.clone();
        self.refuse_absent_segments(indexes)?;
        let segments = &mut self.current_mut()?.transcript.segments;
        for index in indexes {
            segments[*index].speaker = speaker_from(speaker);
        }
        self.write_back(SegmentField::Speaker, &previous)
    }

    /// Replaces what `replacer` matches in `field` of each Segment of the Current Resource, read
    /// again first, as one change written back, and answers how many matches there were; with
    /// none nothing is written.
    pub(super) fn replace_text(
        &mut self,
        field: SegmentField,
        replacer: &Replacer,
    ) -> Result<usize, Failure> {
        self.read_current_transcript()?;
        self.rewrite_texts(field, |_, text| replacer.replace_matches(text))
    }

    /// Where `finder` matches `field` of each Segment of the Current Resource, in order.
    pub(super) fn text_matches(
        &self,
        field: SegmentField,
        finder: &Finder,
    ) -> Result<Vec<TextMatch>, Failure> {
        let current = self.current()?;
        if field == SegmentField::Translation && current.translation.is_none() {
            return Err(Failure::NoTranslationShown);
        }
        Ok(current
            .transcript
            .segments
            .iter()
            .enumerate()
            .flat_map(|(index, segment)| {
                let text = match field {
                    SegmentField::Translation => segment.translation.as_deref().unwrap_or_default(),
                    _ => &segment.text,
                };
                finder
                    .match_ranges(text)
                    .into_iter()
                    .map(move |(start, end)| TextMatch { index, start, end })
            })
            .collect())
    }

    /// Cleans Simplified Chinese out of the Current Resource's `zh-TW` text within `scope`, read
    /// again first, as one change written back, and answers how many characters changed; with
    /// none nothing is written.
    pub(super) fn clean_simplified(&mut self, scope: &CleanupScope) -> Result<usize, Failure> {
        self.read_current_transcript()?;
        let field = self.traditional_chinese_field()?;
        match scope {
            CleanupScope::Segments { indexes } => {
                self.refuse_absent_segments(indexes)?;
                self.rewrite_texts(field, |index, text| {
                    indexes.contains(&index).then(|| clean_text(text)).flatten()
                })
            }
            CleanupScope::Range {
                index,
                field: range_field,
                start,
                end,
            } => {
                if *range_field != field {
                    return Err(Failure::NoTraditionalChinese);
                }
                let length = self.segment_text(*index, field)?.chars().count();
                if start > end || *end > length {
                    return Err(Failure::Internal {
                        detail: format!("no characters {start} to {end} of {length}"),
                    });
                }
                self.rewrite_texts(field, |at, text| {
                    (at == *index)
                        .then(|| clean_range(text, *start, *end))
                        .flatten()
                })
            }
        }
    }

    /// The field of the Current Resource's Segments in `zh-TW`: the original in a Project whose
    /// Primary Language it is, otherwise the translation shown when it is in `zh-TW`.
    pub(super) fn traditional_chinese_field(&self) -> Result<SegmentField, Failure> {
        if self.language == Language::TraditionalChinese {
            return Ok(SegmentField::Text);
        }
        match self.current()?.translation {
            Some(Language::TraditionalChinese) => Ok(SegmentField::Translation),
            _ => Err(Failure::NoTraditionalChinese),
        }
    }

    fn refuse_absent_segments(&self, indexes: &[usize]) -> Result<(), Failure> {
        let length = self.current()?.transcript.segments.len();
        match indexes.iter().find(|index| **index >= length) {
            Some(index) => Err(missing_segment(*index)),
            None => Ok(()),
        }
    }

    /// The text `field` holds in the Current Resource's Segment at `index`, empty for a
    /// translation it does not have.
    fn segment_text(&self, index: usize, field: SegmentField) -> Result<&str, Failure> {
        let segment = self
            .current()?
            .transcript
            .segments
            .get(index)
            .ok_or_else(|| missing_segment(index))?;
        Ok(match field {
            SegmentField::Translation => segment.translation.as_deref().unwrap_or_default(),
            _ => &segment.text,
        })
    }

    /// Puts what `rewrite` makes of `field` of each Segment of the Current Resource, given its
    /// position, in its place as one change written back, and answers the sum of the counts
    /// `rewrite` gives. A Segment it answers none for, or with no translation to rewrite, is
    /// passed over; with none rewritten nothing is written.
    fn rewrite_texts(
        &mut self,
        field: SegmentField,
        rewrite: impl Fn(usize, &str) -> Option<(String, usize)>,
    ) -> Result<usize, Failure> {
        let current = self.current()?;
        if field == SegmentField::Translation && current.translation.is_none() {
            return Err(Failure::NoTranslationShown);
        }
        let rewritten_texts: Vec<(usize, String, usize)> = current
            .transcript
            .segments
            .iter()
            .enumerate()
            .filter_map(|(index, segment)| {
                let text = match field {
                    SegmentField::Translation => segment.translation.as_deref()?,
                    _ => &segment.text,
                };
                let (text, count) = rewrite(index, text)?;
                Some((index, text, count))
            })
            .collect();
        if rewritten_texts.is_empty() {
            return Ok(0);
        }
        self.make_undoable_change(|project| {
            let previous = project.current()?.transcript.clone();
            let segments = &mut project.current_mut()?.transcript.segments;
            for (index, text, _) in &rewritten_texts {
                match field {
                    SegmentField::Translation => segments[*index].translation = Some(text.clone()),
                    _ => segments[*index].text = text.clone(),
                }
            }
            project.write_back(field, &previous)
        })?;
        Ok(rewritten_texts.iter().map(|(_, _, count)| count).sum())
    }

    /// Makes `change` to the Current Resource's original and to each of its translations, since a
    /// translation is matched to its original by time, and writes them all back.
    pub(super) fn change_segments(&mut self, change: SegmentChange) -> Result<(), Failure> {
        self.read_current_transcript()?;
        let current = self.current()?;
        let name = current.name.clone();
        let mut original = current.transcript.clone();
        change.clone().apply(&mut original.segments)?;
        let resource = self.resource(&name)?;
        let mut translations = Vec::new();
        for (language, path) in &resource.translations {
            let speaker_names = self.speaker_names(Some(*language));
            let mut translation = resource.transcript(Some(*language), &speaker_names)?;
            change.clone().apply(&mut translation.segments)?;
            translations.push((path.clone(), translation_srt(&translation, speaker_names)));
        }
        self.current_mut()?.transcript = original;
        self.write_subtitle(WrittenText::Original)?;
        for (path, srt) in translations {
            self.back_up_first_change(&path)?;
            files::write_text(&path, srt)?;
        }
        self.read_current_again()?;
        self.write_bilingual_subtitles(&name, None)
    }

    pub(super) fn subtitle_versions(&self) -> Result<Vec<SubtitleVersions>, Failure> {
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
    pub(super) fn version_transcript(
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
    pub(super) fn revert_row(
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
        files::write_text(&subtitle, transcript.to_srt(WrittenText::Original))?;
        let name = self.current()?.name.clone();
        self.read_current_again()?;
        self.write_bilingual_subtitles(&name, language)?;
        self.restoration(language, &previous)
    }

    /// Keeps the subtitle in `language` as a Backup, puts the named Backup in its place and reads
    /// the Current Resource again.
    pub(super) fn restore_version(
        &mut self,
        language: Option<Language>,
        backup: &str,
    ) -> Result<Restoration, Failure> {
        let previous = self.current()?.transcript.clone();
        let backup_path = self.backup_of(language, backup)?;
        let subtitle = self.subtitle_path(language)?;
        let name = self.current()?.name.clone();
        self.keep_backup(&subtitle, BackupKind::Overwrite)?;
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
    pub(super) fn write_bilingual_subtitles(
        &self,
        name: &str,
        only: Option<Language>,
    ) -> Result<(), Failure> {
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
            files::write_text(
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
        let options = ProjectOptions {
            name: trimmed_name(options.name.as_deref()),
            ..options
        };
        ProjectConfig {
            options: options.clone(),
            ..self.config()
        }
        .save(&self.directory)?;
        self.options = options;
        Ok(())
    }

    /// The Current Resource's media file, the Language to transcribe it in, the subtitle to write
    /// and the Audio Window `request` covers, refused when that subtitle exists unless `request`
    /// allows writing over it.
    pub(super) fn transcription_target(
        &self,
        request: TranscriptionRequest,
    ) -> Result<TranscriptionTarget, Failure> {
        let resource = self.resource(&self.current()?.name)?;
        let media = resource.media.clone().ok_or(Failure::NoMedia)?;
        let window = request
            .scope
            .audio_window(&self.current()?.transcript.segments)
            .map_err(|SegmentSpan { first, last }| Failure::Internal {
                detail: format!("no Segments at {first}..={last}"),
            })?;
        let subtitle = match &resource.subtitle {
            Some(path) if !request.is_overwrite_allowed => {
                return Err(Failure::SubtitleExists { path: path.clone() })
            }
            Some(path) => path.clone(),
            None => self.export_path(WrittenText::Original, ExportFormat::Srt)?,
        };
        Ok(TranscriptionTarget {
            directory: self.directory.clone(),
            name: self.current()?.name.clone(),
            media,
            subtitle,
            language: self.language,
            model: self.options.models.transcription.clone(),
            overrides: self.options.transcription,
            window,
        })
    }

    /// The Current Resource's media file and the original subtitle a diarization gives Speakers
    /// to, refused without either.
    pub(super) fn diarization_target(&self) -> Result<DiarizationTarget, Failure> {
        let name = self.current()?.name.clone();
        let resource = self.resource(&name)?;
        let media = resource.media.clone().ok_or(Failure::NoMedia)?;
        let subtitle = resource.subtitle.clone().ok_or(Failure::NoSubtitle)?;
        Ok(DiarizationTarget {
            directory: self.directory.clone(),
            name,
            media,
            subtitle,
        })
    }

    pub(super) fn save_config(&self) -> Result<(), Failure> {
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

/// The text `value` holds, without the line breaks and spaces after its last character: a field
/// keeps a line break typed at the end that it no longer shows, and SRT writes none of them.
fn text_from(value: &str) -> String {
    value.trim_end().to_string()
}

/// The Speaker `value` names, trimmed; an empty one names none.
fn speaker_from(value: &str) -> Option<String> {
    let speaker = value.trim();
    (!speaker.is_empty()).then(|| speaker.to_string())
}

/// The Resource of `resources` named `name`, if any.
pub(super) fn resource_by_name<'a>(resources: &'a [Resource], name: &str) -> Option<&'a Resource> {
    resources.iter().find(|resource| resource.name == name)
}

/// The failure of asking for a Segment at `index` the Current Resource does not have, which the
/// webview never offers.
pub(super) fn missing_segment(index: usize) -> Failure {
    Failure::Internal {
        detail: format!("no Segment at {index}"),
    }
}

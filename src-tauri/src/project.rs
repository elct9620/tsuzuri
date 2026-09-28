use std::borrow::Cow;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::language::{Language, LanguagePair};
use crate::model_source::{parse_saved_source, ModelSource};
use crate::transcript::{split_label, AudioWindow, Segment, SpeakerNames, Transcript, WrittenText};

mod backups;
pub mod commands;
mod current;
mod files;
pub mod glossary;
mod history;
mod mode_hold;
mod recent;
mod requested_srt;
pub mod versions;

use backups::Backups;
pub use current::{CurrentProject, ProjectView, Reload, ResourceView};
#[cfg(test)]
pub(crate) use files::HISTORY_DIR;
use glossary::TranslationGlossary;
use history::UndoHistory;
pub use mode_hold::RunningMode;
pub use requested_srt::{srt_argument, RequestedSrt};

/// The opened directory: its Primary Language, the Language of its last translation,
/// its Resources, the Current Resource and the Translation Glossary once loaded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub directory: PathBuf,
    pub language: Language,
    pub translation_language: Option<Language>,
    pub translation_glossary: Option<TranslationGlossary>,
    pub options: ProjectOptions,
    pub resources: Vec<Resource>,
    pub current: Option<CurrentResource>,
    /// The Undo History of each Resource changed since the Project was opened, by its name.
    pub undo_histories: HashMap<String, UndoHistory>,
    pub backups: Backups,
}

/// The Resource the editor shows, with its Segments as its files hold them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentResource {
    pub name: String,
    pub transcript: Transcript,
    /// The Language of the translations its Segments carry.
    pub translation: Option<Language>,
    /// What its subtitle files held when Tsuzuri last read or wrote them, to tell a change made
    /// elsewhere and keep what that change replaced.
    pub known_subtitles: Vec<KnownSubtitle>,
}

/// A subtitle file and what it held, or `None` while it did not exist.
pub type KnownSubtitle = (PathBuf, Option<Vec<u8>>);

/// Why the Project could not answer: it has no Resource by the name asked for, or none is current.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectError {
    NoResource,
}

impl Project {
    /// The Project Name: the one the Project Options give, else the directory's name.
    pub fn name(&self) -> String {
        project_name(self.options.name.as_deref(), &self.directory)
    }

    /// The Languages a Translation Glossary's `source,target` header stands for: the Primary
    /// Language and the translation Language, once the Project has one.
    fn source_target(&self) -> Option<LanguagePair> {
        self.translation_language.map(|target| LanguagePair {
            source: self.language,
            target,
        })
    }

    /// The Primary Language and `translation` in the Bilingual Order.
    fn bilingual_languages(&self, translation: Option<Language>) -> [Option<Language>; 2] {
        match self.options.bilingual_order {
            BilingualOrder::OriginalFirst => [Some(self.language), translation],
            BilingualOrder::TranslationFirst => [translation, Some(self.language)],
        }
    }

    /// What the Translation Glossary calls each Speaker in `language`, by its name in the
    /// Primary Language; none without a glossary.
    fn speaker_names(&self, language: Option<Language>) -> HashMap<String, String> {
        let pair = language.map(|target| LanguagePair {
            source: self.language,
            target,
        });
        match (&self.translation_glossary, pair) {
            (Some(glossary), Some(pair)) => glossary.speaker_names(pair),
            _ => HashMap::new(),
        }
    }

    /// `transcript` as a Bilingual SRT in the Bilingual Order, its translation into `translation`.
    fn bilingual_srt(&self, transcript: &Transcript, translation: Option<Language>) -> String {
        let (transcript, names) =
            self.export_source(transcript, WrittenText::Bilingual, translation);
        transcript.to_srt_with(WrittenText::Bilingual, &names)
    }

    /// What an export carrying `content` writes of `transcript`, its translation into
    /// `translation`, with what each text calls its Speakers: a bilingual one in the Bilingual
    /// Order.
    fn export_source<'a>(
        &self,
        transcript: &'a Transcript,
        content: WrittenText,
        translation: Option<Language>,
    ) -> (Cow<'a, Transcript>, SpeakerNames) {
        let translated_names = self.speaker_names(translation);
        match (content, self.options.bilingual_order) {
            (WrittenText::Original, _) => (Cow::Borrowed(transcript), SpeakerNames::default()),
            (WrittenText::Bilingual, BilingualOrder::TranslationFirst) => (
                Cow::Owned(translation_first(transcript)),
                SpeakerNames {
                    text: translated_names,
                    ..SpeakerNames::default()
                },
            ),
            (WrittenText::Translation | WrittenText::Bilingual, _) => (
                Cow::Borrowed(transcript),
                SpeakerNames {
                    translation: translated_names,
                    ..SpeakerNames::default()
                },
            ),
        }
    }

    fn config(&self) -> ProjectConfig {
        ProjectConfig {
            language: Some(self.language),
            translation_language: self.translation_language,
            options: self.options.clone(),
        }
    }

    /// The Current Resource as SRT, a Bilingual SRT in the Bilingual Order.
    fn to_srt(&self, content: WrittenText) -> Result<String, ProjectError> {
        let current = self.current()?;
        let (transcript, names) =
            self.export_source(&current.transcript, content, current.translation);
        Ok(transcript.to_srt_with(content, &names))
    }

    /// The Current Resource as Plain Text, a bilingual one in the Bilingual Order, naming each
    /// Speaker as its SRT would unless `has_speakers` leaves them out.
    fn to_plain_text(
        &self,
        content: WrittenText,
        has_speakers: bool,
    ) -> Result<String, ProjectError> {
        let current = self.current()?;
        let (transcript, names) =
            self.export_source(&current.transcript, content, current.translation);
        let transcript = if has_speakers {
            transcript
        } else {
            Cow::Owned(transcript_without_speakers(&transcript))
        };
        Ok(transcript.to_plain_text_with(content, &names))
    }

    fn resource(&self, name: &str) -> Result<&Resource, ProjectError> {
        self.resources
            .iter()
            .find(|resource| resource.name == name)
            .ok_or(ProjectError::NoResource)
    }

    fn current(&self) -> Result<&CurrentResource, ProjectError> {
        self.current.as_ref().ok_or(ProjectError::NoResource)
    }

    fn current_mut(&mut self) -> Result<&mut CurrentResource, ProjectError> {
        self.current.as_mut().ok_or(ProjectError::NoResource)
    }
}

/// The translated Segments alone, each with its translation as its text.
fn translation_only(transcript: &Transcript) -> Transcript {
    Transcript {
        segments: transcript
            .segments
            .iter()
            .filter_map(|segment| {
                let translation = segment.translation.as_deref()?;
                (!translation.trim().is_empty()).then(|| Segment {
                    text: translation.to_string(),
                    translation: None,
                    ..segment.clone()
                })
            })
            .collect(),
    }
}

/// The translated Segments of `transcript` as the SRT of its translation, each Speaker called
/// as `speaker_names` gives.
fn translation_srt(transcript: &Transcript, speaker_names: HashMap<String, String>) -> String {
    translation_only(transcript).to_srt_with(
        WrittenText::Original,
        &SpeakerNames {
            text: speaker_names,
            ..SpeakerNames::default()
        },
    )
}

/// For each of `cues`, the Segment of `segments` with its times, the one a translation's cue
/// belongs to. Segments said at once share their times, so the cues at the same times pair with
/// those Segments in the order each list holds them.
fn segments_at_times<'a>(segments: &'a [Segment], cues: &[Segment]) -> Vec<Option<&'a Segment>> {
    let mut segments_by_times: HashMap<(u64, u64), VecDeque<&Segment>> = HashMap::new();
    for segment in segments {
        segments_by_times
            .entry((segment.start_ms, segment.end_ms))
            .or_default()
            .push_back(segment);
    }
    cues.iter()
        .map(|cue| {
            segments_by_times
                .get_mut(&(cue.start_ms, cue.end_ms))
                .and_then(VecDeque::pop_front)
        })
        .collect()
}

/// What a restore or a translation left behind: how many Segments of the original have times
/// that no translation lines up with.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Restoration {
    pub unmatched_count: usize,
}

impl Restoration {
    /// The Segments of `now` with times `previous` did not have, and no cue at them in one of
    /// `translations`; a translation lines up with its original by time alone.
    fn new(previous: &Transcript, now: &Transcript, translations: &[Transcript]) -> Restoration {
        let previous_segments = segments_at_times(&previous.segments, &now.segments);
        let cues_by_translation: Vec<Vec<Option<&Segment>>> = translations
            .iter()
            .map(|translation| segments_at_times(&translation.segments, &now.segments))
            .collect();
        let unmatched_count = (0..now.segments.len())
            .filter(|&at| previous_segments[at].is_none())
            .filter(|&at| cues_by_translation.iter().any(|cues| cues[at].is_none()))
            .count();
        Restoration { unmatched_count }
    }
}

/// The dialogue of a translation's cue, as written, for a Segment said by `speaker`. Tsuzuri
/// writes that Speaker's label before it, named as `names` gives, so that label is taken off, or
/// whatever label the line opens with when the name has changed since; a Segment with no Speaker
/// has no label to take off, so a line that only looks like one stays dialogue.
fn translated_dialogue(
    text: &str,
    speaker: Option<&str>,
    names: &HashMap<String, String>,
) -> String {
    let Some(speaker) = speaker else {
        return text.to_string();
    };
    let name = names.get(speaker).map_or(speaker, String::as_str);
    let dialogue = text
        .strip_prefix(name)
        .and_then(|rest| rest.strip_prefix([':', '：']))
        .map(|rest| rest.trim_start_matches([' ', '\t']))
        .or_else(|| match split_label(text) {
            (Some(_), dialogue) => Some(dialogue),
            (None, _) => None,
        });
    dialogue.unwrap_or(text).to_string()
}

/// `translation`'s cues, each with the Speaker of the Segment of `original` with its times in
/// place of the label it carried for that Segment of `previous`; a cue with other times belongs to
/// no Segment and stays as written.
fn translation_with_speakers(
    translation: &Transcript,
    original: &Transcript,
    previous: &Transcript,
    speaker_names: &HashMap<String, String>,
) -> Transcript {
    let segments = segments_at_times(&original.segments, &translation.segments);
    let previous_segments = segments_at_times(&previous.segments, &translation.segments);
    Transcript {
        segments: translation
            .segments
            .iter()
            .zip(segments.into_iter().zip(previous_segments))
            .map(|(cue, (segment, previous_segment))| {
                let Some(segment) = segment else {
                    return cue.clone();
                };
                let before = previous_segment.and_then(|segment| segment.speaker.as_deref());
                Segment {
                    speaker: segment.speaker.clone(),
                    text: translated_dialogue(&cue.text, before, speaker_names),
                    ..cue.clone()
                }
            })
            .collect(),
    }
}

/// Each Segment of `transcript` with no Speaker named.
fn transcript_without_speakers(transcript: &Transcript) -> Transcript {
    Transcript {
        segments: transcript
            .segments
            .iter()
            .map(|segment| Segment {
                speaker: None,
                ..segment.clone()
            })
            .collect(),
    }
}

/// Each translated Segment with its translation as its text and its text as its translation.
fn translation_first(transcript: &Transcript) -> Transcript {
    Transcript {
        segments: transcript
            .segments
            .iter()
            .map(|segment| match segment.translation.as_deref() {
                Some(translation) if !translation.trim().is_empty() => Segment {
                    text: translation.to_string(),
                    translation: Some(segment.text.clone()),
                    ..segment.clone()
                },
                _ => segment.clone(),
            })
            .collect(),
    }
}

/// Which text of a Segment an edit replaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SegmentField {
    Text,
    Translation,
    /// Written to the original and the translation shown; an empty one leaves the Segment with none.
    Speaker,
}

/// Where a Search matches: characters `start` to `end` of the Segment at `index`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct TextMatch {
    pub index: usize,
    pub start: usize,
    pub end: usize,
}

/// Where a Simplified Cleanup cleans the Current Resource's `zh-TW` text.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CleanupScope {
    /// The Segments at these positions.
    Segments { indexes: Vec<usize> },
    /// Characters `start` to `end` of `field` of the Segment at `index`.
    Range {
        index: usize,
        field: SegmentField,
        start: usize,
        end: usize,
    },
}

/// What a translation needs from the Project when it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationSource {
    pub directory: PathBuf,
    /// The Resource being translated.
    pub name: String,
    pub transcript: Transcript,
    /// The Primary Language it is translated from.
    pub language: Language,
    /// The Project Model to translate with in place of the general one.
    pub model: Option<ModelSource>,
}

/// The Segments from `first` through `last`, by position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SegmentSpan {
    pub first: usize,
    pub last: usize,
}

/// Which Segments a transcription replaces, by the positions the Current Resource shows: every
/// one, those from `first` on to the media's end, or those of a span.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum TranscriptionScope {
    Whole,
    Rest { first: usize },
    Span(SegmentSpan),
}

impl TranscriptionScope {
    /// The Audio Window the scope covers over `segments`, none for the whole media file; the
    /// positions it names are answered back when `segments` do not have them.
    pub fn audio_window(self, segments: &[Segment]) -> Result<Option<AudioWindow>, SegmentSpan> {
        let span = match self {
            TranscriptionScope::Whole => return Ok(None),
            TranscriptionScope::Rest { first } => SegmentSpan { first, last: first },
            TranscriptionScope::Span(span) => span,
        };
        let span_segments = segments
            .get(span.first..=span.last)
            .filter(|span_segments| !span_segments.is_empty())
            .ok_or(span)?;
        let end_ms = match self {
            TranscriptionScope::Span(_) => span_segments.iter().map(|segment| segment.end_ms).max(),
            _ => None,
        };
        Ok(Some(AudioWindow {
            start_ms: span_segments[0].start_ms,
            end_ms,
        }))
    }
}

/// What a transcription needs from the Project when it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptionTarget {
    pub directory: PathBuf,
    /// The Resource being transcribed.
    pub name: String,
    pub media: PathBuf,
    /// Where the Resource's original subtitle is written.
    pub subtitle: PathBuf,
    pub language: Language,
    /// The Project Model to transcribe with in place of the general one.
    pub model: Option<ModelSource>,
    /// The Transcription Settings the Project sets for itself.
    pub overrides: TranscriptionOverrides,
    /// The Audio Window it covers, none for the whole media file.
    pub window: Option<AudioWindow>,
}

/// The files of a Project sharing one name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resource {
    pub name: String,
    pub media: Option<PathBuf>,
    /// The subtitle in the Primary Language.
    pub subtitle: Option<PathBuf>,
    /// A subtitle for each other Language, in the order of [`Language::ALL`].
    pub translations: Vec<(Language, PathBuf)>,
}

impl Resource {
    pub fn translation_path(&self, language: Language) -> Option<&Path> {
        self.translations
            .iter()
            .find(|(each, _)| *each == language)
            .map(|(_, path)| path.as_path())
    }
}

/// What a Project records about itself in its directory, so it opens the same way next time.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectConfig {
    /// The Primary Language, or none to follow the Interface Language.
    pub language: Option<Language>,
    /// The Language of the last translation.
    pub translation_language: Option<Language>,
    #[serde(flatten)]
    pub options: ProjectOptions,
}

/// What the user sets for one Project in the settings beside its Primary Language.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectOptions {
    /// The Project Name the user gave, or none to name the Project after its directory.
    pub name: Option<String>,
    pub bilingual_order: BilingualOrder,
    /// Whether each translation keeps a Bilingual SRT beside it, written with either of its texts.
    pub is_bilingual_autosaved: bool,
    /// Whether a subtitle about to be overwritten is first kept as a Backup.
    pub is_overwrite_backed_up: bool,
    pub models: ProjectModels,
    pub transcription: TranscriptionOverrides,
}

/// The Project Models by the slot each is chosen for; a slot without one uses the general settings' Model.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectModels {
    #[serde(deserialize_with = "parse_saved_source")]
    pub transcription: Option<ModelSource>,
    #[serde(deserialize_with = "parse_saved_source")]
    pub translation: Option<ModelSource>,
}

/// The Transcription Settings a Project sets for itself; one left `None` follows the general settings.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct TranscriptionOverrides {
    pub has_vad: Option<bool>,
    pub is_non_speech_suppressed: Option<bool>,
    pub is_context_carried: Option<bool>,
    pub is_simplified_cleaned: Option<bool>,
}

/// The form an export of the Current Resource is written in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Srt,
    PlainText,
}

impl ExportFormat {
    fn extension(self) -> &'static str {
        match self {
            ExportFormat::Srt => "srt",
            ExportFormat::PlainText => "txt",
        }
    }
}

/// Which text a Bilingual SRT puts first in each cue and in its file name.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BilingualOrder {
    #[default]
    OriginalFirst,
    TranslationFirst,
}

/// A Backup of one subtitle, by its file name in the history, the UTC time it was taken and its kind.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Backup {
    pub file: String,
    /// `YYYYMMDDTHHMMSSZ`
    pub taken_at: String,
    pub kind: BackupKind,
}

/// What a Backup keeps: what a Mode has just written, or a subtitle just before it was written over.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackupKind {
    Output,
    Overwrite,
}

/// The Project Name of a Project in `directory` whose Project Options give `name`: that name
/// without the spaces around it, else the directory's name.
fn project_name(name: Option<&str>, directory: &Path) -> String {
    trimmed_name(name).unwrap_or_else(|| directory_name(directory))
}

/// A Project Name without the spaces around it, or none when nothing else is left.
fn trimmed_name(name: Option<&str>) -> Option<String> {
    name.map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

/// The name of `directory` as a Project is named without a Project Name of its own.
fn directory_name(directory: &Path) -> String {
    directory.file_name().map_or_else(
        || directory.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_back_a_span_whose_first_segment_comes_after_its_last() {
        let segments = vec![
            Segment {
                start_ms: 0,
                end_ms: 1_000,
                speaker: None,
                text: "a".to_string(),
                translation: None,
            };
            3
        ];
        let span = SegmentSpan { first: 2, last: 1 };

        let window = TranscriptionScope::Span(span).audio_window(&segments);

        assert_eq!(window, Err(span));
    }
}

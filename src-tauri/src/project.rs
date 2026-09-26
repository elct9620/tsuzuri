use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::language::{Language, LanguagePair};
use crate::transcript::{split_label, Segment, SpeakerNames, SrtContent, Transcript};

pub mod commands;
mod current;
mod files;
pub mod glossary;
mod history;
pub mod versions;

pub use current::{CurrentProject, ProjectView, ResourceView, RunningMode, SegmentSpan};
#[cfg(test)]
pub(crate) use files::HISTORY_DIR;
use glossary::TranslationGlossary;
use history::UndoHistory;

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
}

/// The Resource the editor shows, with its Segments as read from the directory and edited since.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentResource {
    pub name: String,
    pub transcript: Transcript,
    /// The Language of the translations its Segments carry.
    pub translation: Option<Language>,
    /// What its subtitle files held when Tsuzuri last read or wrote them, to tell a change made elsewhere.
    pub subtitle_digests: Vec<SubtitleDigest>,
}

/// A subtitle file and a digest of what it held, or `None` while it did not exist.
pub type SubtitleDigest = (PathBuf, Option<u64>);

/// Why the Project could not answer: it has no Resource by the name asked for, or none is current.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectError {
    NoResource,
}

impl Project {
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
        let translated_names = self.speaker_names(translation);
        match self.options.bilingual_order {
            BilingualOrder::OriginalFirst => transcript.to_srt_with(
                SrtContent::Bilingual,
                &SpeakerNames {
                    translation: translated_names,
                    ..SpeakerNames::default()
                },
            ),
            BilingualOrder::TranslationFirst => translation_first(transcript).to_srt_with(
                SrtContent::Bilingual,
                &SpeakerNames {
                    text: translated_names,
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
    fn to_srt(&self, content: SrtContent) -> Result<String, ProjectError> {
        let current = self.current()?;
        let transcript = &current.transcript;
        Ok(match content {
            SrtContent::Bilingual => self.bilingual_srt(transcript, current.translation),
            SrtContent::Translation => transcript.to_srt_with(
                content,
                &SpeakerNames {
                    translation: self.speaker_names(current.translation),
                    ..SpeakerNames::default()
                },
            ),
            SrtContent::Original => transcript.to_srt(content),
        })
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
        SrtContent::Original,
        &SpeakerNames {
            text: speaker_names,
            ..SpeakerNames::default()
        },
    )
}

/// The Segment of `segments` with the times of `cue`, the one a translation's cue belongs to.
fn segment_at_times<'a>(segments: &'a [Segment], cue: &Segment) -> Option<&'a Segment> {
    segments
        .iter()
        .find(|segment| (segment.start_ms, segment.end_ms) == (cue.start_ms, cue.end_ms))
}

/// What a restore left behind: how many Segments it gave times that no translation lines up with.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Restoration {
    pub unmatched_count: usize,
}

impl Restoration {
    /// The Segments of `now` with times `previous` did not have, and no cue at them in one of
    /// `translations`; a translation lines up with its original by time alone.
    fn new(previous: &Transcript, now: &Transcript, translations: &[Transcript]) -> Restoration {
        let unmatched_count = now
            .segments
            .iter()
            .filter(|segment| segment_at_times(&previous.segments, segment).is_none())
            .filter(|segment| {
                translations
                    .iter()
                    .any(|translation| segment_at_times(&translation.segments, segment).is_none())
            })
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
    Transcript {
        segments: translation
            .segments
            .iter()
            .map(|cue| {
                let Some(segment) = segment_at_times(&original.segments, cue) else {
                    return cue.clone();
                };
                let before = segment_at_times(&previous.segments, cue)
                    .and_then(|segment| segment.speaker.as_deref());
                Segment {
                    speaker: segment.speaker.clone(),
                    text: translated_dialogue(&cue.text, before, speaker_names),
                    ..cue.clone()
                }
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

/// What a translation needs from the Project when it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationSource {
    pub generation: u64,
    pub directory: PathBuf,
    /// The Resource being translated.
    pub name: String,
    pub transcript: Transcript,
    /// The Primary Language it is translated from.
    pub language: Language,
    /// The Project Model to translate with in place of the general one.
    pub model: Option<PathBuf>,
}

/// What a transcription needs from the Project when it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptionTarget {
    pub generation: u64,
    pub directory: PathBuf,
    /// The Resource being transcribed.
    pub name: String,
    pub media: PathBuf,
    /// Where the Resource's original subtitle is written.
    pub subtitle: PathBuf,
    pub language: Language,
    /// The Project Model to transcribe with in place of the general one.
    pub model: Option<PathBuf>,
    pub transcription: TranscriptionOverrides,
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
    pub transcription: Option<PathBuf>,
    pub translation: Option<PathBuf>,
}

/// The Transcription Settings a Project sets for itself; one left `None` follows the general settings.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct TranscriptionOverrides {
    pub has_vad: Option<bool>,
    pub is_non_speech_suppressed: Option<bool>,
    pub is_context_carried: Option<bool>,
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

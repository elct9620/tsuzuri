use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::failure::Failure;
use crate::language::{Language, LanguagePair};
use crate::transcript::{Segment, SrtContent, Transcript};

pub mod commands;
mod current;
mod files;
pub mod glossary;
pub mod versions;

pub use current::{CurrentProject, ProjectView, ResourceView};
#[cfg(test)]
pub(crate) use files::HISTORY_DIR;
use glossary::TranslationGlossary;

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

    /// `transcript` as a Bilingual SRT in the Bilingual Order.
    fn bilingual_srt(&self, transcript: &Transcript) -> String {
        match self.options.bilingual_order {
            BilingualOrder::OriginalFirst => transcript.to_srt(SrtContent::Bilingual),
            BilingualOrder::TranslationFirst => {
                translation_first(transcript).to_srt(SrtContent::Bilingual)
            }
        }
    }

    fn config(&self) -> ProjectConfig {
        ProjectConfig {
            language: Some(self.language),
            translation_language: self.translation_language,
            options: self.options,
        }
    }

    /// The Current Resource as SRT, a Bilingual SRT in the Bilingual Order.
    fn to_srt(&self, content: SrtContent) -> Result<String, Failure> {
        let transcript = &self.current()?.transcript;
        Ok(match content {
            SrtContent::Bilingual => self.bilingual_srt(transcript),
            _ => transcript.to_srt(content),
        })
    }

    fn resource(&self, name: &str) -> Result<&Resource, Failure> {
        self.resources
            .iter()
            .find(|resource| resource.name == name)
            .ok_or(Failure::NoResource)
    }

    fn current(&self) -> Result<&CurrentResource, Failure> {
        self.current.as_ref().ok_or(Failure::NoResource)
    }

    fn current_mut(&mut self) -> Result<&mut CurrentResource, Failure> {
        self.current.as_mut().ok_or(Failure::NoResource)
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
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectOptions {
    pub bilingual_order: BilingualOrder,
    /// Whether each translation keeps a Bilingual SRT beside it, written with either of its texts.
    pub is_bilingual_autosaved: bool,
    /// Whether a subtitle about to be overwritten is first kept as a Backup.
    pub is_overwrite_backed_up: bool,
}

/// Which text a Bilingual SRT puts first in each cue and in its file name.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BilingualOrder {
    #[default]
    OriginalFirst,
    TranslationFirst,
}

/// A Backup of one subtitle, by its file name in the history and the UTC time it was taken.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Backup {
    pub file: String,
    /// `YYYYMMDDTHHMMSSZ`
    pub taken_at: String,
}

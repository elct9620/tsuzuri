use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::registry::ScriptFailure;
use crate::language::Language;
use crate::transcript::Segment;

/// What a Script reads of the Current Resource: every Segment with its text in each Language.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Snapshot {
    pub primary: Language,
    /// The Primary Language first, then each translation.
    pub languages: Vec<Language>,
    pub segments: Vec<SnapshotSegment>,
    /// Positions in `segments` of the Checked Segments, which a Script reads as `checked`.
    pub checked_segments: Vec<usize>,
}

/// One Segment as a Script reads and returns it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: Option<String>,
    /// Its text by Language, without a Language whose text is blank.
    pub texts: BTreeMap<Language, String>,
}

/// The export options an Export Format is handed, as the Export menu holds them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportOptions {
    pub has_speakers: bool,
    pub has_blank_lines: bool,
    /// What each Speaker Label is called, for the Speakers the Project names otherwise.
    pub speaker_names: BTreeMap<String, String>,
}

/// What an Export Format is handed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportInput {
    pub snapshot: Snapshot,
    pub options: ExportOptions,
}

impl Snapshot {
    /// The Snapshot of `original`, the Primary Language Segments, with each of `translations`
    /// holding the text lined up with each Segment, none where no cue does.
    pub fn new(
        primary: Language,
        original: &[Segment],
        translations: Vec<(Language, Vec<Option<String>>)>,
        checked_segments: Vec<usize>,
    ) -> Snapshot {
        let segments = original
            .iter()
            .enumerate()
            .map(|(index, segment)| {
                let translated = translations.iter().filter_map(|(language, texts)| {
                    let text = texts.get(index)?.as_ref()?;
                    Some((*language, text.clone()))
                });
                SnapshotSegment {
                    start_ms: segment.start_ms,
                    end_ms: segment.end_ms,
                    speaker: segment.speaker.clone(),
                    texts: std::iter::once((primary, segment.text.clone()))
                        .chain(translated)
                        .filter(|(_, text)| !text.trim().is_empty())
                        .collect(),
                }
            })
            .collect();
        Snapshot {
            primary,
            languages: std::iter::once(primary)
                .chain(translations.iter().map(|(language, _)| *language))
                .collect(),
            segments,
            checked_segments,
        }
    }
}

/// What a Script's Segments write over a Resource: its original, and each translation as the
/// original's Segments carrying that Language's text as their translation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WrittenSubtitles {
    pub original: Vec<Segment>,
    pub translations: Vec<(Language, Vec<Segment>)>,
}

impl Snapshot {
    /// The subtitles `segments` write over the Resource this Snapshot is of, refused as a whole
    /// when a Segment ends before it starts, starts before the one before it, or has a text in a
    /// Language the Snapshot does not hold.
    pub fn written_subtitles(
        &self,
        segments: &[SnapshotSegment],
    ) -> Result<WrittenSubtitles, ScriptFailure> {
        for (index, segment) in segments.iter().enumerate() {
            if segment.end_ms < segment.start_ms {
                return Err(ScriptFailure::InvalidTimes { number: index + 1 });
            }
            if index > 0 && segment.start_ms < segments[index - 1].start_ms {
                return Err(ScriptFailure::UnorderedTimes { number: index + 1 });
            }
            if let Some(language) = segment
                .texts
                .keys()
                .find(|language| !self.languages.contains(language))
            {
                return Err(ScriptFailure::UnheldLanguage {
                    language: *language,
                });
            }
        }
        let carrying = |translation: Option<Language>| -> Vec<Segment> {
            segments
                .iter()
                .map(|segment| Segment {
                    start_ms: segment.start_ms,
                    end_ms: segment.end_ms,
                    speaker: segment.speaker.clone(),
                    text: segment
                        .texts
                        .get(&self.primary)
                        .cloned()
                        .unwrap_or_default(),
                    translation: translation
                        .and_then(|language| segment.texts.get(&language).cloned()),
                })
                .collect()
        };
        Ok(WrittenSubtitles {
            original: carrying(None),
            translations: self.languages[1..]
                .iter()
                .map(|language| (*language, carrying(Some(*language))))
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(text: &str) -> Segment {
        Segment {
            start_ms: 0,
            end_ms: 1000,
            speaker: None,
            text: text.to_string(),
            translation: None,
        }
    }

    fn texts_of(translation: &str) -> BTreeMap<Language, String> {
        let snapshot = Snapshot::new(
            Language::TraditionalChinese,
            &[segment("你好")],
            vec![(Language::English, vec![Some(translation.to_string())])],
            vec![],
        );
        snapshot.segments[0].texts.clone()
    }

    // @behavior SR-001
    #[test]
    fn gives_each_segment_its_text_in_every_language() {
        assert_eq!(
            texts_of("Hello"),
            BTreeMap::from([
                (Language::TraditionalChinese, "你好".to_string()),
                (Language::English, "Hello".to_string()),
            ])
        );
    }

    // @behavior SR-002
    #[test]
    fn leaves_a_blank_translation_out() {
        assert_eq!(
            texts_of("  "),
            BTreeMap::from([(Language::TraditionalChinese, "你好".to_string())])
        );
    }

    #[test]
    fn lists_the_primary_language_first() {
        let snapshot = Snapshot::new(
            Language::English,
            &[segment("Hello")],
            vec![(Language::TraditionalChinese, vec![None])],
            vec![],
        );
        assert_eq!(
            snapshot.languages,
            [Language::English, Language::TraditionalChinese]
        );
    }

    #[test]
    fn writes_texts_keyed_by_language_code() {
        let json = serde_json::to_value(texts_of("Hello")).unwrap();
        assert_eq!(json, serde_json::json!({"zh-TW": "你好", "en": "Hello"}));
    }
}

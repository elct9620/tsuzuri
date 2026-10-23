use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

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

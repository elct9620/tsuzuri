//! The Glossary Marks the editor underlines in a Segment's text and in the translation shown: where
//! the Translation Glossary's terms are written.

use std::ops::Range;

use serde::Serialize;

use crate::language::Language;
use crate::term_search::word_spans;
use crate::transcript::Segment;

use super::glossary::TranslationGlossary;

/// A stretch of a field the editor underlines, from `start` to `end` in UTF-16 units, as the
/// webview counts text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct GlossaryMark {
    start: usize,
    end: usize,
    /// The words the stretch holds, as the field writes them.
    word: String,
    kind: GlossaryMarkKind,
}

/// What a Glossary Mark stands for; serialized in lowercase, as `term`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum GlossaryMarkKind {
    /// A term of the Translation Glossary.
    Term,
}

/// The Glossary Marks of one Segment's text and of its translation shown.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
pub struct SegmentGlossaryMarks {
    text: Vec<GlossaryMark>,
    translation: Vec<GlossaryMark>,
}

/// The Glossary Marks of each of `segments`, whose text is in `language` and whose translation
/// shown in `translation`.
pub fn segment_glossary_marks(
    segments: &[Segment],
    glossary: Option<&TranslationGlossary>,
    language: Language,
    translation: Option<Language>,
) -> Vec<SegmentGlossaryMarks> {
    let Some(glossary) = glossary else {
        return vec![SegmentGlossaryMarks::default(); segments.len()];
    };
    let text_words = glossary.words(language);
    let translation_words = translation.map_or_else(Vec::new, |language| glossary.words(language));
    segments
        .iter()
        .map(|segment| SegmentGlossaryMarks {
            text: term_marks(&segment.text, &text_words, false),
            translation: segment
                .translation
                .as_deref()
                .map_or_else(Vec::new, |translation| {
                    term_marks(translation, &translation_words, true)
                }),
        })
        .collect()
}

/// Where `words` are written in `text`, ignoring case when `is_case_ignored`; of terms that
/// overlap, the longer is kept.
fn term_marks(text: &str, words: &[&str], is_case_ignored: bool) -> Vec<GlossaryMark> {
    let mut spans: Vec<Range<usize>> = words
        .iter()
        .flat_map(|word| word_spans(text, word, is_case_ignored))
        .collect();
    // The longest first, so a shorter term inside a longer one is the one left out
    spans.sort_by_key(|span| (std::cmp::Reverse(span.len()), span.start));
    let mut kept_spans: Vec<Range<usize>> = Vec::new();
    for span in spans {
        if kept_spans
            .iter()
            .all(|kept| span.end <= kept.start || kept.end <= span.start)
        {
            kept_spans.push(span);
        }
    }
    kept_spans.sort_unstable_by_key(|span| span.start);
    kept_spans
        .into_iter()
        .map(|span| GlossaryMark {
            start: utf16_offset(text, span.start),
            end: utf16_offset(text, span.end),
            word: text[span].to_string(),
            kind: GlossaryMarkKind::Term,
        })
        .collect()
}

/// How many UTF-16 units of `text` come before byte `offset`.
fn utf16_offset(text: &str, offset: usize) -> usize {
    text[..offset].encode_utf16().count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::CurrentProject;
    use crate::test_support::{project_of, TempDir};

    /// The Glossary Marks a `zh-TW` Project, in directory `name`, shows of `segment` with `glossary.csv` reading `csv`,
    /// showing its translation into `translation`.
    fn marks_shown(
        name: &str,
        csv: &str,
        segment: Segment,
        translation: Option<Language>,
    ) -> SegmentGlossaryMarks {
        let dir = TempDir::new(name);
        std::fs::write(dir.path().join("glossary.csv"), csv).unwrap();
        let mut project = project_of(vec![segment]);
        project.translation_glossary =
            TranslationGlossary::from_directory(dir.path(), None).unwrap();
        project.current.as_mut().unwrap().translation = translation;
        let current = CurrentProject::default();
        current.replace(project);
        current.view().unwrap().glossary_marks()[0].clone()
    }

    fn translated_segment(text: &str, translation: &str) -> Segment {
        Segment {
            translation: Some(translation.to_string()),
            ..crate::test_support::segment(0, 1000, text)
        }
    }

    fn term_mark(start: usize, end: usize, word: &str) -> GlossaryMark {
        GlossaryMark {
            start,
            end,
            word: word.to_string(),
            kind: GlossaryMarkKind::Term,
        }
    }

    // @behavior GM-001
    #[test]
    fn marks_a_term_in_the_text() {
        let marks = marks_shown(
            "gm-text",
            "zh-TW,en\n蝙蝠俠,Batman\n",
            crate::test_support::segment(0, 1000, "今天蝙蝠俠來了"),
            None,
        );

        assert_eq!(marks.text, [term_mark(2, 5, "蝙蝠俠")]);
    }

    // @behavior GM-002
    #[test]
    fn marks_a_term_in_the_translation_shown_whatever_its_case() {
        let marks = marks_shown(
            "gm-translation",
            "zh-TW,en\n蝙蝠俠,Batman\n",
            translated_segment("蝙蝠俠來了", "BATMAN is here"),
            Some(Language::English),
        );

        assert_eq!(marks.translation, [term_mark(0, 6, "BATMAN")]);
    }

    // @behavior GM-003
    #[test]
    fn marks_a_term_with_no_word_in_another_language() {
        let marks = marks_shown(
            "gm-no-word",
            "zh-TW,en\n阿福,\n",
            crate::test_support::segment(0, 1000, "阿福來了"),
            None,
        );

        assert_eq!(marks.text, [term_mark(0, 2, "阿福")]);
    }

    // @behavior GM-004
    #[test]
    fn marks_the_longer_of_two_overlapping_terms() {
        let marks = marks_shown(
            "gm-overlap",
            "zh-TW,en\n蝙蝠,Bat\n蝙蝠俠,Batman\n",
            crate::test_support::segment(0, 1000, "蝙蝠俠來了"),
            None,
        );

        assert_eq!(marks.text, [term_mark(0, 3, "蝙蝠俠")]);
    }

    // @behavior GM-005
    #[test]
    fn counts_a_mark_in_utf16_units() {
        let marks = marks_shown(
            "gm-utf16",
            "zh-TW,en\n蝙蝠俠,Batman\n",
            crate::test_support::segment(0, 1000, "𠮷蝙蝠俠"),
            None,
        );

        assert_eq!(marks.text, [term_mark(2, 5, "蝙蝠俠")]);
    }

    #[test]
    fn marks_nothing_without_a_translation_glossary() {
        let segments = [crate::test_support::segment(0, 1000, "蝙蝠俠")];

        let marks = segment_glossary_marks(&segments, None, Language::TraditionalChinese, None);

        assert_eq!(marks, [SegmentGlossaryMarks::default()]);
    }
}

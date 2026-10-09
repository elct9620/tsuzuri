//! The Glossary Marks the editor underlines in a Segment's text and in the translation shown: where
//! the Translation Glossary's terms are written, and the proper nouns of the text it does not have.

use std::ops::Range;

use serde::Serialize;

use crate::language::Language;
use crate::proper_nouns::{tagger_by_language, ProperNounTagger};
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

/// What a Glossary Mark stands for; serialized in lowercase, as `term` or `candidate`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum GlossaryMarkKind {
    /// A term of the Translation Glossary.
    Term,
    /// A proper noun the Translation Glossary does not have.
    Candidate,
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
    let glossary_words =
        |language| glossary.map_or_else(Vec::new, |glossary| glossary.words(language));
    let text_words = glossary_words(language);
    let translation_words = translation.map_or_else(Vec::new, glossary_words);
    let tagger = tagger_by_language(language);
    segments
        .iter()
        .map(|segment| SegmentGlossaryMarks {
            text: text_marks(&segment.text, &text_words, tagger),
            translation: segment
                .translation
                .as_deref()
                .map_or_else(Vec::new, |translation| {
                    let terms = term_spans(translation, &translation_words, true);
                    marks(translation, terms, GlossaryMarkKind::Term)
                }),
        })
        .collect()
}

/// The terms `words` in an original `text`, and the proper nouns `tagger` finds outside them.
fn text_marks(
    text: &str,
    words: &[&str],
    tagger: Option<&dyn ProperNounTagger>,
) -> Vec<GlossaryMark> {
    let terms = term_spans(text, words, false);
    let candidates: Vec<Range<usize>> = tagger
        .map_or_else(Vec::new, |tagger| tagger.proper_nouns(text))
        .into_iter()
        .filter(|candidate| terms.iter().all(|term| !is_overlapping(term, candidate)))
        .collect();
    let mut found_marks = marks(text, terms, GlossaryMarkKind::Term);
    found_marks.extend(marks(text, candidates, GlossaryMarkKind::Candidate));
    found_marks.sort_unstable_by_key(|mark| mark.start);
    found_marks
}

/// Where `words` are written in `text`, ignoring case when `is_case_ignored`; of terms that
/// overlap, the longer is kept.
fn term_spans(text: &str, words: &[&str], is_case_ignored: bool) -> Vec<Range<usize>> {
    let mut spans: Vec<Range<usize>> = words
        .iter()
        .flat_map(|word| word_spans(text, word, is_case_ignored))
        .collect();
    // The longest first, so a shorter term inside a longer one is the one left out
    spans.sort_by_key(|span| (std::cmp::Reverse(span.len()), span.start));
    let mut kept_spans: Vec<Range<usize>> = Vec::new();
    for span in spans {
        if kept_spans.iter().all(|kept| !is_overlapping(kept, &span)) {
            kept_spans.push(span);
        }
    }
    kept_spans.sort_unstable_by_key(|span| span.start);
    kept_spans
}

fn is_overlapping(one: &Range<usize>, other: &Range<usize>) -> bool {
    one.start < other.end && other.start < one.end
}

/// A Glossary Mark of `kind` for each byte range of `text` in `spans`.
fn marks(text: &str, spans: Vec<Range<usize>>, kind: GlossaryMarkKind) -> Vec<GlossaryMark> {
    spans
        .into_iter()
        .map(|span| GlossaryMark {
            start: utf16_offset(text, span.start),
            end: utf16_offset(text, span.end),
            word: text[span].to_string(),
            kind,
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
    use crate::project::{CurrentProject, Project};
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
        first_segment_marks(project)
    }

    /// The Glossary Marks `project` shows of its first Segment.
    fn first_segment_marks(project: Project) -> SegmentGlossaryMarks {
        let current = CurrentProject::default();
        current.replace(project);
        current.view().unwrap().glossary_marks()[0].clone()
    }

    /// The Glossary Marks a Project in `language` without `glossary.csv` shows of `segment`,
    /// showing its translation into `translation`.
    fn marks_without_glossary(
        language: Language,
        segment: Segment,
        translation: Option<Language>,
    ) -> SegmentGlossaryMarks {
        let mut project = project_of(vec![segment]);
        project.language = language;
        project.current.as_mut().unwrap().translation = translation;
        first_segment_marks(project)
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

    fn candidate_mark(start: usize, end: usize, word: &str) -> GlossaryMark {
        GlossaryMark {
            kind: GlossaryMarkKind::Candidate,
            ..term_mark(start, end, word)
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
    fn marks_no_term_without_a_translation_glossary() {
        let segments = [crate::test_support::segment(0, 1000, "蝙蝠俠")];

        let marks = segment_glossary_marks(&segments, None, Language::TraditionalChinese, None);

        assert_eq!(marks, [SegmentGlossaryMarks::default()]);
    }

    // @behavior GM-006
    #[test]
    fn marks_proper_nouns_as_candidates() {
        let marks = marks_without_glossary(
            Language::TraditionalChinese,
            crate::test_support::segment(0, 1000, "小林先生明天要去京都"),
            None,
        );

        assert_eq!(
            marks.text,
            [candidate_mark(0, 2, "小林"), candidate_mark(8, 10, "京都")]
        );
    }

    // @behavior GM-007
    #[test]
    fn tags_taiwans_traditional_characters() {
        let marks = marks_without_glossary(
            Language::TraditionalChinese,
            crate::test_support::segment(0, 1000, "今天我們在臺北見到了周杰倫"),
            None,
        );

        assert_eq!(
            marks.text,
            [
                candidate_mark(5, 7, "臺北"),
                candidate_mark(10, 13, "周杰倫")
            ]
        );
    }

    // @behavior GM-008
    #[test]
    fn leaves_a_term_out_of_the_candidates() {
        let marks = marks_shown(
            "gm-term-candidate",
            "zh-TW,en\n京都,Kyoto\n",
            crate::test_support::segment(0, 1000, "小林先生明天要去京都"),
            None,
        );

        assert_eq!(
            marks.text,
            [candidate_mark(0, 2, "小林"), term_mark(8, 10, "京都")]
        );
    }

    // @behavior GM-009
    #[test]
    fn leaves_out_a_proper_noun_of_one_character() {
        let marks = marks_without_glossary(
            Language::TraditionalChinese,
            crate::test_support::segment(0, 1000, "王小明和李大華一起去高雄"),
            None,
        );

        assert!(marks.text.iter().all(|mark| mark.end - mark.start >= 2));
    }

    // @behavior GM-010
    #[test]
    fn finds_no_candidates_in_a_language_without_a_tagger() {
        let marks = marks_without_glossary(
            Language::Japanese,
            crate::test_support::segment(0, 1000, "小林さんは京都へ行きます"),
            None,
        );

        assert_eq!(marks, SegmentGlossaryMarks::default());
    }

    // @behavior GM-011
    #[test]
    fn finds_no_candidates_in_a_translation() {
        let marks = marks_without_glossary(
            Language::English,
            translated_segment("Kobayashi goes to Kyoto", "小林先生明天要去京都"),
            Some(Language::TraditionalChinese),
        );

        assert_eq!(marks.translation, []);
    }
}

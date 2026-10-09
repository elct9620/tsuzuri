//! Where a Translation Glossary term's word is written in a line: as written in an original, and
//! ignoring case in a translation, where a model may capitalise a name at the start of a sentence.
//! Translating checks a term by it, and the editor marks one by it, so both read a term alike.

use std::ops::Range;

/// The byte ranges of `text` that read `word`, ignoring case when `is_case_ignored`.
pub fn word_spans(text: &str, word: &str, is_case_ignored: bool) -> Vec<Range<usize>> {
    if word.is_empty() {
        return Vec::new();
    }
    text.char_indices()
        .filter_map(|(start, _)| {
            let rest = &text[start..];
            let mut rest_chars = rest.char_indices();
            for word_char in word.chars() {
                let (_, text_char) = rest_chars.next()?;
                let is_same = if is_case_ignored {
                    text_char.to_lowercase().eq(word_char.to_lowercase())
                } else {
                    text_char == word_char
                };
                if !is_same {
                    return None;
                }
            }
            let length = rest_chars.next().map_or(rest.len(), |(offset, _)| offset);
            Some(start..start + length)
        })
        .collect()
}

/// Whether `text` reads `word` anywhere, ignoring case when `is_case_ignored`.
pub fn has_word(text: &str, word: &str, is_case_ignored: bool) -> bool {
    !word_spans(text, word, is_case_ignored).is_empty()
}

use std::collections::HashMap;
use std::sync::LazyLock;

use aho_corasick::{AhoCorasick, MatchKind};

const PHRASES: &str = include_str!("../opencc/STPhrases.txt");
const CHARACTERS: &str = include_str!("../opencc/STCharacters.txt");
const TW_VARIANTS: &str = include_str!("../opencc/TWVariants.txt");

/// Built once, off the thread that draws the window, since reading the phrases takes a moment.
static CLEANUP_TABLES: LazyLock<CleanupTables> = LazyLock::new(CleanupTables::from_opencc);

/// Builds the tables a cleanup reads, so the first cleanup does not wait for them.
pub fn load_tables() {
    LazyLock::force(&CLEANUP_TABLES);
}

/// `text` with the Simplified Chinese left in it written in Taiwan's Traditional forms, and how many
/// characters changed; none when nothing did.
pub fn clean_text(text: &str) -> Option<(String, usize)> {
    CLEANUP_TABLES.cleaned_text(text)
}

/// `text` with its characters `start` to `end` cleaned as `clean_text` cleans a text, and how many
/// characters changed; none when nothing did or the text has no such characters.
pub fn clean_range(text: &str, start: usize, end: usize) -> Option<(String, usize)> {
    let byte_at = |at: usize| {
        text.char_indices()
            .map(|(byte, _)| byte)
            .chain([text.len()])
            .nth(at)
    };
    let (start_byte, end_byte) = (byte_at(start)?, byte_at(end)?);
    if start_byte > end_byte {
        return None;
    }
    let (cleaned_range, changed_count) = clean_text(&text[start_byte..end_byte])?;
    let cleaned_text = [&text[..start_byte], &cleaned_range, &text[end_byte..]].concat();
    Some((cleaned_text, changed_count))
}

/// OpenCC's tables as Simplified Cleanup reads them, see `opencc/README.md`.
struct CleanupTables {
    phrases: AhoCorasick,
    /// The Traditional form of each phrase, by the phrase's pattern index.
    phrase_forms: Vec<String>,
    /// The Traditional form of a character outside every phrase, Taiwan's variant included.
    character_forms: HashMap<char, char>,
}

impl CleanupTables {
    fn from_opencc() -> CleanupTables {
        let variants: HashMap<char, char> = single_characters(TW_VARIANTS).collect();
        let variant_of = |character: char| *variants.get(&character).unwrap_or(&character);

        let mut character_forms: HashMap<char, char> = single_characters(CHARACTERS)
            .map(|(simplified, traditional)| (simplified, variant_of(traditional)))
            .collect();
        for (character, variant) in &variants {
            character_forms.entry(*character).or_insert(*variant);
        }

        let (patterns, phrase_forms): (Vec<&str>, Vec<String>) = dictionary_entries(PHRASES)
            .map(|entry| {
                let form: String = entry.first_candidate.chars().map(variant_of).collect();
                (entry.key, form_keeping_tai(entry.key, form))
            })
            .unzip();
        let phrases = AhoCorasick::builder()
            .match_kind(MatchKind::LeftmostLongest)
            .build(patterns)
            .expect("OpenCC phrases build an automaton");

        CleanupTables {
            phrases,
            phrase_forms,
            character_forms,
        }
    }

    fn cleaned_text(&self, text: &str) -> Option<(String, usize)> {
        let mut cleaned_text = String::with_capacity(text.len());
        let mut changed_count = 0;
        let mut unmatched_start = 0;
        for phrase in self.phrases.find_iter(text) {
            changed_count +=
                self.push_characters(&text[unmatched_start..phrase.start()], &mut cleaned_text);
            let form = &self.phrase_forms[phrase.pattern().as_usize()];
            changed_count += changed_character_count(&text[phrase.range()], form);
            cleaned_text.push_str(form);
            unmatched_start = phrase.end();
        }
        changed_count += self.push_characters(&text[unmatched_start..], &mut cleaned_text);
        (changed_count > 0).then_some((cleaned_text, changed_count))
    }

    /// Pushes each character of `text` in its Traditional form, answering how many changed.
    fn push_characters(&self, text: &str, cleaned_text: &mut String) -> usize {
        let mut changed_count = 0;
        for character in text.chars() {
            let form = *self.character_forms.get(&character).unwrap_or(&character);
            if form != character {
                changed_count += 1;
            }
            cleaned_text.push(form);
        }
        changed_count
    }
}

/// One line of an OpenCC dictionary: a key and the first of its candidates.
struct DictionaryEntry<'a> {
    key: &'a str,
    first_candidate: &'a str,
    /// Whether the key is among its own candidates, which makes it a Traditional form too.
    is_traditional_too: bool,
}

fn dictionary_entries(dictionary: &str) -> impl Iterator<Item = DictionaryEntry<'_>> {
    dictionary.lines().filter_map(|line| {
        let line = line.trim_end();
        if line.starts_with('#') {
            return None;
        }
        let (key, candidates) = line.split_once('\t')?;
        let mut candidates = candidates
            .split(' ')
            .filter(|candidate| !candidate.is_empty());
        let first_candidate = candidates.next()?;
        let is_traditional_too =
            first_candidate == key || candidates.any(|candidate| candidate == key);
        Some(DictionaryEntry {
            key,
            first_candidate,
            is_traditional_too,
        })
    })
}

/// The one-character entries a character alone may take, leaving out those whose key is a
/// Traditional form too, since the character alone cannot tell which reading it has.
fn single_characters(dictionary: &str) -> impl Iterator<Item = (char, char)> + '_ {
    dictionary_entries(dictionary)
        .filter(|entry| !entry.is_traditional_too)
        .filter_map(|entry| {
            Some((
                sole_character(entry.key)?,
                sole_character(entry.first_candidate)?,
            ))
        })
}

fn sole_character(text: &str) -> Option<char> {
    let mut characters = text.chars();
    let character = characters.next()?;
    characters.next().is_none().then_some(character)
}

/// `form` with 台 wherever `phrase` writes 台 and OpenCC writes 臺, as Taiwan writes both.
fn form_keeping_tai(phrase: &str, form: String) -> String {
    if phrase.chars().count() != form.chars().count() {
        return form;
    }
    phrase
        .chars()
        .zip(form.chars())
        .map(|(written, traditional)| match (written, traditional) {
            ('台', '臺') => '台',
            _ => traditional,
        })
        .collect()
}

fn changed_character_count(text: &str, form: &str) -> usize {
    if text.chars().count() != form.chars().count() {
        return form.chars().count();
    }
    text.chars()
        .zip(form.chars())
        .filter(|(written, traditional)| written != traditional)
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_after_cleanup(text: &str) -> String {
        clean_text(text).map_or_else(|| text.to_string(), |(cleaned_text, _)| cleaned_text)
    }

    // @behavior SC-001
    #[test]
    fn cleans_simplified_characters() {
        assert_eq!(
            clean_text("这是简单的测试"),
            Some(("這是簡單的測試".to_string(), 5))
        );
    }

    // @behavior SC-002
    #[test]
    fn settles_a_reading_by_its_phrase() {
        assert_eq!(text_after_cleanup("头发以后再说"), "頭髮以後再說");
    }

    // @behavior SC-003
    #[test]
    fn leaves_a_character_that_is_traditional_too() {
        assert_eq!(clean_text("皇后"), None);
        assert_eq!(clean_text("后"), None);
    }

    // @behavior SC-004
    #[test]
    fn keeps_tai_as_taiwan_writes_it() {
        assert_eq!(text_after_cleanup("台湾的台风"), "台灣的颱風");
    }

    // @behavior SC-005
    #[test]
    fn writes_the_taiwan_variant() {
        assert_eq!(text_after_cleanup("里面"), "裡面");
    }

    // @behavior SC-006
    #[test]
    fn leaves_traditional_chinese_as_written() {
        assert_eq!(clean_text("台北的天氣很好，我們以後再說。"), None);
    }

    #[test]
    fn cleans_only_the_range_asked_for() {
        assert_eq!(
            clean_range("这是测试", 2, 4),
            Some(("这是測試".to_string(), 2))
        );
    }

    #[test]
    fn answers_none_for_a_range_the_text_does_not_have() {
        assert_eq!(clean_range("这是", 1, 5), None);
        assert_eq!(clean_range("这是", 2, 1), None);
    }

    #[test]
    fn reads_a_dictionary_checked_out_with_crlf() {
        let entries: Vec<_> = dictionary_entries("# comment\r\n发\t發 髮\r\n").collect();

        assert_eq!(
            entries
                .iter()
                .map(|entry| (entry.key, entry.first_candidate))
                .collect::<Vec<_>>(),
            vec![("发", "發")]
        );
    }
}

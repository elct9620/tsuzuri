//! The proper nouns in a line — people, places, organisations and other names — which the editor
//! offers as Glossary Mark candidates. A Language is tagged word by word by a tagger of its own;
//! only Chinese has one for now.

use std::collections::HashMap;
use std::ops::Range;
use std::sync::{LazyLock, Mutex};

use jieba_rs::Jieba;

use crate::cleanup::simplified_forms;
use crate::language::Language;

/// The part-of-speech tags jieba gives a person, a place, an organisation and any other name.
const PROPER_NOUN_TAGS: [&str; 4] = ["nr", "ns", "nt", "nz"];
/// How many lines a tagger remembers before it starts over, so a long session does not grow without end.
const REMEMBERED_LINE_LIMIT: usize = 20_000;

/// Finds the proper nouns of one Language.
pub trait ProperNounTagger: Send + Sync {
    /// The byte ranges of `text` naming a proper noun of two characters or more; a single
    /// character tagged as a name is more often a misreading than a name.
    fn proper_nouns(&self, text: &str) -> Vec<Range<usize>>;
}

/// Built once, off the thread that draws the window, since reading jieba's dictionary takes a moment.
static CHINESE_TAGGER: LazyLock<ChineseTagger> = LazyLock::new(ChineseTagger::new);

/// The tagger of `language`, or none for a Language Tsuzuri cannot tag word by word.
pub fn tagger_by_language(language: Language) -> Option<&'static dyn ProperNounTagger> {
    match language {
        Language::TraditionalChinese => Some(&*CHINESE_TAGGER),
        Language::English | Language::Japanese => None,
    }
}

/// Builds the taggers, so the first Project shown does not wait for them.
pub fn load_taggers() {
    LazyLock::force(&CHINESE_TAGGER);
}

/// Tags Chinese with jieba, whose dictionary is Simplified: each character is read in its
/// Simplified form, which keeps every word where it stands in the text.
struct ChineseTagger {
    jieba: Jieba,
    simplified_forms: HashMap<char, char>,
    /// The proper nouns of each line tagged so far, so only a line whose text changed is tagged again.
    remembered_lines: Mutex<HashMap<String, Vec<Range<usize>>>>,
}

impl ChineseTagger {
    fn new() -> ChineseTagger {
        ChineseTagger {
            jieba: Jieba::new(),
            simplified_forms: simplified_forms(),
            remembered_lines: Mutex::new(HashMap::new()),
        }
    }

    fn tagged_proper_nouns(&self, text: &str) -> Vec<Range<usize>> {
        let simplified: String = text
            .chars()
            .map(|character| *self.simplified_forms.get(&character).unwrap_or(&character))
            .collect();
        // jieba counts in characters; the byte where each character of `text` starts, and its end
        let byte_starts: Vec<usize> = text
            .char_indices()
            .map(|(start, _)| start)
            .chain([text.len()])
            .collect();
        self.jieba
            .tag(&simplified, true)
            .into_iter()
            .filter(|tag| PROPER_NOUN_TAGS.contains(&tag.tag) && tag.end - tag.start >= 2)
            .map(|tag| byte_starts[tag.start]..byte_starts[tag.end])
            .collect()
    }
}

impl ProperNounTagger for ChineseTagger {
    fn proper_nouns(&self, text: &str) -> Vec<Range<usize>> {
        let mut remembered_lines = self
            .remembered_lines
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(proper_nouns) = remembered_lines.get(text) {
            return proper_nouns.clone();
        }
        if remembered_lines.len() >= REMEMBERED_LINE_LIMIT {
            remembered_lines.clear();
        }
        let proper_nouns = self.tagged_proper_nouns(text);
        remembered_lines.insert(text.to_string(), proper_nouns.clone());
        proper_nouns
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_a_line_again_only_once_its_text_changes() {
        let tagger = ChineseTagger::new();
        tagger.proper_nouns("小林先生明天要去京都");

        tagger.proper_nouns("小林先生明天要去京都");

        assert_eq!(tagger.remembered_lines.lock().unwrap().len(), 1);
    }
}

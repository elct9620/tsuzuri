use regex::{NoExpand, Regex};
use serde::Deserialize;

/// What to look for in a text and what to put in its place. Rust reads the pattern, so a regular
/// expression means the same whatever the webview's engine would make of it.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Replacement {
    pub pattern: String,
    /// Put in place of each match; groups of a regular expression are named as `$1` or `${name}`.
    pub substitute: String,
    /// Whether `pattern` is a regular expression rather than text taken as written.
    pub is_regex: bool,
}

/// Why a Replacement cannot be made: its pattern is empty or is not a regular expression.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReplacementError {
    InvalidPattern { detail: String },
}

/// A Replacement ready to apply to one text after another.
pub struct Replacer<'a> {
    matcher: Regex,
    replacement: &'a Replacement,
}

impl<'a> Replacer<'a> {
    pub fn try_new(replacement: &'a Replacement) -> Result<Replacer<'a>, ReplacementError> {
        let invalid_pattern = |detail: String| ReplacementError::InvalidPattern { detail };
        if replacement.pattern.is_empty() {
            return Err(invalid_pattern("nothing to find".to_string()));
        }
        let pattern = if replacement.is_regex {
            replacement.pattern.clone()
        } else {
            regex::escape(&replacement.pattern)
        };
        let matcher = Regex::new(&pattern).map_err(|error| invalid_pattern(error.to_string()))?;
        Ok(Replacer {
            matcher,
            replacement,
        })
    }

    /// `text` with every match replaced, and how many there were; none when nothing matches.
    pub fn replace_matches(&self, text: &str) -> Option<(String, usize)> {
        let count = self.matcher.find_iter(text).count();
        if count == 0 {
            return None;
        }
        let substitute = self.replacement.substitute.as_str();
        let replaced_text = if self.replacement.is_regex {
            self.matcher.replace_all(text, substitute)
        } else {
            self.matcher.replace_all(text, NoExpand(substitute))
        };
        Some((replaced_text.into_owned(), count))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replacement(pattern: &str, substitute: &str, is_regex: bool) -> Replacement {
        Replacement {
            pattern: pattern.to_string(),
            substitute: substitute.to_string(),
            is_regex,
        }
    }

    fn replace_matches(replacement: &Replacement, text: &str) -> Option<(String, usize)> {
        Replacer::try_new(replacement)
            .unwrap()
            .replace_matches(text)
    }

    // @behavior ED-080
    #[test]
    fn removes_a_text_replaced_with_nothing() {
        let removal = replacement("。", "", false);

        assert_eq!(
            replace_matches(&removal, "你好。"),
            Some(("你好".to_string(), 1))
        );
        assert_eq!(
            replace_matches(&removal, "再見。"),
            Some(("再見".to_string(), 1))
        );
    }

    // @behavior ED-081
    #[test]
    fn takes_a_pattern_as_written_unless_it_is_a_regular_expression() {
        let as_written = replacement(".", "。", false);

        assert_eq!(
            replace_matches(&as_written, "真的?好."),
            Some(("真的?好。".to_string(), 1))
        );
    }

    #[test]
    fn keeps_a_dollar_in_a_substitute_taken_as_written() {
        let as_written = replacement("元", "$1", false);

        assert_eq!(
            replace_matches(&as_written, "5元"),
            Some(("5$1".to_string(), 1))
        );
    }

    // @behavior ED-082
    #[test]
    fn replaces_by_a_regular_expression_with_its_groups() {
        let episodes = replacement(r"第(\d+)集", "EP${1}", true);

        assert_eq!(
            replace_matches(&episodes, "第1集 第12集"),
            Some(("EP1 EP12".to_string(), 2))
        );
    }

    #[test]
    fn refuses_a_regular_expression_that_cannot_be_read() {
        assert!(Replacer::try_new(&replacement("(", "", true)).is_err());
    }

    #[test]
    fn refuses_an_empty_pattern() {
        assert!(Replacer::try_new(&replacement("", "x", false)).is_err());
    }

    #[test]
    fn answers_none_when_nothing_matches() {
        assert_eq!(replace_matches(&replacement("。", "", false), "你好"), None);
    }
}

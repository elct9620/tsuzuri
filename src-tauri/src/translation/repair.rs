use std::collections::{BTreeMap, HashMap, HashSet};

use super::model::{AnswerError, BatchRequest, TranslationModel};
use super::TranslationSettings;
use crate::failure::Failure;
use crate::language::{Language, LanguagePair};

/// Source lines of the preceding text a repair request shows the Model.
const PRECEDING_LINES: usize = 2;

/// Translates one Batch, repairing what the Model gets wrong: a group of lines still failing after
/// its retries is split in half until each line stands alone, and a lone line that still fails
/// keeps its best imperfect translation, or else its original text.
pub async fn translate_batch(
    model: &TranslationModel,
    languages: LanguagePair,
    lines: &[(usize, &str)],
    prior: &[(String, String)],
    settings: &TranslationSettings,
) -> Result<HashMap<usize, String>, Failure> {
    let mut repair = BatchRepair {
        model,
        languages,
        lines,
        prior,
        settings,
        accepted: HashMap::new(),
        imperfect: HashMap::new(),
    };
    let reference = &prior[prior.len().saturating_sub(settings.reference_lines)..];
    let failing = repair.attempt(lines, reference.to_vec(), None).await?;
    let mut groups: Vec<Vec<(usize, &str)>> = vec![lines
        .iter()
        .filter(|(index, _)| failing.contains_key(index))
        .copied()
        .collect()];
    while let Some(group) = groups.pop() {
        if group.is_empty() {
            continue;
        }
        let reference = repair.surrounding_lines(&group);
        let preceding = repair.preceding_text(&group);
        let failing = repair.attempt(&group, reference, preceding).await?;
        let still_failing: Vec<(usize, &str)> = group
            .into_iter()
            .filter(|(index, _)| failing.contains_key(index))
            .collect();
        match still_failing.as_slice() {
            [] => {}
            [(index, text)] => repair.give_up(*index, text, &failing[index]),
            _ => {
                let (first, second) = still_failing.split_at(still_failing.len() / 2);
                groups.push(second.to_vec());
                groups.push(first.to_vec());
            }
        }
    }
    Ok(repair.accepted)
}

struct BatchRepair<'a> {
    model: &'a TranslationModel,
    languages: LanguagePair,
    lines: &'a [(usize, &'a str)],
    prior: &'a [(String, String)],
    settings: &'a TranslationSettings,
    accepted: HashMap<usize, String>,
    /// The latest translation of a line that is valid but imperfect, kept in case nothing better comes.
    imperfect: HashMap<usize, String>,
}

impl BatchRepair<'_> {
    /// Asks for `group` up to the retry limit, each retry naming what to fix; answers the lines
    /// still unresolved with why.
    async fn attempt(
        &mut self,
        group: &[(usize, &str)],
        reference: Vec<(String, String)>,
        preceding: Option<String>,
    ) -> Result<BTreeMap<usize, String>, Failure> {
        let wanted: HashSet<usize> = group.iter().map(|(index, _)| *index).collect();
        let mut correction = None;
        let mut reasons = BTreeMap::new();
        for _ in 0..self.settings.retries {
            let answer = self
                .model
                .translate_batch(&BatchRequest {
                    languages: self.languages,
                    lines: group.to_vec(),
                    reference: &reference,
                    preceding: preceding.clone(),
                    correction: correction.take(),
                })
                .await;
            let got: BTreeMap<usize, String> = match answer {
                Ok(got) => got
                    .into_iter()
                    .filter(|(index, text)| wanted.contains(index) && !text.trim().is_empty())
                    .collect(),
                Err(AnswerError::Malformed(detail)) => {
                    correction = Some(format!(
                        "previous attempt failed to parse ({detail}); return valid JSON only."
                    ));
                    reasons = self.unresolved(group, "response failed to parse");
                    continue;
                }
                Err(AnswerError::Request(failure)) => return Err(failure),
            };
            let verdicts = judge(&got, group, self.languages);
            reasons = self.unresolved(group, "missing from response");
            for (index, verdict) in verdicts {
                match verdict {
                    Verdict::Accepted => {
                        self.accepted.insert(index, got[&index].clone());
                        reasons.remove(&index);
                    }
                    Verdict::Broken(reason) => {
                        if !self.accepted.contains_key(&index) {
                            reasons.insert(index, reason);
                        }
                    }
                    Verdict::Imperfect(reason) => {
                        self.imperfect.insert(index, got[&index].clone());
                        if !self.accepted.contains_key(&index) {
                            reasons.insert(index, reason);
                        }
                    }
                }
            }
            if reasons.is_empty() {
                return Ok(reasons);
            }
            let fixes: Vec<String> = reasons
                .iter()
                .map(|(index, reason)| format!("- index {index}: {reason}"))
                .collect();
            correction = Some(format!("Fix these lines:\n{}", fixes.join("\n")));
        }
        Ok(reasons)
    }

    fn unresolved(&self, group: &[(usize, &str)], reason: &str) -> BTreeMap<usize, String> {
        group
            .iter()
            .filter(|(index, _)| !self.accepted.contains_key(index))
            .map(|(index, _)| (*index, reason.to_string()))
            .collect()
    }

    /// Keeps the best imperfect translation of a line that could not be repaired, or else its original text.
    fn give_up(&mut self, index: usize, text: &str, reason: &str) {
        match self.imperfect.remove(&index) {
            Some(imperfect) => {
                log::warn!("line {index} kept without full compliance ({reason})");
                self.accepted.insert(index, imperfect);
            }
            None => {
                log::warn!(
                    "line {index} failed after repair ({reason}), keeping its original text"
                );
                self.accepted.insert(index, text.to_string());
            }
        }
    }

    /// Up to the reference line count of accepted lines on each side of `group`, falling back to
    /// the lines translated before this Batch when too few precede it.
    fn surrounding_lines(&self, group: &[(usize, &str)]) -> Vec<(String, String)> {
        let window = self.settings.reference_lines;
        let (first, last) = self.bounds(group);
        let accepted_pair = |(index, text): &(usize, &str)| {
            self.accepted
                .get(index)
                .map(|translation| (text.to_string(), translation.clone()))
        };
        let mut before: Vec<_> = self.lines[..first]
            .iter()
            .rev()
            .filter_map(accepted_pair)
            .take(window)
            .collect();
        before.reverse();
        let needed = window - before.len();
        let mut reference: Vec<_> = self.prior[self.prior.len().saturating_sub(needed)..].to_vec();
        reference.extend(before);
        reference.extend(
            self.lines[last + 1..]
                .iter()
                .filter_map(accepted_pair)
                .take(window),
        );
        reference
    }

    /// The source text just before `group`, whose sentence the group may continue.
    fn preceding_text(&self, group: &[(usize, &str)]) -> Option<String> {
        let (first, _) = self.bounds(group);
        let texts: Vec<&str> = if first > 0 {
            self.lines[first.saturating_sub(PRECEDING_LINES)..first]
                .iter()
                .map(|(_, text)| *text)
                .collect()
        } else {
            self.prior[self.prior.len().saturating_sub(PRECEDING_LINES)..]
                .iter()
                .map(|(source, _)| source.as_str())
                .collect()
        };
        (!texts.is_empty()).then(|| texts.join(" "))
    }

    /// Where `group` starts and ends among the Batch's lines.
    fn bounds(&self, group: &[(usize, &str)]) -> (usize, usize) {
        let position = |wanted: usize| {
            self.lines
                .iter()
                .position(|(index, _)| *index == wanted)
                .unwrap_or(0)
        };
        let first = group.iter().map(|(index, _)| position(*index)).min();
        let last = group.iter().map(|(index, _)| position(*index)).max();
        (first.unwrap_or(0), last.unwrap_or(0))
    }
}

enum Verdict {
    Accepted,
    /// Wrong beyond keeping: the line falls back to its original text if never repaired.
    Broken(String),
    /// Usable but imperfect: the translation is kept if nothing better comes.
    Imperfect(String),
}

/// Judges each translation the Model answered against its source line.
fn judge(
    got: &BTreeMap<usize, String>,
    group: &[(usize, &str)],
    languages: LanguagePair,
) -> Vec<(usize, Verdict)> {
    let sources: HashMap<usize, &str> = group.iter().copied().collect();
    let duplicated = duplicated_lines(got, &sources);
    let checks_leftover_source = languages.target == Language::English;
    let checks_negation =
        languages.source == Language::TraditionalChinese && languages.target == Language::English;
    got.iter()
        .map(|(index, text)| {
            let source = sources.get(index).copied().unwrap_or_default();
            let verdict = if duplicated.contains(index) {
                Verdict::Broken("duplicate of another line's translation".to_string())
            } else if is_placeholder(text) {
                Verdict::Broken(
                    "looks like a placeholder or meta-comment, not a translation".to_string(),
                )
            } else if checks_leftover_source && has_han(source) && has_han(text) {
                Verdict::Broken(
                    "still contains untranslated source-language characters".to_string(),
                )
            } else if checks_negation && has_chinese_negation(source) && !has_english_negation(text)
            {
                Verdict::Imperfect(
                    "source contains a negation that seems to be missing from the translation"
                        .to_string(),
                )
            } else {
                Verdict::Accepted
            };
            (*index, verdict)
        })
        .collect()
}

/// Lines whose translation matches another line's although their sources differ: the Model
/// likely collapsed distinct content into one. A repeated source line, like a refrain, may
/// rightly repeat its translation.
fn duplicated_lines(
    got: &BTreeMap<usize, String>,
    sources: &HashMap<usize, &str>,
) -> HashSet<usize> {
    let mut first_by_text: HashMap<String, usize> = HashMap::new();
    let mut duplicated = HashSet::new();
    for (index, text) in got {
        let key = text.trim().to_lowercase();
        if key.chars().count() <= 5 {
            continue;
        }
        match first_by_text.get(&key) {
            Some(&other) => {
                let source = |line: usize| sources.get(&line).map(|text| text.trim());
                if source(*index) != source(other) {
                    duplicated.insert(*index);
                    duplicated.insert(other);
                }
            }
            None => {
                first_by_text.insert(key, *index);
            }
        }
    }
    duplicated
}

fn is_placeholder(text: &str) -> bool {
    let text = text.trim();
    text.chars().count() > 2
        && [('[', ']'), ('(', ')'), ('*', '*')]
            .iter()
            .any(|(open, close)| text.starts_with(*open) && text.ends_with(*close))
}

/// CJK Unified Ideographs and Extension A.
fn has_han(text: &str) -> bool {
    text.chars().any(|ch| {
        ('\u{4E00}'..='\u{9FFF}').contains(&ch) || ('\u{3400}'..='\u{4DBF}').contains(&ch)
    })
}

const CHINESE_NEGATIONS: [&str; 8] = ["不", "沒", "未", "別", "無", "莫", "難道", "豈"];
/// Words holding a negation character without negating anything; best-effort, not exhaustive.
const CHINESE_NON_NEGATIONS: [&str; 33] = [
    "不過",
    "不僅",
    "不但",
    "不管",
    "不然",
    "不錯",
    "不安",
    "不同",
    "不必",
    "不用",
    "不禁",
    "不妨",
    "不足",
    "不少",
    "不再",
    "特別",
    "分別",
    "差別",
    "告別",
    "識別",
    "個別",
    "別人",
    "別的",
    "別處",
    "區別",
    "無聊",
    "無論",
    "無比",
    "無數",
    "無奈",
    "未來",
    "沒事",
    "沒關係",
];
const ENGLISH_NEGATIONS: [&str; 10] = [
    " not ",
    "n't",
    " no ",
    " never ",
    " without ",
    " nothing ",
    " none ",
    " neither ",
    " lack ",
    " lacking ",
];
/// Whole words only: `un`, `im`, `in` or `dis` as prefixes would match inside, image or distance.
const ENGLISH_NEGATED_WORDS: [&str; 12] = [
    "unrealistic",
    "impossible",
    "unlikely",
    "untrue",
    "unable",
    "incorrect",
    "disagree",
    "nonexistent",
    "invisible",
    "inaccurate",
    "insufficient",
    "irrelevant",
];

fn has_chinese_negation(text: &str) -> bool {
    let stripped = CHINESE_NON_NEGATIONS
        .iter()
        .fold(text.to_string(), |text, word| text.replace(word, ""));
    CHINESE_NEGATIONS
        .iter()
        .any(|marker| stripped.contains(marker))
}

fn has_english_negation(text: &str) -> bool {
    let padded = format!(" {} ", text.to_lowercase());
    ENGLISH_NEGATIONS
        .iter()
        .any(|marker| padded.contains(marker))
        || padded.split_whitespace().any(|word| {
            ENGLISH_NEGATED_WORDS.contains(&word.trim_matches(|ch: char| ".,!?;:\"'".contains(ch)))
        })
}

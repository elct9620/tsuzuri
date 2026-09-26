use std::collections::{BTreeMap, HashMap, HashSet};

use super::llama::{AnswerError, TranslationModel};
use super::prompt::{BatchRequest, ReviewItem};
use super::TranslationJob;
use crate::failure::Failure;
use crate::language::{Language, LanguagePair};

/// Source lines of the preceding text a repair request shows the Model.
const PRECEDING_LINES: usize = 2;
/// Lines one Self-Review request asks about; a small Model judges a couple at a time far more reliably.
const LINES_PER_REVIEW: usize = 2;

/// Translates one Batch, repairing what the Model gets wrong: a group of lines still failing after
/// its retries is split in half until each line stands alone, and a lone line that still fails
/// keeps its best imperfect translation, or else its original text.
pub async fn translate_batch(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    lines: &[(usize, &str)],
    earlier_pairs: &[(String, String)],
    summary: Option<&str>,
    following: Option<&str>,
) -> Result<HashMap<usize, String>, Failure> {
    let mut repair = BatchRepair {
        model,
        job,
        lines,
        earlier_pairs,
        summary,
        following,
        accepted_translations: HashMap::new(),
        imperfect_translations: HashMap::new(),
    };
    let reference = &earlier_pairs[earlier_pairs
        .len()
        .saturating_sub(job.settings.reference_lines)..];
    let mut failing_reasons = repair.attempt(lines, reference.to_vec(), None).await?;
    failing_reasons.extend(repair.review(lines).await?);
    let mut groups: Vec<Vec<(usize, &str)>> = vec![lines
        .iter()
        .filter(|(index, _)| failing_reasons.contains_key(index))
        .copied()
        .collect()];
    while let Some(group) = groups.pop() {
        if group.is_empty() {
            continue;
        }
        let reference = repair.surrounding_lines(&group);
        let preceding_text = repair.preceding_text(&group);
        let mut failing_reasons = repair.attempt(&group, reference, preceding_text).await?;
        failing_reasons.extend(repair.review(&group).await?);
        let lines_still_failing: Vec<(usize, &str)> = group
            .into_iter()
            .filter(|(index, _)| failing_reasons.contains_key(index))
            .collect();
        match lines_still_failing.as_slice() {
            [] => {}
            [(index, text)] => repair.give_up(*index, text, &failing_reasons[index]),
            _ => {
                let (first, second) = lines_still_failing.split_at(lines_still_failing.len() / 2);
                groups.push(second.to_vec());
                groups.push(first.to_vec());
            }
        }
    }
    Ok(repair.accepted_translations)
}

struct BatchRepair<'a> {
    model: &'a TranslationModel,
    job: &'a TranslationJob<'a>,
    lines: &'a [(usize, &'a str)],
    earlier_pairs: &'a [(String, String)],
    summary: Option<&'a str>,
    /// The source text after the Batch, shown with every request for it.
    following: Option<&'a str>,
    accepted_translations: HashMap<usize, String>,
    /// The latest translation of a line that is valid but imperfect, kept in case nothing better comes.
    imperfect_translations: HashMap<usize, String>,
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
        let wanted_indices: HashSet<usize> = group.iter().map(|(index, _)| *index).collect();
        let used_terms = used_terms(self.job.glossary_terms, group);
        let mut correction = None;
        let mut reasons = BTreeMap::new();
        for _ in 0..self.job.settings.retries {
            let answer = self
                .model
                .translate_batch(&BatchRequest {
                    languages: self.job.languages,
                    summary: self.summary,
                    lines: group.to_vec(),
                    reference: &reference,
                    preceding: preceding.clone(),
                    following: self.following.map(str::to_string),
                    glossary_terms: &used_terms,
                    correction: correction.take(),
                })
                .await;
            let translations: BTreeMap<usize, String> = match answer {
                Ok(translations) => translations
                    .into_iter()
                    .filter(|(index, text)| {
                        wanted_indices.contains(index) && !text.trim().is_empty()
                    })
                    .collect(),
                Err(AnswerError::MalformedAnswer(detail)) => {
                    correction = Some(format!(
                        "previous attempt failed to parse ({detail}); return valid JSON only."
                    ));
                    reasons = self.unresolved_reasons(group, "response failed to parse");
                    continue;
                }
                Err(AnswerError::FailedRequest(failure)) => return Err(failure),
            };
            let verdicts = judge(&translations, group, self.job.languages, &used_terms);
            reasons = self.unresolved_reasons(group, "missing from response");
            for (index, verdict) in verdicts {
                match verdict {
                    Verdict::Pass => {
                        self.accepted_translations
                            .insert(index, translations[&index].clone());
                        reasons.remove(&index);
                    }
                    Verdict::Fault(reason) => {
                        if !self.accepted_translations.contains_key(&index) {
                            reasons.insert(index, reason);
                        }
                    }
                    Verdict::Flaw(reason) => {
                        self.imperfect_translations
                            .insert(index, translations[&index].clone());
                        if !self.accepted_translations.contains_key(&index) {
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

    /// Asks the Model, a couple of lines at a time, whether each accepted translation in `group`
    /// belongs to its own line when Self-Review is on; one it places on another line becomes a
    /// flaw to repair. A review the Model cannot answer is skipped.
    async fn review(
        &mut self,
        group: &[(usize, &str)],
    ) -> Result<BTreeMap<usize, String>, Failure> {
        let mut misplaced_reasons = BTreeMap::new();
        if !self.job.has_self_review {
            return Ok(misplaced_reasons);
        }
        let accepted_lines: Vec<(usize, &str)> = group
            .iter()
            .filter(|(index, _)| self.accepted_translations.contains_key(index))
            .copied()
            .collect();
        for chunk in accepted_lines.chunks(LINES_PER_REVIEW) {
            let items: Vec<ReviewItem> = chunk
                .iter()
                .map(|(index, source)| self.review_item(*index, source))
                .collect();
            let placements = match self
                .model
                .review_translations(self.job.languages, &items)
                .await
            {
                Ok(placements) => placements,
                Err(AnswerError::MalformedAnswer(detail)) => {
                    log::warn!("skipped a self-review that could not be read: {detail}");
                    continue;
                }
                Err(AnswerError::FailedRequest(failure)) => return Err(failure),
            };
            for (index, placed_line) in placements {
                if placed_line == index || !chunk.iter().any(|(line, _)| *line == index) {
                    continue;
                }
                if let Some(translation) = self.accepted_translations.remove(&index) {
                    self.imperfect_translations.insert(index, translation);
                    misplaced_reasons.insert(
                        index,
                        format!(
                            "verifier: translation content seems to belong to line {placed_line} instead"
                        ),
                    );
                }
            }
        }
        Ok(misplaced_reasons)
    }

    /// The accepted translation of line `index`, with the source text of the Batch's lines beside it.
    fn review_item<'b>(&'b self, index: usize, source: &'b str) -> ReviewItem<'b> {
        let position = self.bounds(&[(index, source)]).0;
        let neighbour = |at: Option<usize>| at.and_then(|at| self.lines.get(at)).copied();
        ReviewItem {
            index,
            source,
            translation: &self.accepted_translations[&index],
            previous_line: neighbour(position.checked_sub(1)),
            next_line: neighbour(Some(position + 1)),
        }
    }

    fn unresolved_reasons(&self, group: &[(usize, &str)], reason: &str) -> BTreeMap<usize, String> {
        group
            .iter()
            .filter(|(index, _)| !self.accepted_translations.contains_key(index))
            .map(|(index, _)| (*index, reason.to_string()))
            .collect()
    }

    /// Keeps the best imperfect translation of a line that could not be repaired, or else its original text.
    fn give_up(&mut self, index: usize, text: &str, reason: &str) {
        match self.imperfect_translations.remove(&index) {
            Some(imperfect) => {
                log::warn!("line {index} kept without full compliance ({reason})");
                self.accepted_translations.insert(index, imperfect);
            }
            None => {
                log::warn!(
                    "line {index} failed after repair ({reason}), keeping its original text"
                );
                self.accepted_translations.insert(index, text.to_string());
            }
        }
    }

    /// Up to the reference line count of accepted lines on each side of `group`, falling back to
    /// the lines translated before this Batch when too few precede it.
    fn surrounding_lines(&self, group: &[(usize, &str)]) -> Vec<(String, String)> {
        let window = self.job.settings.reference_lines;
        let (first, last) = self.bounds(group);
        let accepted_pair = |(index, text): &(usize, &str)| {
            self.accepted_translations
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
        let needed_pairs = window - before.len();
        let mut reference: Vec<_> =
            self.earlier_pairs[self.earlier_pairs.len().saturating_sub(needed_pairs)..].to_vec();
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
            self.earlier_pairs[self.earlier_pairs.len().saturating_sub(PRECEDING_LINES)..]
                .iter()
                .map(|(source, _)| source.as_str())
                .collect()
        };
        (!texts.is_empty()).then(|| texts.join(" "))
    }

    /// Where `group` starts and ends among the Batch's lines.
    fn bounds(&self, group: &[(usize, &str)]) -> (usize, usize) {
        let position = |wanted_indices: usize| {
            self.lines
                .iter()
                .position(|(index, _)| *index == wanted_indices)
                .unwrap_or(0)
        };
        let first = group.iter().map(|(index, _)| position(*index)).min();
        let last = group.iter().map(|(index, _)| position(*index)).max();
        (first.unwrap_or(0), last.unwrap_or(0))
    }
}

/// What a translation is judged to be.
enum Verdict {
    /// Kept as the line's translation.
    Pass,
    /// Wrong beyond keeping: the line falls back to its original text if never repaired.
    Fault(String),
    /// Usable but imperfect: the translation is kept if nothing better comes.
    Flaw(String),
}

/// Judges each translation the Model answered against its source line.
fn judge(
    translations: &BTreeMap<usize, String>,
    group: &[(usize, &str)],
    languages: LanguagePair,
    glossary_terms: &[(String, String)],
) -> Vec<(usize, Verdict)> {
    let sources: HashMap<usize, &str> = group.iter().copied().collect();
    let duplicates = duplicated_lines(translations, &sources);
    let is_leftover_source_checked = languages.target == Language::English;
    let is_negation_checked =
        languages.source == Language::TraditionalChinese && languages.target == Language::English;
    translations
        .iter()
        .map(|(index, text)| {
            let source = sources.get(index).copied().unwrap_or_default();
            let verdict = if duplicates.contains(index) {
                Verdict::Fault("duplicate of another line's translation".to_string())
            } else if is_placeholder(text) {
                Verdict::Fault(
                    "looks like a placeholder or meta-comment, not a translation".to_string(),
                )
            } else if is_leftover_source_checked && has_han(source) && has_han(text) {
                Verdict::Fault("still contains untranslated source-language characters".to_string())
            } else if let Some(missing) = missing_terms(glossary_terms, source, text) {
                Verdict::Flaw(format!("must use glossary translation(s): {missing}"))
            } else if is_negation_checked
                && has_chinese_negation(source)
                && !has_english_negation(text)
            {
                Verdict::Flaw(
                    "source contains a negation that seems to be missing from the translation"
                        .to_string(),
                )
            } else {
                Verdict::Pass
            };
            (*index, verdict)
        })
        .collect()
}

/// Lines whose translation matches another line's although their sources differ: the Model
/// likely collapsed distinct content into one. A repeated source line, like a refrain, may
/// rightly repeat its translation.
fn duplicated_lines(
    translations: &BTreeMap<usize, String>,
    sources: &HashMap<usize, &str>,
) -> HashSet<usize> {
    let mut first_by_text: HashMap<String, usize> = HashMap::new();
    let mut duplicates = HashSet::new();
    for (index, text) in translations {
        let key = text.trim().to_lowercase();
        if key.chars().count() <= 5 {
            continue;
        }
        match first_by_text.get(&key) {
            Some(&other) => {
                let source = |line: usize| sources.get(&line).map(|text| text.trim());
                if source(*index) != source(other) {
                    duplicates.insert(*index);
                    duplicates.insert(other);
                }
            }
            None => {
                first_by_text.insert(key, *index);
            }
        }
    }
    duplicates
}

/// The Translation Glossary's terms whose source appears in any of `group`'s lines.
fn used_terms(
    glossary_terms: &[(String, String)],
    group: &[(usize, &str)],
) -> Vec<(String, String)> {
    glossary_terms
        .iter()
        .filter(|(source, _)| group.iter().any(|(_, text)| text.contains(source.as_str())))
        .cloned()
        .collect()
}

/// The targets `translation` leaves out of the terms its `source` line uses, joined for a correction note.
fn missing_terms(
    glossary_terms: &[(String, String)],
    source: &str,
    translation: &str,
) -> Option<String> {
    let translation = translation.to_lowercase();
    let missing_targets: Vec<&str> = glossary_terms
        .iter()
        .filter(|(term, target)| {
            source.contains(term.as_str()) && !translation.contains(&target.to_lowercase())
        })
        .map(|(_, target)| target.as_str())
        .collect();
    (!missing_targets.is_empty()).then(|| missing_targets.join(", "))
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
    let without_non_negations = CHINESE_NON_NEGATIONS
        .iter()
        .fold(text.to_string(), |text, word| text.replace(word, ""));
    CHINESE_NEGATIONS
        .iter()
        .any(|marker| without_non_negations.contains(marker))
}

fn has_english_negation(text: &str) -> bool {
    let padded_text = format!(" {} ", text.to_lowercase());
    ENGLISH_NEGATIONS
        .iter()
        .any(|marker| padded_text.contains(marker))
        || padded_text.split_whitespace().any(|word| {
            ENGLISH_NEGATED_WORDS.contains(&word.trim_matches(|ch: char| ".,!?;:\"'".contains(ch)))
        })
}

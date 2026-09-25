use serde::Deserialize;
use serde_json::json;

use crate::language::{Language, LanguagePair};

/// One request for translations: each line with its index, lines already translated for the Model
/// to stay consistent with, the source text just before the lines, and what to fix from last time.
pub struct BatchRequest<'a> {
    pub languages: LanguagePair,
    pub lines: Vec<(usize, &'a str)>,
    pub reference: &'a [(String, String)],
    /// The Rolling Summary so far, when one is kept.
    pub summary: Option<&'a str>,
    pub preceding: Option<String>,
    /// The source text just after the lines, which they may lead into.
    pub following: Option<String>,
    /// The Translation Glossary's terms the lines use.
    pub glossary_terms: &'a [(String, String)],
    pub correction: Option<String>,
}

/// One translation for Self-Review, with the source text of the lines on either side of it.
pub struct ReviewItem<'a> {
    pub index: usize,
    pub source: &'a str,
    pub translation: &'a str,
    pub previous_line: Option<(usize, &'a str)>,
    pub next_line: Option<(usize, &'a str)>,
}

#[derive(Deserialize)]
pub struct BatchAnswer {
    pub translations: Vec<TranslatedLine>,
}

#[derive(Deserialize)]
pub struct ReviewAnswer {
    pub reviews: Vec<LineReview>,
}

#[derive(Deserialize)]
pub struct LineReview {
    pub index: usize,
    pub best_matching_index: usize,
}

#[derive(Deserialize)]
pub struct SummaryAnswer {
    pub summary: String,
}

#[derive(Deserialize)]
pub struct SplitSentencesAnswer {
    pub clusters: Vec<Vec<usize>>,
}

#[derive(Deserialize)]
pub struct TranslatedLine {
    pub index: usize,
    pub text: String,
}

/// What one kind of request asks of the Model: the schema's name, and how freely it may answer.
pub struct Task {
    pub name: &'static str,
    pub temperature: f32,
}

pub const TRANSLATION_TASK: Task = Task {
    name: "subtitle_translation",
    temperature: 0.2,
};
/// A review should reach the same verdict on the same lines every time.
pub const REVIEW_TASK: Task = Task {
    name: "subtitle_translation_review",
    temperature: 0.0,
};
/// A summary should say the same of the same lines every time.
pub const SUMMARY_TASK: Task = Task {
    name: "rolling_summary",
    temperature: 0.0,
};
/// Judging where sentences continue wants the same answer every time.
pub const SPLIT_SENTENCE_TASK: Task = Task {
    name: "continuation_clusters",
    temperature: 0.0,
};

pub fn instruction(languages: LanguagePair) -> String {
    format!(
        "You are a professional subtitle translator.
Translate the given {source} subtitle lines into {target}.
Rules:
- Keep translations concise and natural, suitable for on-screen subtitles.
- Preserve the original meaning, tone, and speaker's intent; do not add explanations.
- Keep proper nouns (names, titles) consistent with the reference context if provided.
- If a glossary is provided, its target terms are mandatory and override your own word choice.
- Return exactly one translation per input \"index\", with no extra or missing indices.
- Respond only with the JSON object matching the required schema.",
        source = languages.source.name(),
        target = languages.target.name(),
    )
}

/// The Batch's lines go last, as one line of JSON, after whatever the Model should read first.
pub fn user_message(batch: &BatchRequest<'_>) -> String {
    let mut parts = Vec::new();
    if let Some(summary) = batch.summary {
        parts.push(format!(
            "Running summary of the file so far (for consistency only, not to be translated):\n{summary}"
        ));
    }
    if let Some(preceding) = &batch.preceding {
        parts.push(format!(
            "Note: the original-language text below immediately precedes the lines you are about to translate, and their sentence may continue from it. Use it only to understand grammar and meaning - do not translate it or include it in your output:\n{preceding}"
        ));
    }
    if let Some(following) = &batch.following {
        parts.push(format!(
            "Note: the original-language text below immediately follows the lines you are about to translate, and their sentence may continue into it. Use it only to understand grammar and meaning - do not translate it or include it in your output:\n{following}"
        ));
    }
    if !batch.reference.is_empty() {
        parts.push(format!(
            "Reference context (already translated, for consistency only, do not re-translate these):\n{}",
            pair_lines(batch.reference)
        ));
    }
    if !batch.glossary_terms.is_empty() {
        let terms: Vec<String> = batch
            .glossary_terms
            .iter()
            .map(|(source, target)| format!("- {source} => {target}"))
            .collect();
        parts.push(format!(
            "Glossary (mandatory): whenever a source term below appears in a line, the translation must contain its exact given target term:\n{}",
            terms.join("\n")
        ));
    }
    if let Some(correction) = &batch.correction {
        parts.push(format!("Correction needed: {correction}"));
    }
    parts.push(format!(
        "Translate the following subtitle lines:\n{}",
        lines_json(&batch.lines)
    ));
    parts.join("\n\n")
}

/// The lines as one line of JSON, each with its index.
fn lines_json(lines: &[(usize, &str)]) -> String {
    let payload: Vec<_> = lines
        .iter()
        .map(|(index, text)| json!({"index": index, "text": text}))
        .collect();
    serde_json::Value::from(payload).to_string()
}

/// Each source line with its translation, one `- source => translation` per line.
fn pair_lines(pairs: &[(String, String)]) -> String {
    pairs
        .iter()
        .map(|(source, translation)| format!("- {source} => {translation}"))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn review_instruction(languages: LanguagePair) -> String {
    format!(
        "You are reviewing {target} subtitle translations for accuracy against
their original {source} lines, each identified by an \"index\". Some entries also
include \"previous_line_source\"/\"previous_line_index\" and/or
\"next_line_source\"/\"next_line_index\" - the neighboring subtitle's original text and its
index number, given only as background context. Never grade the translation against
these, they are not being reviewed.

For each entry, complete these steps in order:
1. \"translation_meaning\": in one short sentence, state in your own words what the given
   \"translation\" text actually says - only what it actually says, not what it should say.
2. \"best_matching_index\": among the index values visible to you (this entry's own
   index, and previous_line_index/next_line_index if given), which one's own source
   line does the meaning you just restated most closely describe? This should almost
   always be the entry's own index - only pick a different one if the restated meaning
   clearly and unambiguously belongs to a different line's content instead.
3. \"issue\": one short sentence only if best_matching_index differs from this entry's
   own index, or you found another clear, specific meaning error; otherwise an empty
   string.

Most translations are correct - only report a problem when you can point to a specific,
concrete mismatch. If genuinely unsure, prefer answering that it is fine.

Respond only with the JSON object matching the required schema.",
        source = languages.source.name(),
        target = languages.target.name(),
    )
}

/// `translation_meaning` comes before the verdict so the Model restates the translation in its
/// own words first, grounding the verdict in the text rather than in the neighbouring lines.
pub fn review_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "reviews": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "index": {"type": "integer"},
                        "translation_meaning": {"type": "string"},
                        "best_matching_index": {"type": "integer"},
                        "issue": {"type": "string"},
                    },
                    "required": ["index", "translation_meaning", "best_matching_index", "issue"],
                    "additionalProperties": false,
                },
            },
        },
        "required": ["reviews"],
        "additionalProperties": false,
    })
}

pub fn summary_instruction(languages: LanguagePair, word_limit: usize) -> String {
    format!(
        "You maintain a running summary that helps a {source}-to-{target}
subtitle translator stay consistent across a long file, beyond what a short local context
window can hold.

Given the previous summary (if any, otherwise this is the first batch) and the lines
just translated, write an updated summary covering only what later batches need for
consistency: recurring proper nouns and the {target} term already established for
each, the overall tone/register, and the ongoing topic. Do not summarize the plot
beat-by-beat, and do not restate anything a per-term glossary would already cover.

Keep the result under {word_limit} words. Respond only with the JSON object matching the
required schema.",
        source = languages.source.name(),
        target = languages.target.name(),
    )
}

pub fn summary_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {"summary": {"type": "string"}},
        "required": ["summary"],
        "additionalProperties": false,
    })
}

pub fn split_sentence_instruction(source: Language) -> String {
    format!(
        "You identify {source} subtitle lines whose original sentence was split
across multiple consecutive entries by an automatic transcription/subtitling tool.

Given an ordered list of subtitle lines, each with an index, find groups of 2 or more
CONSECUTIVE indices that together form a single continuous sentence or thought - where
reading any one line alone, without its neighbors, would be grammatically incomplete or
confusing on its own.

Most lines are self-contained complete thoughts and should NOT be grouped, even if they
lack ending punctuation - that is normal for this kind of transcript. Only report
genuine continuations, where a line clearly depends on a neighbor to make sense.

Respond only with the JSON object matching the required schema.",
        source = source.name(),
    )
}

pub fn split_sentence_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "clusters": {
                "type": "array",
                "items": {"type": "array", "items": {"type": "integer"}},
            },
        },
        "required": ["clusters"],
        "additionalProperties": false,
    })
}

pub fn translation_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "translations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "index": {"type": "integer"},
                        "text": {"type": "string"},
                    },
                    "required": ["index", "text"],
                    "additionalProperties": false,
                },
            },
        },
        "required": ["translations"],
        "additionalProperties": false,
    })
}

/// The lines whose Split Sentences the Model is asked to find.
pub fn split_sentence_message(lines: &[(usize, &str)]) -> String {
    format!("Subtitle lines:\n{}", lines_json(lines))
}

/// The previous Rolling Summary, when there is one, and the lines just translated.
pub fn summary_message(previous_summary: Option<&str>, batch_pairs: &[(String, String)]) -> String {
    let mut parts = Vec::new();
    if let Some(previous_summary) = previous_summary {
        parts.push(format!("Previous summary:\n{previous_summary}"));
    }
    parts.push(format!(
        "Newly translated lines from this batch:\n{}",
        pair_lines(batch_pairs)
    ));
    parts.join("\n\n")
}

/// The translations the Model is asked to review, each with the source lines on either side.
pub fn review_message(items: &[ReviewItem<'_>]) -> String {
    let payload: Vec<_> = items
        .iter()
        .map(|item| {
            let mut entry = json!({
                "index": item.index,
                "source": item.source,
                "translation": item.translation,
            });
            if let Some((index, source)) = item.previous_line {
                entry["previous_line_index"] = json!(index);
                entry["previous_line_source"] = json!(source);
            }
            if let Some((index, source)) = item.next_line {
                entry["next_line_index"] = json!(index);
                entry["next_line_source"] = json!(source);
            }
            entry
        })
        .collect();
    format!(
        "Review these translations:\n{}",
        serde_json::Value::from(payload)
    )
}

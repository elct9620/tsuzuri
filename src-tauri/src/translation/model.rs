use std::collections::HashMap;

use async_openai::config::OpenAIConfig;
use async_openai::types::chat::{
    ChatCompletionRequestSystemMessage, ChatCompletionRequestUserMessage,
    CreateChatCompletionRequestArgs, ResponseFormat, ResponseFormatJsonSchema,
};
use async_openai::Client;
use serde::Deserialize;
use serde_json::json;

use crate::failure::Failure;
use crate::language::{Language, LanguagePair};

/// The translation Model behind llama-server's OpenAI-compatible API.
pub struct TranslationModel {
    client: Client<OpenAIConfig>,
}

/// One request for translations: each line with its index, lines already translated for the Model
/// to stay consistent with, the source text just before the lines, and what to fix from last time.
pub struct BatchRequest<'a> {
    pub languages: LanguagePair,
    pub lines: Vec<(usize, &'a str)>,
    pub reference: &'a [(String, String)],
    pub preceding: Option<String>,
    /// The Translation Glossary's terms the lines use.
    pub glossary_terms: &'a [(String, String)],
    pub correction: Option<String>,
}

/// Why the Model gave no usable answer: the request failed, or the answer could not be read.
#[derive(Debug)]
pub enum AnswerError {
    FailedRequest(Failure),
    MalformedAnswer(String),
}

impl From<AnswerError> for Failure {
    fn from(error: AnswerError) -> Failure {
        match error {
            AnswerError::FailedRequest(failure) => failure,
            AnswerError::MalformedAnswer(detail) => Failure::LlamaRequest { detail },
        }
    }
}

#[derive(Deserialize)]
struct BatchAnswer {
    translations: Vec<TranslatedLine>,
}

#[derive(Deserialize)]
struct SplitSentencesAnswer {
    clusters: Vec<Vec<usize>>,
}

#[derive(Deserialize)]
struct TranslatedLine {
    index: usize,
    text: String,
}

impl TranslationModel {
    pub fn new(base_url: &str) -> TranslationModel {
        TranslationModel {
            client: Client::with_config(
                OpenAIConfig::new().with_api_base(format!("{base_url}/v1")),
            ),
        }
    }

    /// The translation the Model answered for each index it answered.
    pub async fn translate_batch(
        &self,
        batch: &BatchRequest<'_>,
    ) -> Result<HashMap<usize, String>, AnswerError> {
        let answer: BatchAnswer = self
            .answer(
                instruction(batch.languages),
                user_message(batch),
                TRANSLATION_TASK,
                translation_schema(),
            )
            .await?;
        Ok(answer
            .translations
            .into_iter()
            .map(|line| (line.index, line.text.trim().to_string()))
            .collect())
    }

    /// Runs of consecutive indices the Model reads as one sentence cut apart, two lines or more each.
    pub async fn find_split_sentences(
        &self,
        source: Language,
        lines: &[(usize, &str)],
    ) -> Result<Vec<Vec<usize>>, AnswerError> {
        let answer: SplitSentencesAnswer = self
            .answer(
                split_sentence_instruction(source),
                format!("Subtitle lines:\n{}", lines_json(lines)),
                SPLIT_SENTENCE_TASK,
                split_sentence_schema(),
            )
            .await?;
        Ok(answer
            .clusters
            .into_iter()
            .map(|mut sentence| {
                sentence.sort_unstable();
                sentence.dedup();
                sentence
            })
            .filter(|sentence| sentence.len() >= 2)
            .collect())
    }

    async fn answer<T: for<'de> Deserialize<'de>>(
        &self,
        system: String,
        user: String,
        task: Task,
        schema: serde_json::Value,
    ) -> Result<T, AnswerError> {
        let request = CreateChatCompletionRequestArgs::default()
            .model("tsuzuri")
            .messages([
                ChatCompletionRequestSystemMessage::from(system).into(),
                ChatCompletionRequestUserMessage::from(user).into(),
            ])
            .temperature(task.temperature)
            .response_format(ResponseFormat::JsonSchema {
                json_schema: ResponseFormatJsonSchema {
                    name: task.name.to_string(),
                    schema,
                    strict: Some(true),
                    description: None,
                },
            })
            .build()
            .map_err(|error| AnswerError::FailedRequest(request_failure(error)))?;
        let response = self
            .client
            .chat()
            .create(request)
            .await
            .map_err(|error| AnswerError::FailedRequest(request_failure(error)))?;
        let content = response
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .ok_or_else(|| AnswerError::MalformedAnswer("answered without content".to_string()))?;
        serde_json::from_str(&content)
            .map_err(|error| AnswerError::MalformedAnswer(error.to_string()))
    }
}

/// What one kind of request asks of the Model: the schema's name, and how freely it may answer.
struct Task {
    name: &'static str,
    temperature: f32,
}

const TRANSLATION_TASK: Task = Task {
    name: "subtitle_translation",
    temperature: 0.2,
};
/// Judging where sentences continue wants the same answer every time.
const SPLIT_SENTENCE_TASK: Task = Task {
    name: "continuation_clusters",
    temperature: 0.0,
};

fn request_failure(error: async_openai::error::OpenAIError) -> Failure {
    Failure::LlamaRequest {
        detail: error.to_string(),
    }
}

fn instruction(languages: LanguagePair) -> String {
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
fn user_message(batch: &BatchRequest<'_>) -> String {
    let mut parts = Vec::new();
    if let Some(preceding) = &batch.preceding {
        parts.push(format!(
            "Note: the original-language text below immediately precedes the lines you are about to translate, and their sentence may continue from it. Use it only to understand grammar and meaning - do not translate it or include it in your output:\n{preceding}"
        ));
    }
    if !batch.reference.is_empty() {
        let lines: Vec<String> = batch
            .reference
            .iter()
            .map(|(source, translation)| format!("- {source} => {translation}"))
            .collect();
        parts.push(format!(
            "Reference context (already translated, for consistency only, do not re-translate these):\n{}",
            lines.join("\n")
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

fn split_sentence_instruction(source: Language) -> String {
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

fn split_sentence_schema() -> serde_json::Value {
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

fn translation_schema() -> serde_json::Value {
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

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
use crate::language::LanguagePair;

/// The translation Model behind llama-server's OpenAI-compatible API.
pub struct TranslationModel {
    client: Client<OpenAIConfig>,
}

/// One Batch: each line with its index, and lines already translated for the Model to stay consistent with.
pub struct BatchRequest<'a> {
    pub languages: LanguagePair,
    pub lines: Vec<(usize, &'a str)>,
    pub reference: &'a [(String, String)],
}

#[derive(Deserialize)]
struct BatchAnswer {
    translations: Vec<TranslatedLine>,
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
    ) -> Result<HashMap<usize, String>, Failure> {
        let answer: BatchAnswer = self
            .answer(
                instruction(batch.languages),
                user_message(batch),
                "subtitle_translation",
                translation_schema(),
            )
            .await?;
        Ok(answer
            .translations
            .into_iter()
            .map(|line| (line.index, line.text.trim().to_string()))
            .collect())
    }

    async fn answer<T: for<'de> Deserialize<'de>>(
        &self,
        system: String,
        user: String,
        name: &str,
        schema: serde_json::Value,
    ) -> Result<T, Failure> {
        let request = CreateChatCompletionRequestArgs::default()
            .model("tsuzuri")
            .messages([
                ChatCompletionRequestSystemMessage::from(system).into(),
                ChatCompletionRequestUserMessage::from(user).into(),
            ])
            .temperature(0.2_f32)
            .response_format(ResponseFormat::JsonSchema {
                json_schema: ResponseFormatJsonSchema {
                    name: name.to_string(),
                    schema,
                    strict: Some(true),
                    description: None,
                },
            })
            .build()
            .map_err(request_failure)?;
        let response = self
            .client
            .chat()
            .create(request)
            .await
            .map_err(request_failure)?;
        let content = response
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .ok_or_else(|| Failure::LlamaRequest {
                detail: "answered without content".to_string(),
            })?;
        serde_json::from_str(&content).map_err(|error| Failure::LlamaRequest {
            detail: format!("answered malformed JSON: {error}"),
        })
    }
}

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
- Return exactly one translation per input \"index\", with no extra or missing indices.
- Respond only with the JSON object matching the required schema.",
        source = languages.source.name(),
        target = languages.target.name(),
    )
}

/// The Batch's lines go last, as one line of JSON, after whatever the Model should read first.
fn user_message(batch: &BatchRequest<'_>) -> String {
    let mut parts = Vec::new();
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
    let payload: Vec<_> = batch
        .lines
        .iter()
        .map(|(index, text)| json!({"index": index, "text": text}))
        .collect();
    parts.push(format!(
        "Translate the following subtitle lines:\n{}",
        serde_json::Value::from(payload)
    ));
    parts.join("\n\n")
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

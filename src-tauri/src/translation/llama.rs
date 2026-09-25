use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};

use async_openai::config::OpenAIConfig;
use async_openai::types::chat::{
    ChatCompletionRequestSystemMessage, ChatCompletionRequestUserMessage,
    CreateChatCompletionRequestArgs, ResponseFormat, ResponseFormatJsonSchema,
};
use async_openai::Client;
use serde::Deserialize;

use super::prompt::{
    instruction, review_instruction, review_message, review_schema, split_sentence_instruction,
    split_sentence_message, split_sentence_schema, summary_instruction, summary_message,
    summary_schema, translation_schema, user_message, BatchAnswer, BatchRequest, ReviewAnswer,
    ReviewItem, SplitSentencesAnswer, SummaryAnswer, Task, REVIEW_TASK, SPLIT_SENTENCE_TASK,
    SUMMARY_TASK, TRANSLATION_TASK,
};
use crate::failure::Failure;
use crate::language::{Language, LanguagePair};

/// How long llama-server may take to load its Model before translation gives up.
pub const READY_TIMEOUT: Duration = Duration::from_secs(180);
const HEALTH_POLL: Duration = Duration::from_millis(500);
/// A Batch and its reference lines fit in a small context, which keeps the KV cache inside 4 GB of VRAM.
const CONTEXT_SIZE: &str = "4096";
/// Subtitles need no reasoning, and a thinking Model spends most of each request on it.
const CHAT_TEMPLATE_KWARGS: &str = r#"{"enable_thinking":false}"#;

/// How llama-server is started for one translation: the Model, on a local `port`, answering no one else.
pub fn server_args(model: &Path, port: u16) -> Vec<String> {
    vec![
        "-m".to_string(),
        model.to_string_lossy().into_owned(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "-c".to_string(),
        CONTEXT_SIZE.to_string(),
        "--chat-template-kwargs".to_string(),
        CHAT_TEMPLATE_KWARGS.to_string(),
        "--no-webui".to_string(),
    ]
}

/// A port the OS just handed out and released; llama-server binds it moments later.
pub fn free_port() -> Result<u16, Failure> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

pub async fn wait_until_ready(
    base_url: &str,
    timeout: Duration,
    has_exited: impl Fn() -> bool,
) -> Result<(), Failure> {
    let client = reqwest::Client::new();
    let deadline = Instant::now() + timeout;
    loop {
        let healthy = client
            .get(format!("{base_url}/health"))
            .send()
            .await
            .is_ok_and(|response| response.status().is_success());
        if healthy {
            return Ok(());
        }
        if has_exited() {
            return Err(Failure::LlamaExited);
        }
        if Instant::now() >= deadline {
            return Err(Failure::LlamaTimedOut);
        }
        tokio::time::sleep(HEALTH_POLL).await;
    }
}

/// The translation Model behind llama-server's OpenAI-compatible API.
pub struct TranslationModel {
    client: Client<OpenAIConfig>,
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
                split_sentence_message(lines),
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

    /// The Rolling Summary rewritten from the previous one and the lines just translated,
    /// kept under `word_limit` words.
    pub async fn rewrite_summary(
        &self,
        languages: LanguagePair,
        previous_summary: Option<&str>,
        batch_pairs: &[(String, String)],
        word_limit: usize,
    ) -> Result<String, AnswerError> {
        let answer: SummaryAnswer = self
            .answer(
                summary_instruction(languages, word_limit),
                summary_message(previous_summary, batch_pairs),
                SUMMARY_TASK,
                summary_schema(),
            )
            .await?;
        Ok(answer.summary.trim().to_string())
    }

    /// The line each item's translation belongs to, by the Model's reading, for each item it reviewed.
    pub async fn review_translations(
        &self,
        languages: LanguagePair,
        items: &[ReviewItem<'_>],
    ) -> Result<HashMap<usize, usize>, AnswerError> {
        let answer: ReviewAnswer = self
            .answer(
                review_instruction(languages),
                review_message(items),
                REVIEW_TASK,
                review_schema(),
            )
            .await?;
        Ok(answer
            .reviews
            .into_iter()
            .map(|review| (review.index, review.best_matching_index))
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

fn request_failure(error: async_openai::error::OpenAIError) -> Failure {
    Failure::LlamaRequest {
        detail: error.to_string(),
    }
}

impl From<reqwest::Error> for Failure {
    fn from(error: reqwest::Error) -> Self {
        Failure::LlamaRequest {
            detail: error.to_string(),
        }
    }
}

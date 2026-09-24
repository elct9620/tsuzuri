use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::json;

use super::model::TranslationModel;
use crate::test_support::{FakeHttp, Response};

/// The lines of one request: each index with its text.
pub type Lines = Vec<(usize, String)>;

/// A llama-server that answers `/health` as not ready `loading` times first, then answers
/// the n-th translation request through `translate` and each window looked at for Split
/// Sentences through `split`, keeping every request it was sent.
pub struct FakeLlama {
    server: FakeHttp,
    pub log: Arc<Mutex<Vec<String>>>,
    pub requests: Arc<Mutex<Vec<serde_json::Value>>>,
    pub windows: Arc<Mutex<Vec<Lines>>>,
}

impl FakeLlama {
    pub fn serve(
        loading: usize,
        translate: impl Fn(usize, Lines) -> Response + Send + Sync + 'static,
        split: impl Fn(Lines) -> String + Send + Sync + 'static,
    ) -> FakeLlama {
        let log = Arc::new(Mutex::new(Vec::new()));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let windows = Arc::new(Mutex::new(Vec::new()));
        let (seen, sent, looked) = (
            Arc::clone(&log),
            Arc::clone(&requests),
            Arc::clone(&windows),
        );
        let health_checks = Mutex::new(0);
        let translations_asked = AtomicUsize::new(0);
        let server = FakeHttp::serve(move |request| {
            if request.path == "/health" {
                let mut checks = health_checks.lock().unwrap();
                *checks += 1;
                let ready = *checks > loading;
                seen.lock().unwrap().push(format!(
                    "health {}",
                    if ready { "ready" } else { "loading" }
                ));
                return Response {
                    status: if ready { 200 } else { 503 },
                    body: Vec::new(),
                };
            }
            seen.lock().unwrap().push("chat".to_string());
            let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap();
            let lines = batch_lines(&body);
            if body["response_format"]["json_schema"]["name"] == "continuation_clusters" {
                looked.lock().unwrap().push(lines.clone());
                return completion(&split(lines));
            }
            sent.lock().unwrap().push(body);
            translate(translations_asked.fetch_add(1, Ordering::SeqCst), lines)
        });
        FakeLlama {
            server,
            log,
            requests,
            windows,
        }
    }

    /// Answers each line as its text prefixed with `EN:`.
    pub fn echo(loading: usize) -> FakeLlama {
        FakeLlama::serve(
            loading,
            |_, lines| translations(echo_lines(lines)),
            no_split_sentences,
        )
    }

    /// Echoes each line, and answers every window with `split` as its Split Sentences.
    pub fn echo_finding(split: impl Fn(Lines) -> String + Send + Sync + 'static) -> FakeLlama {
        FakeLlama::serve(0, |_, lines| translations(echo_lines(lines)), split)
    }

    /// Answers every translation request with the lines `answer` gives back.
    pub fn answering(answer: impl Fn(Lines) -> Lines + Send + Sync + 'static) -> FakeLlama {
        FakeLlama::serve(
            0,
            move |_, lines| translations(answer(lines)),
            no_split_sentences,
        )
    }

    /// Answers the n-th translation request, counting from 0, with what `answer` gives back.
    pub fn answering_each(
        answer: impl Fn(usize, Lines) -> Response + Send + Sync + 'static,
    ) -> FakeLlama {
        FakeLlama::serve(0, answer, no_split_sentences)
    }

    pub fn base_url(&self) -> &str {
        &self.server.base_url
    }

    pub fn model(&self) -> TranslationModel {
        TranslationModel::new(&self.server.base_url)
    }

    pub fn batch_sizes(&self) -> Vec<usize> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .map(|body| batch_lines(body).len())
            .collect()
    }

    pub fn user_messages(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .map(|body| body["messages"][1]["content"].as_str().unwrap().to_string())
            .collect()
    }
}

fn no_split_sentences(_: Lines) -> String {
    json!({"clusters": []}).to_string()
}

pub fn echo_lines(lines: Lines) -> Lines {
    lines
        .into_iter()
        .map(|(index, text)| (index, format!("EN:{text}")))
        .collect()
}

/// An answer carrying `lines` as the Batch's translations.
pub fn translations(lines: Lines) -> Response {
    let translations: Vec<_> = lines
        .into_iter()
        .map(|(index, text)| json!({"index": index, "text": text}))
        .collect();
    completion(&json!({"translations": translations}).to_string())
}

/// A chat completion whose message is `content`.
pub fn completion(content: &str) -> Response {
    Response {
        status: 200,
        body: json!({
            "id": "chatcmpl-fake",
            "object": "chat.completion",
            "created": 0,
            "model": "tsuzuri",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }],
        })
        .to_string()
        .into_bytes(),
    }
}

/// The lines a request carries: the JSON on the last line of its user message.
pub fn batch_lines(body: &serde_json::Value) -> Lines {
    let user = body["messages"][1]["content"].as_str().unwrap();
    let lines: Vec<serde_json::Value> = serde_json::from_str(user.lines().last().unwrap()).unwrap();
    lines
        .iter()
        .map(|line| {
            (
                line["index"].as_u64().unwrap() as usize,
                line["text"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

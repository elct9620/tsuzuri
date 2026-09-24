use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::json;

use super::model::TranslationModel;
use crate::test_support::{FakeHttp, Response};

/// The lines of one request: each index with its text.
pub type Lines = Vec<(usize, String)>;

type Reply<T> = Box<dyn Fn(T) -> Response + Send + Sync>;

/// How a fake llama-server answers each kind of request.
pub struct Replies {
    /// `/health` answers as not ready this many times first.
    pub loading_checks: usize,
    /// Answers the n-th translation request, counting from 0.
    pub translation: Reply<(usize, Lines)>,
    /// Answers each window looked at for Split Sentences.
    pub split_sentences: Reply<Lines>,
    /// Answers the n-th Rolling Summary request, counting from 0.
    pub summary: Reply<usize>,
    /// Answers the n-th Self-Review request, counting from 0, with the lines it reviews.
    pub review: Reply<(usize, Vec<serde_json::Value>)>,
}

impl Default for Replies {
    /// Echoes every translation, finds no Split Sentences, numbers each summary and passes every review.
    fn default() -> Replies {
        Replies {
            loading_checks: 0,
            translation: Box::new(|(_, lines)| translations(echo_lines(lines))),
            split_sentences: Box::new(|_| completion(&json!({"clusters": []}).to_string())),
            summary: Box::new(numbered_summary),
            review: Box::new(|(_, items)| passing_review(items)),
        }
    }
}

/// A llama-server answering through its `Replies` and keeping every request it was sent.
pub struct FakeLlama {
    server: FakeHttp,
    pub log: Arc<Mutex<Vec<String>>>,
    pub requests: Arc<Mutex<Vec<serde_json::Value>>>,
    pub windows: Arc<Mutex<Vec<Lines>>>,
    pub summary_requests: Arc<Mutex<Vec<serde_json::Value>>>,
    pub review_requests: Arc<Mutex<Vec<serde_json::Value>>>,
}

impl FakeLlama {
    pub fn serve(replies: Replies) -> FakeLlama {
        let log = Arc::new(Mutex::new(Vec::new()));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let windows = Arc::new(Mutex::new(Vec::new()));
        let summary_requests = Arc::new(Mutex::new(Vec::new()));
        let review_requests = Arc::new(Mutex::new(Vec::new()));
        let (log_sink, request_sink, window_sink, summary_sink, review_sink) = (
            Arc::clone(&log),
            Arc::clone(&requests),
            Arc::clone(&windows),
            Arc::clone(&summary_requests),
            Arc::clone(&review_requests),
        );
        let health_checks = Mutex::new(0);
        let translation_requests = AtomicUsize::new(0);
        let server = FakeHttp::serve(move |request| {
            if request.path == "/health" {
                let mut checks = health_checks.lock().unwrap();
                *checks += 1;
                let ready = *checks > replies.loading_checks;
                log_sink.lock().unwrap().push(format!(
                    "health {}",
                    if ready { "ready" } else { "loading" }
                ));
                return Response {
                    status: if ready { 200 } else { 503 },
                    body: Vec::new(),
                };
            }
            log_sink.lock().unwrap().push("chat".to_string());
            let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap();
            match body["response_format"]["json_schema"]["name"].as_str() {
                Some("continuation_clusters") => {
                    let lines = batch_lines(&body);
                    window_sink.lock().unwrap().push(lines.clone());
                    (replies.split_sentences)(lines)
                }
                Some("rolling_summary") => {
                    let mut sink = summary_sink.lock().unwrap();
                    sink.push(body);
                    (replies.summary)(sink.len() - 1)
                }
                Some("subtitle_translation_review") => {
                    let items = reviewed_items(&body);
                    let mut sink = review_sink.lock().unwrap();
                    sink.push(body);
                    (replies.review)((sink.len() - 1, items))
                }
                _ => {
                    let lines = batch_lines(&body);
                    request_sink.lock().unwrap().push(body);
                    let asked = translation_requests.fetch_add(1, Ordering::SeqCst);
                    (replies.translation)((asked, lines))
                }
            }
        });
        FakeLlama {
            server,
            log,
            requests,
            windows,
            summary_requests,
            review_requests,
        }
    }

    /// Answers each line as its text prefixed with `EN:`.
    pub fn with_echo(loading_checks: usize) -> FakeLlama {
        FakeLlama::serve(Replies {
            loading_checks,
            ..Replies::default()
        })
    }

    /// Echoes each line, and answers every window with `split` as its Split Sentences.
    pub fn with_split_sentences(
        split: impl Fn(Lines) -> String + Send + Sync + 'static,
    ) -> FakeLlama {
        FakeLlama::serve(Replies {
            split_sentences: Box::new(move |lines| completion(&split(lines))),
            ..Replies::default()
        })
    }

    /// Answers every translation request with the lines `answer` gives back.
    pub fn with_answer(answer: impl Fn(Lines) -> Lines + Send + Sync + 'static) -> FakeLlama {
        FakeLlama::serve(Replies {
            translation: Box::new(move |(_, lines)| translations(answer(lines))),
            ..Replies::default()
        })
    }

    /// Answers the n-th translation request, counting from 0, with what `answer` gives back.
    pub fn with_answer_per_request(
        answer: impl Fn(usize, Lines) -> Response + Send + Sync + 'static,
    ) -> FakeLlama {
        FakeLlama::serve(Replies {
            translation: Box::new(move |(asked, lines)| answer(asked, lines)),
            ..Replies::default()
        })
    }

    /// Echoes each line, and answers the n-th Rolling Summary request with what `summarize` gives back.
    pub fn with_summaries(
        summarize: impl Fn(usize) -> Response + Send + Sync + 'static,
    ) -> FakeLlama {
        FakeLlama::serve(Replies {
            summary: Box::new(summarize),
            ..Replies::default()
        })
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

/// The n-th Rolling Summary, counting from 0: `summary <n>`.
pub fn numbered_summary(request: usize) -> Response {
    completion(&json!({"summary": format!("summary {request}")}).to_string())
}

/// A review placing every item's translation on its own line.
pub fn passing_review(items: Vec<serde_json::Value>) -> Response {
    review_answer(
        items
            .iter()
            .map(|item| {
                let index = item["index"].as_u64().unwrap() as usize;
                (index, index)
            })
            .collect(),
    )
}

/// A review placing each index's translation on the line paired with it.
pub fn review_answer(placements: Vec<(usize, usize)>) -> Response {
    let reviews: Vec<_> = placements
        .into_iter()
        .map(|(index, placed_on)| {
            json!({
                "index": index,
                "translation_meaning": "what it says",
                "best_matching_index": placed_on,
                "issue": "",
            })
        })
        .collect();
    completion(&json!({"reviews": reviews}).to_string())
}

/// The items a Self-Review request asks about: the JSON on the last line of its user message.
pub fn reviewed_items(body: &serde_json::Value) -> Vec<serde_json::Value> {
    let user = body["messages"][1]["content"].as_str().unwrap();
    serde_json::from_str(user.lines().last().unwrap()).unwrap()
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

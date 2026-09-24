use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::async_runtime;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;

use crate::components::{self, Resolver};
use crate::failure::Failure;
use crate::language::{Language, LanguagePair};
use crate::models::{self, ModelSettings, ModelSlot};
use crate::pipeline::{enter, report};
use crate::processes::Processes;
use crate::project::{self, CurrentProject};
use crate::timing::{PhaseTiming, Phases};
use crate::transcript::Segment;

mod model;

use model::{BatchRequest, TranslationModel};

/// How long llama-server may take to load its Model before translation gives up.
const READY_TIMEOUT: Duration = Duration::from_secs(180);
const HEALTH_POLL: Duration = Duration::from_millis(500);
/// A Batch and its reference lines fit in a small context, which keeps the KV cache inside 4 GB of VRAM.
const CONTEXT_SIZE: &str = "4096";
/// Subtitles need no reasoning, and a thinking Model spends most of each request on it.
const CHAT_TEMPLATE_KWARGS: &str = r#"{"enable_thinking":false}"#;

/// How Segments are grouped into requests.
#[derive(Debug, Clone, Copy)]
struct Batching {
    /// Segments per Batch.
    size: usize,
    /// Translated lines from before a Batch that it carries as reference.
    reference_lines: usize,
}

impl Default for Batching {
    fn default() -> Batching {
        Batching {
            size: 8,
            reference_lines: 2,
        }
    }
}

/// What to translate: the Segments, the Languages they go between, and how they are batched.
struct TranslationJob<'a> {
    segments: &'a [Segment],
    languages: LanguagePair,
    batching: Batching,
}

#[derive(Debug, Clone, Serialize)]
pub struct Translation {
    phases: Vec<PhaseTiming>,
}

pub async fn run_translate<R: Runtime>(
    app: &AppHandle<R>,
    processes: &Processes,
    llama: &Path,
    settings: &ModelSettings,
    languages: LanguagePair,
    ready_timeout: Duration,
    mut phases: Phases,
) -> Result<Translation, Failure> {
    let model = settings.ready_path(ModelSlot::Translation)?;
    let project = app.state::<CurrentProject>();
    let (generation, transcript) = project.snapshot()?;
    let job = TranslationJob {
        segments: &transcript.segments,
        languages,
        batching: Batching::default(),
    };
    let port = free_port()?;
    let args = [
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
    ];

    enter(app, &mut phases, "load");
    let (mut events, pid) =
        processes
            .spawn(app, llama, &args)
            .map_err(|detail| Failure::StepFailed {
                step: "translate".to_string(),
                detail,
            })?;
    let exited = Arc::new(AtomicBool::new(false));
    async_runtime::spawn({
        let exited = Arc::clone(&exited);
        async move {
            while let Some(event) = events.recv().await {
                if matches!(event, CommandEvent::Terminated(_)) {
                    exited.store(true, Ordering::SeqCst);
                }
            }
        }
    });

    let client = reqwest::Client::new();
    let base_url = format!("http://127.0.0.1:{port}");
    let result = translate_once_ready(
        app,
        &client,
        &base_url,
        ready_timeout,
        || exited.load(Ordering::SeqCst),
        &job,
        &mut phases,
    )
    .await;
    processes.kill(pid);
    project.write_translations(generation, languages, result?);
    project::announce(app);
    Ok(Translation {
        phases: phases.finish(),
    })
}

/// Waits for llama-server to load its Model, then translates every Segment in the translate Phase.
async fn translate_once_ready<R: Runtime>(
    app: &AppHandle<R>,
    client: &reqwest::Client,
    base_url: &str,
    ready_timeout: Duration,
    has_exited: impl Fn() -> bool,
    job: &TranslationJob<'_>,
    phases: &mut Phases,
) -> Result<Vec<Segment>, Failure> {
    wait_until_ready(client, base_url, ready_timeout, has_exited).await?;
    enter(app, phases, "translate");
    translate_segments(&TranslationModel::new(base_url), job, |percent| {
        report(app, "translate", Some(percent))
    })
    .await
}

/// A port the OS just handed out and released; llama-server binds it moments later.
fn free_port() -> Result<u16, Failure> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

async fn wait_until_ready(
    client: &reqwest::Client,
    base_url: &str,
    timeout: Duration,
    has_exited: impl Fn() -> bool,
) -> Result<(), Failure> {
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

/// Translates the Segments Batch by Batch, each carrying the last lines translated before it.
async fn translate_segments(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    on_progress: impl Fn(u8),
) -> Result<Vec<Segment>, Failure> {
    let mut translated: Vec<Segment> = Vec::with_capacity(job.segments.len());
    let mut done_pairs: Vec<(String, String)> = Vec::new();
    for batch in job.segments.chunks(job.batching.size) {
        let first = translated.len();
        let reference_start = done_pairs
            .len()
            .saturating_sub(job.batching.reference_lines);
        let reference = &done_pairs[reference_start..];
        let answer = model
            .translate_batch(&BatchRequest {
                languages: job.languages,
                lines: batch
                    .iter()
                    .enumerate()
                    .map(|(offset, segment)| (first + offset, segment.text.as_str()))
                    .collect(),
                reference,
            })
            .await?;
        for (offset, segment) in batch.iter().enumerate() {
            let index = first + offset;
            let translation = answer.get(&index).ok_or_else(|| Failure::LlamaRequest {
                detail: format!("answered without line {index}"),
            })?;
            done_pairs.push((segment.text.clone(), translation.clone()));
            translated.push(Segment {
                translation: Some(translation.clone()),
                ..segment.clone()
            });
        }
        on_progress((translated.len() * 100 / job.segments.len()) as u8);
    }
    Ok(translated)
}

#[tauri::command]
pub async fn translate(
    app: AppHandle,
    source: Language,
    target: Language,
) -> Result<Translation, Failure> {
    let phases = Phases::start("translate", "prepare");
    report(&app, "prepare", None);
    let [llama] = components::find_ready_executables(Resolver::from_app(&app)?, ["llama"]).await?;
    let settings = models::load_settings(&app)?;
    let processes = app.state::<Processes>().inner().clone();
    run_translate(
        &app,
        &processes,
        &llama,
        &settings,
        LanguagePair { source, target },
        READY_TIMEOUT,
        phases,
    )
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use serde_json::json;

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

    use super::*;
    use crate::project::{Project, SegmentField};
    use crate::test_support::{FakeHttp, Response, TempDir};
    use crate::transcript::Transcript;

    fn segment(start_ms: u64, end_ms: u64, text: &str) -> Segment {
        Segment {
            start_ms,
            end_ms,
            text: text.to_string(),
            translation: None,
        }
    }

    fn project_of(segments: Vec<Segment>) -> Project {
        Project {
            media: None,
            language: Language::TraditionalChinese,
            translation_language: None,
            transcript: Transcript { segments },
        }
    }

    fn completion(content: &str) -> Response {
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

    fn mock_app() -> tauri::App<MockRuntime> {
        mock_builder()
            .plugin(tauri_plugin_shell::init())
            .manage(CurrentProject::default())
            .build(mock_context(noop_assets()))
            .unwrap()
    }

    /// A llama-server that answers `/health` as not ready `loading` times first,
    /// then answers each Batch through `answer` and keeps every request it was sent.
    struct FakeLlama {
        server: FakeHttp,
        log: Arc<Mutex<Vec<String>>>,
        requests: Arc<Mutex<Vec<serde_json::Value>>>,
    }

    type Lines = Vec<(usize, String)>;

    impl FakeLlama {
        fn serve(
            loading: usize,
            answer: impl Fn(Lines) -> Lines + Send + Sync + 'static,
        ) -> FakeLlama {
            let log = Arc::new(Mutex::new(Vec::new()));
            let requests = Arc::new(Mutex::new(Vec::new()));
            let (seen, sent) = (Arc::clone(&log), Arc::clone(&requests));
            let health_checks = Mutex::new(0);
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
                let translations: Vec<_> = answer(batch_lines(&body))
                    .into_iter()
                    .map(|(index, text)| json!({"index": index, "text": text}))
                    .collect();
                sent.lock().unwrap().push(body);
                completion(&json!({"translations": translations}).to_string())
            });
            FakeLlama {
                server,
                log,
                requests,
            }
        }

        /// Answers each line as its text prefixed with `EN:`.
        fn echo(loading: usize) -> FakeLlama {
            FakeLlama::serve(loading, |lines| {
                lines
                    .into_iter()
                    .map(|(index, text)| (index, format!("EN:{text}")))
                    .collect()
            })
        }

        fn model(&self) -> TranslationModel {
            TranslationModel::new(&self.server.base_url)
        }

        fn user_messages(&self) -> Vec<String> {
            self.requests
                .lock()
                .unwrap()
                .iter()
                .map(|body| body["messages"][1]["content"].as_str().unwrap().to_string())
                .collect()
        }
    }

    /// The Batch a request carries: the JSON on the last line of its user message.
    fn batch_lines(body: &serde_json::Value) -> Lines {
        let user = body["messages"][1]["content"].as_str().unwrap();
        let lines: Vec<serde_json::Value> =
            serde_json::from_str(user.lines().last().unwrap()).unwrap();
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

    fn job(segments: &[Segment]) -> TranslationJob<'_> {
        TranslationJob {
            segments,
            languages: to_english(),
            batching: Batching::default(),
        }
    }

    // @behavior TL-001
    #[tokio::test]
    async fn keeps_each_segments_times_and_adds_its_translation() {
        let llama = FakeLlama::echo(0);
        let segments = vec![
            segment(0, 1_000, "大家好"),
            segment(1_000, 2_000, "今天天氣很好"),
        ];

        let translated = translate_segments(&llama.model(), &job(&segments), |_| {})
            .await
            .unwrap();

        assert_eq!(
            translated,
            vec![
                Segment {
                    translation: Some("EN:大家好".to_string()),
                    ..segment(0, 1_000, "大家好")
                },
                Segment {
                    translation: Some("EN:今天天氣很好".to_string()),
                    ..segment(1_000, 2_000, "今天天氣很好")
                },
            ]
        );
    }

    fn to_english() -> LanguagePair {
        LanguagePair {
            source: Language::TraditionalChinese,
            target: Language::English,
        }
    }

    /// The system prompt the Model is sent when translating between `languages`.
    async fn instruction_for(languages: LanguagePair) -> String {
        let llama = FakeLlama::echo(0);
        let segments = [segment(0, 1_000, "大家好")];

        translate_segments(
            &llama.model(),
            &TranslationJob {
                languages,
                ..job(&segments)
            },
            |_| {},
        )
        .await
        .unwrap();

        let requests = llama.requests.lock().unwrap();
        requests[0]["messages"][0]["content"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn language(code: &str) -> Language {
        serde_json::from_value(json!(code)).unwrap()
    }

    // @behavior TL-013
    #[tokio::test]
    async fn asks_the_model_for_the_target_language() {
        let instruction = instruction_for(LanguagePair {
            source: Language::TraditionalChinese,
            target: language("ja"),
        })
        .await;

        assert!(instruction.contains("into Japanese"), "{instruction}");
    }

    // @behavior TL-014
    #[tokio::test]
    async fn asks_the_model_to_translate_from_the_source_language() {
        let instruction = instruction_for(LanguagePair {
            source: language("ja"),
            target: Language::English,
        })
        .await;

        assert!(instruction.contains("Japanese subtitle"), "{instruction}");
    }

    fn three_segments() -> Vec<Segment> {
        vec![
            segment(0, 1_000, "大家好"),
            segment(1_000, 2_000, "今天天氣很好"),
            segment(2_000, 3_000, "我們出發吧"),
        ]
    }

    fn in_batches_of_two(segments: &[Segment]) -> TranslationJob<'_> {
        TranslationJob {
            batching: Batching {
                size: 2,
                reference_lines: 2,
            },
            ..job(segments)
        }
    }

    // @behavior TL-017
    #[tokio::test]
    async fn translates_in_batches() {
        let llama = FakeLlama::echo(0);
        let segments = three_segments();

        translate_segments(&llama.model(), &in_batches_of_two(&segments), |_| {})
            .await
            .unwrap();

        let sizes: Vec<usize> = llama
            .requests
            .lock()
            .unwrap()
            .iter()
            .map(|body| batch_lines(body).len())
            .collect();
        assert_eq!(sizes, vec![2, 1]);
    }

    // @behavior TL-018
    #[tokio::test]
    async fn matches_each_translation_by_its_index() {
        let llama = FakeLlama::serve(0, |lines| {
            lines
                .into_iter()
                .rev()
                .map(|(index, text)| (index, format!("EN:{text}")))
                .collect()
        });
        let segments = three_segments();

        let translated = translate_segments(&llama.model(), &job(&segments), |_| {})
            .await
            .unwrap();

        let translations: Vec<_> = translated
            .iter()
            .map(|segment| segment.translation.clone().unwrap())
            .collect();
        assert_eq!(
            translations,
            vec!["EN:大家好", "EN:今天天氣很好", "EN:我們出發吧"]
        );
    }

    // @behavior TL-019
    #[tokio::test]
    async fn carries_the_previous_batch_as_reference() {
        let llama = FakeLlama::echo(0);
        let segments = three_segments();

        translate_segments(&llama.model(), &in_batches_of_two(&segments), |_| {})
            .await
            .unwrap();

        let second = &llama.user_messages()[1];
        assert!(
            second.contains("- 大家好 => EN:大家好\n- 今天天氣很好 => EN:今天天氣很好"),
            "{second}"
        );
    }

    // @behavior TL-010
    #[tokio::test]
    async fn translates_the_project_as_edited() {
        let llama = FakeLlama::echo(0);
        let project = CurrentProject::default();
        project.replace(project_of(vec![segment(0, 1_000, "竹子搞")]));
        project
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();
        let (generation, transcript) = project.snapshot().unwrap();

        let translated = translate_segments(&llama.model(), &job(&transcript.segments), |_| {})
            .await
            .unwrap();
        project.write_translations(generation, to_english(), translated);

        let view = project.view().unwrap();
        let segment = &view.segments()[0];
        assert_eq!(
            (segment.text.as_str(), segment.translation.as_deref()),
            ("逐字稿", Some("EN:逐字稿"))
        );
    }

    // @behavior TL-002
    #[tokio::test]
    async fn sends_no_segment_before_the_model_is_loaded() {
        let llama = FakeLlama::echo(2);
        let segments = [segment(0, 1_000, "大家好")];

        wait_until_ready(
            &reqwest::Client::new(),
            &llama.server.base_url,
            Duration::from_secs(5),
            || false,
        )
        .await
        .unwrap();
        translate_segments(&llama.model(), &job(&segments), |_| {})
            .await
            .unwrap();

        let log = llama.log.lock().unwrap();
        let first_ready = log
            .iter()
            .position(|entry| entry == "health ready")
            .unwrap();
        let first_chat = log.iter().position(|entry| entry == "chat").unwrap();
        assert!(first_ready < first_chat);
    }

    // @behavior TL-003
    #[tokio::test]
    async fn refuses_without_a_translation_model() {
        let dir = TempDir::new("tl-no-model");
        let app = mock_app();
        let record = dir.path().join("processes.json");
        let processes = Processes::new(record.clone());

        app.state::<CurrentProject>()
            .replace(project_of(vec![segment(0, 1_000, "大家好")]));

        let result = run_translate(
            app.handle(),
            &processes,
            Path::new("/bin/sleep"),
            &ModelSettings::default(),
            to_english(),
            Duration::from_secs(1),
            Phases::start("translate", "prepare"),
        )
        .await;

        assert!(result.is_err());
        assert!(!record.exists());
    }

    // @behavior TL-004
    #[cfg(unix)]
    #[tokio::test]
    async fn stops_llama_server_when_translation_gives_up() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new("tl-stop");
        let llama = dir.path().join("llama-server");
        let pid_file = dir.path().join("llama.pid");
        std::fs::write(
            &llama,
            format!(
                "#!/bin/sh\necho $$ > '{}'\nexec sleep 30\n",
                pid_file.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&llama, std::fs::Permissions::from_mode(0o755)).unwrap();
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Translation, dir.file("qwen3-4b.gguf"));
        let app = mock_app();
        let processes = Processes::new(dir.path().join("processes.json"));

        app.state::<CurrentProject>()
            .replace(project_of(vec![segment(0, 1_000, "大家好")]));

        let result = run_translate(
            app.handle(),
            &processes,
            &llama,
            &settings,
            to_english(),
            Duration::from_secs(1),
            Phases::start("translate", "prepare"),
        )
        .await;

        assert!(result.is_err());
        let pid = std::fs::read_to_string(pid_file).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let ps = std::process::Command::new("ps")
            .args(["-p", pid.trim(), "-o", "stat="])
            .output()
            .unwrap();
        let state = String::from_utf8_lossy(&ps.stdout);
        assert!(
            state.trim().is_empty() || state.starts_with('Z'),
            "llama-server still running: {state}"
        );
    }

    // @behavior TL-007
    #[tokio::test]
    async fn answers_how_long_each_phase_took() {
        let llama = FakeLlama::echo(2);
        let app = mock_app();
        let mut phases = Phases::start("translate", "load");
        let segments = [
            segment(0, 1_000, "大家好"),
            segment(1_000, 2_000, "今天天氣很好"),
        ];

        translate_once_ready(
            app.handle(),
            &reqwest::Client::new(),
            &llama.server.base_url,
            Duration::from_secs(5),
            || false,
            &job(&segments),
            &mut phases,
        )
        .await
        .unwrap();

        let names: Vec<_> = phases.finish().iter().map(|timing| timing.phase).collect();
        assert_eq!(names, vec!["load", "translate"]);
    }

    /// Runs a real llama-server:
    /// `TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<gguf> cargo test -- --ignored`
    #[tokio::test]
    #[ignore = "needs llama-server and a translation Model"]
    async fn translates_with_a_real_llama_server() {
        let llama = PathBuf::from(std::env::var("TSUZURI_E2E_LLAMA").unwrap());
        let mut settings = ModelSettings::default();
        settings.choose(
            ModelSlot::Translation,
            PathBuf::from(std::env::var("TSUZURI_E2E_TRANSLATION_MODEL").unwrap()),
        );
        let dir = TempDir::new("tl-e2e");
        let app = mock_app();
        let processes = Processes::new(dir.path().join("processes.json"));
        app.state::<CurrentProject>().replace(project_of(vec![
            segment(0, 1_000, "大家好"),
            segment(1_000, 3_000, "今天天氣很好"),
        ]));

        let translated = run_translate(
            app.handle(),
            &processes,
            &llama,
            &settings,
            to_english(),
            READY_TIMEOUT,
            Phases::start("translate", "prepare"),
        )
        .await
        .unwrap();

        let segments = app
            .state::<CurrentProject>()
            .view()
            .unwrap()
            .segments()
            .to_vec();
        for segment in &segments {
            println!(
                "{} -> {}",
                segment.text,
                segment.translation.as_deref().unwrap_or_default()
            );
        }
        println!("phases {:?}", translated.phases);
        assert!(segments.iter().all(|segment| segment.translation.is_some()));
    }
}

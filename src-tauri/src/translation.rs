use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::json;
use tauri::async_runtime;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;

use crate::components::{self, Resolver};
use crate::models::{self, ModelSettings, ModelSlot};
use crate::pipeline::report;
use crate::processes::Processes;
use crate::transcript::Segment;

/// How long llama-server may take to load its Model before translation gives up.
const READY_TIMEOUT: Duration = Duration::from_secs(180);
const HEALTH_POLL: Duration = Duration::from_millis(500);
/// Each request carries one subtitle line, so a small context keeps the KV cache inside 4 GB of VRAM.
const CONTEXT_SIZE: &str = "4096";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranslatedSegment {
    start_ms: u64,
    end_ms: u64,
    text: String,
    translation: String,
}

pub async fn run_translate<R: Runtime>(
    app: &AppHandle<R>,
    processes: &Processes,
    llama: &Path,
    settings: &ModelSettings,
    segments: &[Segment],
    target: &str,
    ready_timeout: Duration,
) -> Result<Vec<TranslatedSegment>, String> {
    let model = settings
        .require(ModelSlot::Translation)
        .map_err(|error| error.to_string())?;
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
        "--no-webui".to_string(),
    ];

    report(app, "load", 0);
    let (mut events, pid) = processes.spawn(app, llama, &args)?;
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
    let result = async {
        wait_until_ready(&client, &base_url, ready_timeout, || {
            exited.load(Ordering::SeqCst)
        })
        .await?;
        translate_segments(&client, &base_url, segments, target, |percent| {
            report(app, "translate", percent)
        })
        .await
    }
    .await;
    processes.kill(pid);
    result
}

/// A port the OS just handed out and released; llama-server binds it moments later.
fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| error.to_string())
}

async fn wait_until_ready(
    client: &reqwest::Client,
    base_url: &str,
    timeout: Duration,
    has_exited: impl Fn() -> bool,
) -> Result<(), String> {
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
            return Err("llama-server exited before its Model was loaded".to_string());
        }
        if Instant::now() >= deadline {
            return Err("llama-server did not load its Model in time".to_string());
        }
        tokio::time::sleep(HEALTH_POLL).await;
    }
}

async fn translate_segments(
    client: &reqwest::Client,
    base_url: &str,
    segments: &[Segment],
    target: &str,
    on_progress: impl Fn(u8),
) -> Result<Vec<TranslatedSegment>, String> {
    let instruction = format!(
        "You translate subtitles into {target}. Reply with only the translation of the user's line, without quotes or notes."
    );
    let mut translated = Vec::with_capacity(segments.len());
    for (index, segment) in segments.iter().enumerate() {
        let request = json!({
            "messages": [
                {"role": "system", "content": instruction},
                {"role": "user", "content": segment.text},
            ],
            "temperature": 0.2,
            "chat_template_kwargs": {"enable_thinking": false},
        });
        let response: serde_json::Value = client
            .post(format!("{base_url}/v1/chat/completions"))
            .json(&request)
            .send()
            .await
            .and_then(|response| response.error_for_status())
            .map_err(|error| error.to_string())?
            .json()
            .await
            .map_err(|error| error.to_string())?;
        let translation = response["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("llama-server answered without a translation")?
            .trim()
            .to_string();
        translated.push(TranslatedSegment {
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            text: segment.text.clone(),
            translation,
        });
        on_progress(((index + 1) * 100 / segments.len()) as u8);
    }
    Ok(translated)
}

#[tauri::command]
pub async fn translate(
    app: AppHandle,
    segments: Vec<Segment>,
    target: String,
) -> Result<Vec<TranslatedSegment>, String> {
    let resolver = Resolver::of(&app)?;
    let llama = components::ready_executable("llama", &resolver)?;
    let settings = models::load_settings(&app)?;
    let processes = app.state::<Processes>().inner().clone();
    run_translate(
        &app,
        &processes,
        &llama,
        &settings,
        &segments,
        &target,
        READY_TIMEOUT,
    )
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

    use super::*;
    use crate::test_support::{FakeHttp, Response, TempDir};

    fn segment(start_ms: u64, end_ms: u64, text: &str) -> Segment {
        Segment {
            start_ms,
            end_ms,
            text: text.to_string(),
        }
    }

    fn completion(content: &str) -> Response {
        Response {
            status: 200,
            body: json!({"choices": [{"message": {"role": "assistant", "content": content}}]})
                .to_string()
                .into_bytes(),
        }
    }

    fn mock_app() -> tauri::App<MockRuntime> {
        mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(mock_context(noop_assets()))
            .unwrap()
    }

    /// Echoes each line back prefixed with `EN:`, answering `/health` as not ready `loading` times first.
    fn fake_llama(loading: usize) -> (FakeHttp, Arc<Mutex<Vec<String>>>) {
        let log = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&log);
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
            completion(&format!(
                "EN:{}",
                body["messages"][1]["content"].as_str().unwrap()
            ))
        });
        (server, log)
    }

    // @behavior TL-001
    #[tokio::test]
    async fn keeps_each_segments_times_and_adds_its_translation() {
        let (server, _) = fake_llama(0);
        let segments = vec![
            segment(0, 1_000, "大家好"),
            segment(1_000, 2_000, "今天天氣很好"),
        ];

        let translated = translate_segments(
            &reqwest::Client::new(),
            &server.base_url,
            &segments,
            "English",
            |_| {},
        )
        .await
        .unwrap();

        assert_eq!(
            translated,
            vec![
                TranslatedSegment {
                    start_ms: 0,
                    end_ms: 1_000,
                    text: "大家好".to_string(),
                    translation: "EN:大家好".to_string()
                },
                TranslatedSegment {
                    start_ms: 1_000,
                    end_ms: 2_000,
                    text: "今天天氣很好".to_string(),
                    translation: "EN:今天天氣很好".to_string()
                },
            ]
        );
    }

    // @behavior TL-002
    #[tokio::test]
    async fn sends_no_segment_before_the_model_is_loaded() {
        let (server, log) = fake_llama(2);
        let client = reqwest::Client::new();

        wait_until_ready(&client, &server.base_url, Duration::from_secs(5), || false)
            .await
            .unwrap();
        translate_segments(
            &client,
            &server.base_url,
            &[segment(0, 1_000, "大家好")],
            "English",
            |_| {},
        )
        .await
        .unwrap();

        let log = log.lock().unwrap();
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

        let result = run_translate(
            app.handle(),
            &processes,
            Path::new("/bin/sleep"),
            &ModelSettings::default(),
            &[segment(0, 1_000, "大家好")],
            "English",
            Duration::from_secs(1),
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

        let result = run_translate(
            app.handle(),
            &processes,
            &llama,
            &settings,
            &[segment(0, 1_000, "大家好")],
            "English",
            Duration::from_secs(1),
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
        let segments = [
            segment(0, 1_000, "大家好"),
            segment(1_000, 3_000, "今天天氣很好"),
        ];

        let translated = run_translate(
            app.handle(),
            &processes,
            &llama,
            &settings,
            &segments,
            "English",
            READY_TIMEOUT,
        )
        .await
        .unwrap();

        for segment in &translated {
            println!("{} -> {}", segment.text, segment.translation);
        }
        assert_eq!(translated.len(), 2);
    }
}

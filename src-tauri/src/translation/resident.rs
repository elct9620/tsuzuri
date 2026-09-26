use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tokio::sync::Mutex;

use super::llama::{free_port, wait_until_ready, CHAT_TEMPLATE_KWARGS, CONTEXT_SIZE, MODEL_NAME};
use crate::failure::Failure;
use crate::steps::{StepEvent, Steps};

const STATUS_POLL: Duration = Duration::from_millis(250);
/// How long unloading may take; llama-server forces its Model's process to end after ten seconds.
const UNLOAD_TIMEOUT: Duration = Duration::from_secs(15);
const PRESET_FILE: &str = "llama-models.ini";

/// The Resident llama-server: llama-server in router mode, kept running between translations
/// and loading the translation Model only while one needs it.
#[derive(Clone, Default)]
pub struct ResidentLlama {
    router: Arc<Mutex<Option<Router>>>,
    /// Counts the translations that asked for the Model, so a release an earlier one scheduled
    /// does not unload it under a later one.
    requests: Arc<AtomicU64>,
    #[cfg(test)]
    port: Option<u16>,
}

/// The router process running now, and what it was started with.
struct Router {
    pid: u32,
    base_url: String,
    has_exited: Arc<AtomicBool>,
    llama: PathBuf,
    model: PathBuf,
}

#[derive(Deserialize)]
struct ModelList {
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
    status: ModelStatus,
}

#[derive(Deserialize)]
struct ModelStatus {
    value: String,
    #[serde(default)]
    failed: bool,
}

impl ResidentLlama {
    /// Starts the router for `model` unless it already runs with it, loading no Model.
    pub async fn start(
        &self,
        steps: &impl Steps,
        llama: &Path,
        model: &Path,
        preset_dir: &Path,
        timeout: Duration,
    ) -> Result<(), Failure> {
        let mut router = self.router.lock().await;
        self.ensure_router(&mut router, steps, llama, model, preset_dir, timeout)
            .await
    }

    /// Loads the translation Model, starting the router first when it is not running, and
    /// answers where to send requests once the Model is loaded.
    pub async fn load_model(
        &self,
        steps: &impl Steps,
        llama: &Path,
        model: &Path,
        preset_dir: &Path,
        timeout: Duration,
    ) -> Result<String, Failure> {
        self.requests.fetch_add(1, Ordering::SeqCst);
        let mut router = self.router.lock().await;
        self.ensure_router(&mut router, steps, llama, model, preset_dir, timeout)
            .await?;
        let running_router = router.as_ref().expect("the router was just started");
        request_load(
            &running_router.base_url,
            timeout,
            &running_router.has_exited,
        )
        .await?;
        Ok(running_router.base_url.clone())
    }

    /// Unloads the Model once `keep` passes, unless another translation asks for it first.
    pub async fn release_after(&self, keep: Duration) {
        if keep.is_zero() {
            self.release().await;
            return;
        }
        let requests_now = self.requests.load(Ordering::SeqCst);
        let resident = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(keep).await;
            if resident.requests.load(Ordering::SeqCst) == requests_now {
                resident.release().await;
            }
        });
    }

    /// Unloads the Model now, returning once the router reports it unloaded.
    pub async fn release(&self) {
        if let Err(failure) = self.unload().await {
            log::warn!("could not unload the translation Model: {failure:?}");
        }
    }

    /// Frees the memory the Model holds before another Model loads: unloads it, and stops the
    /// router when it cannot, however long the Model was to be kept.
    pub async fn make_room(&self, steps: &impl Steps) {
        if let Err(failure) = self.unload().await {
            log::warn!("stopping llama-server, which could not unload its Model: {failure:?}");
            self.stop(steps).await;
        }
    }

    async fn unload(&self) -> Result<(), Failure> {
        let router = self.router.lock().await;
        match router.as_ref() {
            Some(running) if !running.has_exited.load(Ordering::SeqCst) => {
                request_unload(&running.base_url).await
            }
            _ => Ok(()),
        }
    }

    /// Stops the router and the Model it holds.
    pub async fn stop(&self, steps: &impl Steps) {
        if let Some(running) = self.router.lock().await.take() {
            steps.stop(running.pid);
        }
    }

    async fn ensure_router(
        &self,
        router: &mut Option<Router>,
        steps: &impl Steps,
        llama: &Path,
        model: &Path,
        preset_dir: &Path,
        timeout: Duration,
    ) -> Result<(), Failure> {
        let is_usable = router.as_ref().is_some_and(|running_router| {
            !running_router.has_exited.load(Ordering::SeqCst)
                && running_router.llama == llama
                && running_router.model == model
        });
        if is_usable {
            return Ok(());
        }
        if let Some(stale) = router.take() {
            steps.stop(stale.pid);
        }
        let preset = preset_dir.join(PRESET_FILE);
        std::fs::create_dir_all(preset_dir)?;
        std::fs::write(&preset, preset_text(model))?;
        let port = self.port()?;
        let (events, pid) = steps
            .start(llama, &router_args(&preset, port))
            .map_err(|detail| Failure::StepFailed {
                step: "translate".to_string(),
                detail,
            })?;
        let has_exited = watch_exit(events);
        let base_url = format!("http://127.0.0.1:{port}");
        let has_exited_now = Arc::clone(&has_exited);
        if let Err(failure) =
            wait_until_ready(&base_url, timeout, || has_exited_now.load(Ordering::SeqCst)).await
        {
            steps.stop(pid);
            return Err(failure);
        }
        *router = Some(Router {
            pid,
            base_url,
            has_exited,
            llama: llama.to_path_buf(),
            model: model.to_path_buf(),
        });
        Ok(())
    }

    #[cfg(not(test))]
    fn port(&self) -> Result<u16, Failure> {
        free_port()
    }

    #[cfg(test)]
    fn port(&self) -> Result<u16, Failure> {
        self.port.map_or_else(free_port, Ok)
    }

    /// A Resident llama-server whose router is told to listen on `port`, where a test answers.
    #[cfg(test)]
    pub fn with_port(port: u16) -> ResidentLlama {
        ResidentLlama {
            port: Some(port),
            ..ResidentLlama::default()
        }
    }
}

/// The preset naming the translation Model, loaded with the context and chat template every translation uses.
fn preset_text(model: &Path) -> String {
    format!(
        "version = 1\n\n[{MODEL_NAME}]\nmodel = {}\nc = {CONTEXT_SIZE}\nchat-template-kwargs = {CHAT_TEMPLATE_KWARGS}\n",
        model.display()
    )
}

/// How the router is started: from `preset`, on a local `port`, loading one Model at a time and only when asked.
fn router_args(preset: &Path, port: u16) -> Vec<String> {
    vec![
        "--models-preset".to_string(),
        preset.to_string_lossy().into_owned(),
        "--models-max".to_string(),
        "1".to_string(),
        "--no-models-autoload".to_string(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--no-webui".to_string(),
    ]
}

/// A flag set once the process behind `events` exits.
fn watch_exit(mut events: tokio::sync::mpsc::Receiver<StepEvent>) -> Arc<AtomicBool> {
    let has_exited = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&has_exited);
    tokio::spawn(async move {
        while let Some(event) = events.recv().await {
            if matches!(event, StepEvent::Exit(_)) {
                flag.store(true, Ordering::SeqCst);
            }
        }
        flag.store(true, Ordering::SeqCst);
    });
    has_exited
}

/// The translation Model's status as the router reports it.
async fn fetch_model_status(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<ModelStatus, Failure> {
    let list: ModelList = client
        .get(format!("{base_url}/models"))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(request_failure)?
        .json()
        .await
        .map_err(request_failure)?;
    list.data
        .into_iter()
        .find(|entry| entry.id == MODEL_NAME)
        .map(|entry| entry.status)
        .ok_or_else(|| Failure::LlamaRequest {
            detail: format!("the router lists no {MODEL_NAME} Model"),
        })
}

/// Asks the router to load the translation Model and waits until it reports it loaded.
async fn request_load(
    base_url: &str,
    timeout: Duration,
    has_exited: &AtomicBool,
) -> Result<(), Failure> {
    let client = reqwest::Client::new();
    if fetch_model_status(&client, base_url).await?.value != "loaded" {
        client
            .post(format!("{base_url}/models/load"))
            .json(&json!({ "model": MODEL_NAME }))
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(request_failure)?;
    }
    let deadline = Instant::now() + timeout;
    loop {
        let status = fetch_model_status(&client, base_url).await?;
        match status.value.as_str() {
            "loaded" => return Ok(()),
            "unloaded" if status.failed => return Err(Failure::LlamaExited),
            _ => {}
        }
        if has_exited.load(Ordering::SeqCst) {
            return Err(Failure::LlamaExited);
        }
        if Instant::now() >= deadline {
            return Err(Failure::LlamaTimedOut);
        }
        tokio::time::sleep(STATUS_POLL).await;
    }
}

/// Asks the router to unload the translation Model and waits until it reports it unloaded.
async fn request_unload(base_url: &str) -> Result<(), Failure> {
    let client = reqwest::Client::new();
    if fetch_model_status(&client, base_url).await?.value == "unloaded" {
        return Ok(());
    }
    client
        .post(format!("{base_url}/models/unload"))
        .json(&json!({ "model": MODEL_NAME }))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(request_failure)?;
    let deadline = Instant::now() + UNLOAD_TIMEOUT;
    while fetch_model_status(&client, base_url).await?.value != "unloaded" {
        if Instant::now() >= deadline {
            return Err(Failure::LlamaTimedOut);
        }
        tokio::time::sleep(STATUS_POLL).await;
    }
    Ok(())
}

fn request_failure(error: reqwest::Error) -> Failure {
    Failure::LlamaRequest {
        detail: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex as StdMutex;

    use tokio::sync::mpsc::{channel, Sender};

    use super::*;
    use crate::test_support::TempDir;
    use crate::translation::fake_llama::{FakeLlama, Replies};

    const TIMEOUT: Duration = Duration::from_secs(5);

    /// Steps that record each start and stop; a started process runs until `exit` is called.
    #[derive(Default)]
    struct RecordedSteps {
        started_args: StdMutex<Vec<Vec<String>>>,
        stopped_pids: StdMutex<Vec<u32>>,
        running_senders: StdMutex<Vec<Sender<StepEvent>>>,
    }

    impl RecordedSteps {
        fn exit(&self) {
            self.running_senders.lock().unwrap().clear();
        }

        fn start_count(&self) -> usize {
            self.started_args.lock().unwrap().len()
        }
    }

    impl Steps for RecordedSteps {
        fn start(
            &self,
            _program: &Path,
            args: &[String],
        ) -> Result<(tokio::sync::mpsc::Receiver<StepEvent>, u32), String> {
            let (sender, events) = channel(8);
            self.running_senders.lock().unwrap().push(sender);
            let mut started_args = self.started_args.lock().unwrap();
            started_args.push(args.to_vec());
            Ok((events, started_args.len() as u32))
        }

        fn stop(&self, pid: u32) {
            self.stopped_pids.lock().unwrap().push(pid);
        }

        fn stop_started(&self) {}
    }

    /// A Resident llama-server whose router the fake answers for, with the Steps that start it.
    struct Fixture {
        llama: FakeLlama,
        resident: ResidentLlama,
        steps: RecordedSteps,
        dir: TempDir,
    }

    impl Fixture {
        fn new(name: &str, replies: Replies) -> Fixture {
            let llama = FakeLlama::serve(replies);
            let port = llama
                .base_url()
                .rsplit(':')
                .next()
                .unwrap()
                .parse()
                .unwrap();
            Fixture {
                llama,
                resident: ResidentLlama::with_port(port),
                steps: RecordedSteps::default(),
                dir: TempDir::new(name),
            }
        }

        fn model(&self) -> PathBuf {
            self.dir.path().join("qwen3-4b.gguf")
        }

        async fn start(&self) -> Result<(), Failure> {
            self.resident
                .start(
                    &self.steps,
                    Path::new("llama-server"),
                    &self.model(),
                    self.dir.path(),
                    TIMEOUT,
                )
                .await
        }

        async fn load_model(&self) -> Result<String, Failure> {
            self.resident
                .load_model(
                    &self.steps,
                    Path::new("llama-server"),
                    &self.model(),
                    self.dir.path(),
                    TIMEOUT,
                )
                .await
        }

        fn log(&self) -> Vec<String> {
            self.llama.log.lock().unwrap().clone()
        }
    }

    // @behavior TL-067
    #[tokio::test]
    async fn starts_in_router_mode_with_a_preset_naming_the_model() {
        let fixture = Fixture::new("resident-start", Replies::default());

        fixture.start().await.unwrap();

        let preset = fixture.dir.path().join(PRESET_FILE);
        let args = fixture.steps.started_args.lock().unwrap()[0].clone();
        let flags: Vec<&str> = args.iter().map(String::as_str).collect();
        assert!(flags
            .windows(2)
            .any(|pair| pair == ["--models-preset", &preset.to_string_lossy()]));
        assert!(flags.windows(2).any(|pair| pair == ["--models-max", "1"]));
        assert!(flags.contains(&"--no-models-autoload"));
        let text = std::fs::read_to_string(preset).unwrap();
        assert!(text.contains(&format!("[tsuzuri]\nmodel = {}", fixture.model().display())));
        assert!(!fixture.log().contains(&"load".to_string()));
    }

    // @behavior TL-068
    #[tokio::test]
    async fn loads_the_model_before_answering_where_to_translate() {
        let fixture = Fixture::new("resident-load", Replies::default());

        let base_url = fixture.load_model().await.unwrap();
        let model_status = fetch_model_status(&reqwest::Client::new(), &base_url)
            .await
            .unwrap();

        assert_eq!(base_url, fixture.llama.base_url());
        assert!(fixture.log().contains(&"load".to_string()));
        assert_eq!(model_status.value, "loaded");
    }

    // @behavior TL-069
    #[tokio::test]
    async fn fails_at_once_when_the_model_has_load_failure() {
        let fixture = Fixture::new(
            "resident-failed",
            Replies {
                has_load_failure: true,
                ..Replies::default()
            },
        );
        let started_at = Instant::now();

        let result = fixture.load_model().await;

        assert_eq!(result, Err(Failure::LlamaExited));
        assert!(started_at.elapsed() < TIMEOUT);
    }

    // @behavior TL-070
    #[tokio::test]
    async fn frees_the_model_once_the_kept_time_passes() {
        let fixture = Fixture::new("resident-keep", Replies::default());
        fixture.load_model().await.unwrap();

        fixture
            .resident
            .release_after(Duration::from_millis(100))
            .await;
        let unloaded_at_once = fixture.log().contains(&"unload".to_string());
        tokio::time::sleep(Duration::from_millis(600)).await;

        assert!(!unloaded_at_once);
        assert!(fixture.log().contains(&"unload".to_string()));
        assert!(fixture.steps.stopped_pids.lock().unwrap().is_empty());
    }

    // @behavior TL-071
    #[tokio::test]
    async fn keeps_the_model_for_a_translation_that_asks_in_time() {
        let fixture = Fixture::new("resident-again", Replies::default());
        fixture.load_model().await.unwrap();

        fixture
            .resident
            .release_after(Duration::from_millis(200))
            .await;
        fixture.load_model().await.unwrap();
        tokio::time::sleep(Duration::from_millis(600)).await;

        assert!(!fixture.log().contains(&"unload".to_string()));
    }

    // @behavior TL-072
    #[tokio::test]
    async fn frees_the_model_at_once_on_request() {
        let fixture = Fixture::new("resident-release", Replies::default());
        fixture.load_model().await.unwrap();

        fixture.resident.release().await;

        assert_eq!(fixture.log().last().map(String::as_str), Some("unload"));
    }

    // @behavior TL-076
    #[tokio::test]
    async fn stops_the_router_when_turned_off() {
        let fixture = Fixture::new("resident-stop", Replies::default());
        fixture.start().await.unwrap();

        fixture.resident.stop(&fixture.steps).await;

        assert_eq!(*fixture.steps.stopped_pids.lock().unwrap(), vec![1]);
    }

    // @behavior TL-078
    #[tokio::test]
    async fn stops_the_router_when_it_cannot_free_the_model() {
        let fixture = Fixture::new(
            "resident-make-room",
            Replies {
                has_unload_failure: true,
                ..Replies::default()
            },
        );
        fixture.load_model().await.unwrap();

        fixture.resident.make_room(&fixture.steps).await;

        assert_eq!(*fixture.steps.stopped_pids.lock().unwrap(), vec![1]);
    }

    // @behavior TL-073
    #[tokio::test]
    async fn starts_again_after_the_router_exited() {
        let fixture = Fixture::new("resident-restart", Replies::default());
        fixture.start().await.unwrap();

        fixture.steps.exit();
        tokio::time::sleep(Duration::from_millis(50)).await;
        fixture.load_model().await.unwrap();

        assert_eq!(fixture.steps.start_count(), 2);
    }
}

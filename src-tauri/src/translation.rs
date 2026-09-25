use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::components::{self, Resolver};
use crate::failure::Failure;
use crate::language::{Language, LanguagePair};
use crate::models::{self, ModelSettings, ModelSlot};
use crate::processes::{AppPorts, Processes};
use crate::progress::{enter, Progress};
use crate::project::{CurrentProject, TranslationSource};
use crate::steps::{StepEvent, Steps};
use crate::timing::{PhaseTiming, Phases};
use crate::transcript::Segment;

mod batching;
#[cfg(test)]
mod fake_llama;
mod model;
mod repair;
mod settings;
mod speaker_labels;

use model::TranslationModel;
pub use settings::TranslationSettings;
use speaker_labels::LabelledText;

/// How long llama-server may take to load its Model before translation gives up.
const READY_TIMEOUT: Duration = Duration::from_secs(180);
const HEALTH_POLL: Duration = Duration::from_millis(500);
/// A Batch and its reference lines fit in a small context, which keeps the KV cache inside 4 GB of VRAM.
const CONTEXT_SIZE: &str = "4096";
/// Subtitles need no reasoning, and a thinking Model spends most of each request on it.
const CHAT_TEMPLATE_KWARGS: &str = r#"{"enable_thinking":false}"#;

/// The choices the Translate panel offers for one translation.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct TranslationOptions {
    has_speaker_labels: bool,
    has_self_review: bool,
    /// The Rolling Summary's word limit, or none to keep no summary.
    summary_word_limit: Option<usize>,
}

/// Everything a translation is asked to do besides the Project it reads.
pub struct TranslationPlan {
    /// The Language to translate into; the Project's Primary Language is where it starts from.
    pub target: Language,
    pub options: TranslationOptions,
    pub settings: TranslationSettings,
}

/// What to translate: the Segments, the Languages they go between, and how.
struct TranslationJob<'a> {
    segments: &'a [Segment],
    languages: LanguagePair,
    settings: TranslationSettings,
    /// The Translation Glossary's terms, empty when none is loaded.
    glossary_terms: &'a [(String, String)],
    /// The Rolling Summary's word limit, or none when it is off.
    summary_word_limit: Option<usize>,
    /// Whether the Model reviews where each translation belongs.
    has_self_review: bool,
    /// Whether Speaker Labels are kept out of what the Model is sent.
    has_speaker_labels: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Translation {
    phases: Vec<PhaseTiming>,
}

pub async fn run_translate(
    ports: &(impl Progress + Steps),
    project: &CurrentProject,
    llama: &Path,
    model_settings: &ModelSettings,
    plan: &TranslationPlan,
    ready_timeout: Duration,
    mut phases: Phases,
) -> Result<Translation, Failure> {
    let model = model_settings.ready_path(ModelSlot::Translation)?;
    let source = project.snapshot()?;
    let languages = LanguagePair {
        source: source.language,
        target: plan.target,
    };
    let glossary_terms = project
        .reload_translation_glossary()?
        .map_or_else(Vec::new, |glossary| glossary.terms_for(languages));
    let job = TranslationJob {
        segments: &source.transcript.segments,
        languages,
        settings: plan.settings,
        has_speaker_labels: plan.options.has_speaker_labels,
        has_self_review: plan.options.has_self_review,
        summary_word_limit: plan.options.summary_word_limit,
        glossary_terms: &glossary_terms,
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

    enter(ports, &mut phases, "load");
    let (mut events, pid) = ports
        .start(llama, &args)
        .map_err(|detail| Failure::StepFailed {
            step: "translate".to_string(),
            detail,
        })?;
    let exited = Arc::new(AtomicBool::new(false));
    tokio::spawn({
        let exited = Arc::clone(&exited);
        async move {
            while let Some(event) = events.recv().await {
                if matches!(event, StepEvent::Exit(_)) {
                    exited.store(true, Ordering::SeqCst);
                }
            }
        }
    });

    let base_url = format!("http://127.0.0.1:{port}");
    let result = translate_once_ready(
        ports,
        &base_url,
        ready_timeout,
        || exited.load(Ordering::SeqCst),
        &job,
        &mut phases,
        batch_display(ports, project, &source, plan.target),
    )
    .await;
    ports.stop(pid);
    project.write_translations(&source, plan.target, result?)?;
    ports.announce_project();
    Ok(Translation {
        phases: phases.finish(),
    })
}

/// Shows the Segments translated into `target` so far on the Resource `source` was taken from,
/// and tells the webview, so each Batch appears as it finishes.
fn batch_display<'a>(
    progress: &'a impl Progress,
    project: &'a CurrentProject,
    source: &'a TranslationSource,
    target: Language,
) -> impl Fn(&[Segment]) + 'a {
    move |translated_segments| {
        project.show_translations(source, target, translated_segments);
        progress.announce_project();
    }
}

/// Waits for llama-server to load its Model, then translates every Segment in the translate Phase,
/// handing `on_batch` the Segments translated so far after each Batch.
async fn translate_once_ready(
    progress: &impl Progress,
    base_url: &str,
    ready_timeout: Duration,
    has_exited: impl Fn() -> bool,
    job: &TranslationJob<'_>,
    phases: &mut Phases,
    on_batch: impl Fn(&[Segment]),
) -> Result<Vec<Segment>, Failure> {
    wait_until_ready(&reqwest::Client::new(), base_url, ready_timeout, has_exited).await?;
    let model = TranslationModel::new(base_url);
    enter(progress, phases, "detect");
    let split_sentences = find_split_sentences(&model, job, |percent| {
        progress.report("detect", Some(percent))
    })
    .await;
    enter(progress, phases, "translate");
    translate_segments(&model, job, &split_sentences, |translated_segments| {
        progress.report(
            "translate",
            Some((translated_segments.len() * 100 / job.segments.len()) as u8),
        );
        on_batch(translated_segments);
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

/// Asks the Model for Split Sentences window by window; a window it cannot answer is skipped.
async fn find_split_sentences(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    on_progress: impl Fn(u8),
) -> Vec<Vec<usize>> {
    let windows = batching::windows(job.segments.len(), job.settings.batch_size);
    let mut split_sentences = Vec::new();
    for (done, window) in windows.iter().enumerate() {
        let lines: Vec<(usize, &str)> = window
            .clone()
            .map(|index| (index, job.segments[index].text.as_str()))
            .collect();
        match model
            .find_split_sentences(job.languages.source, &lines)
            .await
        {
            Ok(found) => {
                for sentence in found {
                    if !split_sentences.contains(&sentence) {
                        split_sentences.push(sentence);
                    }
                }
            }
            Err(failure) => log::warn!("skipped a window looking for split sentences: {failure:?}"),
        }
        on_progress(((done + 1) * 100 / windows.len()) as u8);
    }
    split_sentences
}

/// The Rolling Summary rewritten with a Batch's lines, or the previous one when the Model cannot answer.
async fn rewrite_summary(
    model: &TranslationModel,
    languages: LanguagePair,
    previous_summary: Option<String>,
    batch_pairs: &[(String, String)],
    word_limit: usize,
) -> Option<String> {
    match model
        .rewrite_summary(
            languages,
            previous_summary.as_deref(),
            batch_pairs,
            word_limit,
        )
        .await
    {
        Ok(summary) => Some(summary),
        Err(failure) => {
            log::warn!("kept the previous rolling summary: {failure:?}");
            previous_summary
        }
    }
}

/// Translates the Segments Batch by Batch, keeping each Split Sentence in one Batch,
/// each Batch carrying the last lines translated before it.
async fn translate_segments(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    split_sentences: &[Vec<usize>],
    on_batch: impl Fn(&[Segment]),
) -> Result<Vec<Segment>, Failure> {
    let labelled_texts: Vec<LabelledText> = job
        .segments
        .iter()
        .map(|segment| match job.has_speaker_labels {
            true => LabelledText::split_labels(&segment.text),
            false => LabelledText::new(&segment.text),
        })
        .collect();
    let mut translated_segments: Vec<Segment> = Vec::with_capacity(job.segments.len());
    let mut translated_pairs: Vec<(String, String)> = Vec::new();
    let mut summary: Option<String> = None;
    for range in batching::batches(job.segments.len(), job.settings.batch_size, split_sentences) {
        let lines: Vec<(usize, &str)> = range
            .clone()
            .map(|index| (index, labelled_texts[index].dialogue.as_str()))
            .collect();
        let answer =
            repair::translate_batch(model, job, &lines, &translated_pairs, summary.as_deref())
                .await?;
        for (index, dialogue) in lines {
            let translation = answer.get(&index).ok_or_else(|| Failure::LlamaRequest {
                detail: format!("answered without line {index}"),
            })?;
            translated_pairs.push((dialogue.to_string(), translation.clone()));
            translated_segments.push(Segment {
                translation: Some(labelled_texts[index].reattach(translation)),
                ..job.segments[index].clone()
            });
        }
        if let Some(word_limit) = job.summary_word_limit {
            let batch_pairs = &translated_pairs[translated_pairs.len() - range.len()..];
            summary = rewrite_summary(model, job.languages, summary, batch_pairs, word_limit).await;
        }
        on_batch(&translated_segments);
    }
    Ok(translated_segments)
}

#[tauri::command]
pub async fn translate(
    app: AppHandle,
    target: Language,
    options: TranslationOptions,
) -> Result<Translation, Failure> {
    let phases = Phases::start("translate", "prepare");
    app.report("prepare", None);
    let [llama] = components::find_ready_executables(Resolver::from_app(&app)?, ["llama"]).await?;
    let model_settings = models::load_settings(&app)?;
    let plan = TranslationPlan {
        target,
        options,
        settings: TranslationSettings::load(&models::settings_dir(&app)?)?,
    };
    let processes = app.state::<Processes>().inner().clone();
    run_translate(
        &AppPorts {
            app: &app,
            processes: &processes,
        },
        &app.state::<CurrentProject>(),
        &llama,
        &model_settings,
        &plan,
        READY_TIMEOUT,
        phases,
    )
    .await
}

#[tauri::command]
pub fn translation_settings(app: AppHandle) -> Result<TranslationSettings, Failure> {
    Ok(TranslationSettings::load(&models::settings_dir(&app)?)?)
}

#[tauri::command]
pub fn save_translation_settings(
    app: AppHandle,
    settings: TranslationSettings,
) -> Result<TranslationSettings, Failure> {
    Ok(settings.save(&models::settings_dir(&app)?)?)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use std::sync::Mutex;

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::Listener;

    use super::*;
    use crate::project::SegmentField;
    use crate::test_support::Response;
    use crate::test_support::{project_of, TempDir};
    use fake_llama::{
        completion, echo_lines, numbered_summary, review_answer, translations, FakeLlama, Lines,
        Replies,
    };

    fn segment(start_ms: u64, end_ms: u64, text: &str) -> Segment {
        Segment {
            start_ms,
            end_ms,
            speaker: None,
            text: text.to_string(),
            translation: None,
        }
    }

    fn mock_app() -> tauri::App<MockRuntime> {
        mock_builder()
            .plugin(tauri_plugin_shell::init())
            .manage(CurrentProject::default())
            .build(mock_context(noop_assets()))
            .unwrap()
    }

    /// Detects, then translates, as a job does once llama-server is ready.
    async fn detect_and_translate(llama: &FakeLlama, job: &TranslationJob<'_>) -> Vec<Segment> {
        let app = mock_app();
        translate_once_ready(
            app.handle(),
            llama.base_url(),
            Duration::from_secs(5),
            || false,
            job,
            &mut Phases::start("translate", "load"),
            |_| {},
        )
        .await
        .unwrap()
    }

    fn job(segments: &[Segment]) -> TranslationJob<'_> {
        TranslationJob {
            segments,
            languages: japanese_pair(),
            settings: TranslationSettings::default(),
            has_speaker_labels: false,
            has_self_review: false,
            summary_word_limit: None,
            glossary_terms: &[],
        }
    }

    // @behavior TL-001
    #[tokio::test]
    async fn keeps_each_segments_times_and_adds_its_translation() {
        let llama = FakeLlama::with_echo(0);
        let segments = vec![
            segment(0, 1_000, "大家好"),
            segment(1_000, 2_000, "今天天氣很好"),
        ];

        let translated_segments = translate_segments(&llama.model(), &job(&segments), &[], |_| {})
            .await
            .unwrap();

        assert_eq!(
            translated_segments,
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

    /// Echoed translations keep their Chinese, which is only left-over source text when translating into English.
    fn japanese_pair() -> LanguagePair {
        LanguagePair {
            source: Language::TraditionalChinese,
            target: Language::Japanese,
        }
    }

    /// The system prompt the Model is sent when translating between `languages`.
    async fn instruction_for(languages: LanguagePair) -> String {
        let llama = FakeLlama::with_echo(0);
        let segments = [segment(0, 1_000, "大家好")];

        translate_segments(
            &llama.model(),
            &TranslationJob {
                languages,
                ..job(&segments)
            },
            &[],
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

    fn job_in_batches_of_two(segments: &[Segment]) -> TranslationJob<'_> {
        TranslationJob {
            settings: TranslationSettings {
                batch_size: 2,
                ..TranslationSettings::default()
            },
            ..job(segments)
        }
    }

    // @behavior TL-017
    #[tokio::test]
    async fn translates_in_batches() {
        let llama = FakeLlama::with_echo(0);
        let segments = three_segments();

        translate_segments(
            &llama.model(),
            &job_in_batches_of_two(&segments),
            &[],
            |_| {},
        )
        .await
        .unwrap();

        assert_eq!(llama.batch_sizes(), vec![2, 1]);
    }

    // @behavior TL-020
    #[tokio::test]
    async fn keeps_a_split_sentence_in_one_batch() {
        let llama = FakeLlama::with_split_sentences(|window| {
            let sentences: Vec<[usize; 2]> = window
                .iter()
                .any(|(index, _)| *index == 2)
                .then_some([1, 2])
                .into_iter()
                .collect();
            json!({"clusters": sentences}).to_string()
        });
        let segments = three_segments();

        detect_and_translate(&llama, &job_in_batches_of_two(&segments)).await;

        assert_eq!(llama.batch_sizes(), vec![1, 2]);
    }

    fn five_segments() -> Vec<Segment> {
        (0..5)
            .map(|index| segment(index * 1_000, (index + 1) * 1_000, &format!("第{index}句")))
            .collect()
    }

    // @behavior TL-021
    #[tokio::test]
    async fn batches_an_overlong_split_sentence_as_usual() {
        let llama =
            FakeLlama::with_split_sentences(|_| json!({"clusters": [[0, 1, 2, 3, 4]]}).to_string());
        let segments = five_segments();

        detect_and_translate(&llama, &job_in_batches_of_two(&segments)).await;

        assert_eq!(llama.batch_sizes(), vec![2, 2, 1]);
    }

    // @behavior TL-022
    #[tokio::test]
    async fn looks_for_split_sentences_in_overlapping_windows() {
        let llama = FakeLlama::with_echo(0);
        let segments = five_segments();

        detect_and_translate(
            &llama,
            &TranslationJob {
                settings: TranslationSettings {
                    batch_size: 4,
                    ..TranslationSettings::default()
                },
                ..job(&segments)
            },
        )
        .await;

        let shown_windows: Vec<Vec<usize>> = llama
            .windows
            .lock()
            .unwrap()
            .iter()
            .map(|window| window.iter().map(|(index, _)| *index).collect())
            .collect();
        assert_eq!(shown_windows, vec![vec![0, 1, 2, 3], vec![2, 3, 4]]);
    }

    // @behavior TL-023
    #[tokio::test]
    async fn translates_on_when_a_window_cannot_be_read() {
        let llama = FakeLlama::with_split_sentences(|_| "not json".to_string());
        let segments = three_segments();

        let translated_segments = detect_and_translate(&llama, &job(&segments)).await;

        assert!(translated_segments
            .iter()
            .all(|segment| segment.translation.is_some()));
    }

    // @behavior TL-018
    #[tokio::test]
    async fn matches_each_translation_by_its_index() {
        let llama = FakeLlama::with_answer(|lines| {
            lines
                .into_iter()
                .rev()
                .map(|(index, text)| (index, format!("EN:{text}")))
                .collect()
        });
        let segments = three_segments();

        let translated_segments = translate_segments(&llama.model(), &job(&segments), &[], |_| {})
            .await
            .unwrap();

        let translations: Vec<_> = translated_segments
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
        let llama = FakeLlama::with_echo(0);
        let segments = three_segments();

        translate_segments(
            &llama.model(),
            &job_in_batches_of_two(&segments),
            &[],
            |_| {},
        )
        .await
        .unwrap();

        let second = &llama.user_messages()[1];
        assert!(
            second.contains("- 大家好 => EN:大家好\n- 今天天氣很好 => EN:今天天氣很好"),
            "{second}"
        );
    }

    /// Translates `segments` in one Batch through `llama`, into `languages`.
    async fn translate_all(
        llama: &FakeLlama,
        segments: &[Segment],
        languages: LanguagePair,
    ) -> Result<Vec<Segment>, Failure> {
        translate_segments(
            &llama.model(),
            &TranslationJob {
                languages,
                ..job(segments)
            },
            &[],
            |_| {},
        )
        .await
    }

    fn translations_of(segments: &[Segment]) -> Vec<String> {
        segments
            .iter()
            .map(|segment| segment.translation.clone().unwrap())
            .collect()
    }

    fn lines_without(index: usize, lines: Lines) -> Lines {
        echo_lines(lines)
            .into_iter()
            .filter(|(line, _)| *line != index)
            .collect()
    }

    // @behavior TL-024
    #[tokio::test]
    async fn retries_a_line_the_model_left_out() {
        let llama = FakeLlama::with_answer_per_request(|asked, lines| match asked {
            0 => translations(lines_without(1, lines)),
            _ => translations(echo_lines(lines)),
        });
        let segments = three_segments();

        let translated_segments = translate_all(&llama, &segments, japanese_pair())
            .await
            .unwrap();

        assert!(llama.user_messages()[1].contains("- index 1: missing from response"));
        assert_eq!(
            translations_of(&translated_segments),
            vec!["EN:大家好", "EN:今天天氣很好", "EN:我們出發吧"]
        );
    }

    // @behavior TL-025
    #[tokio::test]
    async fn retries_a_translation_shared_by_different_lines() {
        let llama = FakeLlama::with_answer_per_request(|asked, lines| match asked {
            0 => translations(
                lines
                    .into_iter()
                    .map(|(index, _)| (index, "the same words".to_string()))
                    .collect(),
            ),
            _ => translations(echo_lines(lines)),
        });
        let segments = three_segments();

        translate_all(&llama, &segments, japanese_pair())
            .await
            .unwrap();

        let correction = &llama.user_messages()[1];
        assert!(
            correction.contains("- index 0: duplicate")
                && correction.contains("- index 1: duplicate"),
            "{correction}"
        );
    }

    fn english_pair() -> LanguagePair {
        LanguagePair {
            source: Language::TraditionalChinese,
            target: Language::English,
        }
    }

    /// Answers every line in English that keeps no Chinese: `line <index>`.
    fn english_lines(lines: Lines) -> Lines {
        lines
            .into_iter()
            .map(|(index, _)| (index, format!("line {index} in English")))
            .collect()
    }

    // @behavior TL-026
    #[tokio::test]
    async fn retries_a_translation_that_kept_the_source_text() {
        let llama = FakeLlama::with_answer_per_request(|asked, lines| match asked {
            0 => translations(echo_lines(lines)),
            _ => translations(english_lines(lines)),
        });
        let segments = [segment(0, 1_000, "大家好")];

        let translated_segments = translate_all(&llama, &segments, english_pair())
            .await
            .unwrap();

        assert!(llama.user_messages()[1].contains("- index 0: still contains untranslated"));
        assert_eq!(
            translations_of(&translated_segments),
            vec!["line 0 in English"]
        );
    }

    // @behavior TL-027
    #[tokio::test]
    async fn retries_a_placeholder() {
        let llama = FakeLlama::with_answer_per_request(|asked, lines| match asked {
            0 => translations(vec![(0, "[inaudible]".to_string())]),
            _ => translations(echo_lines(lines)),
        });
        let segments = [segment(0, 1_000, "大家好")];

        let translated_segments = translate_all(&llama, &segments, japanese_pair())
            .await
            .unwrap();

        assert!(llama.user_messages()[1].contains("- index 0: looks like a placeholder"));
        assert_eq!(translations_of(&translated_segments), vec!["EN:大家好"]);
    }

    // @behavior TL-028
    #[tokio::test]
    async fn keeps_the_original_text_of_a_line_that_cannot_be_repaired() {
        let llama = FakeLlama::with_answer(|lines| lines_without(1, lines));
        let segments = three_segments();

        let translated_segments = translate_all(&llama, &segments, japanese_pair())
            .await
            .unwrap();

        assert_eq!(
            translations_of(&translated_segments),
            vec!["EN:大家好", "今天天氣很好", "EN:我們出發吧"]
        );
    }

    // @behavior TL-029
    #[tokio::test]
    async fn keeps_the_best_imperfect_translation() {
        let llama = FakeLlama::with_answer(|lines| {
            lines
                .into_iter()
                .map(|(index, _)| (index, "I like it".to_string()))
                .collect()
        });
        let segments = [segment(0, 1_000, "我不喜歡")];

        let translated_segments = translate_all(&llama, &segments, english_pair())
            .await
            .unwrap();

        assert!(llama.user_messages()[1].contains("- index 0: source contains a negation"));
        assert_eq!(translations_of(&translated_segments), vec!["I like it"]);
    }

    // @behavior TL-030
    #[tokio::test]
    async fn splits_a_batch_that_keeps_failing() {
        let llama = FakeLlama::with_answer(|lines| {
            if lines.len() > 2 {
                Vec::new()
            } else {
                echo_lines(lines)
            }
        });
        let segments: Vec<Segment> = five_segments().into_iter().take(4).collect();

        let translated_segments = translate_all(&llama, &segments, japanese_pair())
            .await
            .unwrap();

        let sizes = llama.batch_sizes();
        assert_eq!(&sizes[sizes.len() - 2..], &[2, 2], "{sizes:?}");
        assert_eq!(
            translations_of(&translated_segments),
            vec!["EN:第0句", "EN:第1句", "EN:第2句", "EN:第3句"]
        );
    }

    // @behavior TL-031
    #[tokio::test]
    async fn retries_an_answer_that_is_not_json() {
        let llama = FakeLlama::with_answer_per_request(|asked, lines| match asked {
            0 => completion("not json"),
            _ => translations(echo_lines(lines)),
        });
        let segments = three_segments();

        let translated_segments = translate_all(&llama, &segments, japanese_pair())
            .await
            .unwrap();

        assert!(llama.user_messages()[1].contains("failed to parse"));
        assert_eq!(translated_segments.len(), 3);
        assert!(translated_segments
            .iter()
            .all(|segment| segment.translation.is_some()));
    }

    // @behavior TL-032
    #[tokio::test]
    async fn shows_the_preceding_lines_when_repairing() {
        let retries = TranslationSettings::default().retries;
        let llama = FakeLlama::with_answer_per_request(move |asked, lines| {
            if asked < retries {
                translations(lines_without(1, lines))
            } else {
                translations(echo_lines(lines))
            }
        });
        let segments = three_segments();

        translate_all(&llama, &segments, japanese_pair())
            .await
            .unwrap();

        let repair = llama.user_messages()[retries].clone();
        assert!(
            repair.contains("immediately precedes") && repair.contains("大家好"),
            "{repair}"
        );
    }

    // @behavior TL-033
    #[tokio::test]
    async fn stops_when_llama_server_fails_a_request() {
        let llama = FakeLlama::with_answer_per_request(|_, _| Response {
            status: 500,
            body: json!({"error": {"message": "boom", "type": "server_error"}})
                .to_string()
                .into_bytes(),
        });
        let segments = three_segments();

        let result = translate_all(&llama, &segments, japanese_pair()).await;

        assert!(
            matches!(&result, Err(Failure::LlamaRequest { detail }) if detail.contains("boom")),
            "{result:?}"
        );
    }

    /// Translates `segments` with Speaker Labels turned on.
    async fn translate_with_speaker_labels(
        llama: &FakeLlama,
        segments: &[Segment],
    ) -> Vec<Segment> {
        translate_segments(
            &llama.model(),
            &TranslationJob {
                has_speaker_labels: true,
                ..job(segments)
            },
            &[],
            |_| {},
        )
        .await
        .unwrap()
    }

    fn sent_lines(llama: &FakeLlama) -> Vec<String> {
        llama
            .requests
            .lock()
            .unwrap()
            .iter()
            .flat_map(|body| {
                fake_llama::batch_lines(body)
                    .into_iter()
                    .map(|(_, text)| text)
            })
            .collect()
    }

    // @behavior TL-034
    #[tokio::test]
    async fn translates_dialogue_without_its_speaker_label() {
        let llama = FakeLlama::with_echo(0);

        let translated_segments =
            translate_with_speaker_labels(&llama, &[segment(0, 1_000, "co: 你好")]).await;

        assert_eq!(sent_lines(&llama), vec!["你好"]);
        assert_eq!(translations_of(&translated_segments), vec!["co: EN:你好"]);
    }

    // @behavior TL-035
    #[tokio::test]
    async fn leaves_a_clock_time_in_the_dialogue() {
        let llama = FakeLlama::with_echo(0);

        translate_with_speaker_labels(&llama, &[segment(0, 1_000, "12:30 出發")]).await;

        assert_eq!(sent_lines(&llama), vec!["12:30 出發"]);
    }

    // @behavior TL-036
    #[tokio::test]
    async fn drops_speaker_labels_when_the_lines_change() {
        let llama = FakeLlama::with_answer(|lines| {
            lines
                .into_iter()
                .map(|(index, text)| (index, text.replace('\n', " ")))
                .collect()
        });

        let translated_segments =
            translate_with_speaker_labels(&llama, &[segment(0, 1_000, "甲：你好\n乙：你也好")])
                .await;

        assert_eq!(translations_of(&translated_segments), vec!["你好 你也好"]);
    }

    // @behavior TL-037
    #[tokio::test]
    async fn sends_speaker_labels_when_turned_off() {
        let llama = FakeLlama::with_echo(0);

        translate_all(&llama, &[segment(0, 1_000, "co: 你好")], japanese_pair())
            .await
            .unwrap();

        assert_eq!(sent_lines(&llama), vec!["co: 你好"]);
    }

    fn batman_glossary() -> Vec<(String, String)> {
        vec![
            ("蝙蝠俠".to_string(), "Batman".to_string()),
            ("阿福".to_string(), "Alfred".to_string()),
        ]
    }

    // @behavior TL-040
    #[tokio::test]
    async fn sends_only_the_terms_a_request_uses() {
        let llama = FakeLlama::with_echo(0);
        let segments = [segment(0, 1_000, "蝙蝠俠來了")];
        let glossary_terms = batman_glossary();

        translate_segments(
            &llama.model(),
            &TranslationJob {
                glossary_terms: &glossary_terms,
                ..job(&segments)
            },
            &[],
            |_| {},
        )
        .await
        .unwrap();

        let request = &llama.user_messages()[0];
        assert!(
            request.contains("- 蝙蝠俠 => Batman") && !request.contains("阿福"),
            "{request}"
        );
    }

    // @behavior TL-041
    #[tokio::test]
    async fn retries_a_translation_that_ignores_the_translation_glossary() {
        let llama = FakeLlama::with_answer(|lines| {
            lines
                .into_iter()
                .map(|(index, _)| (index, "Bat-Man is here".to_string()))
                .collect()
        });
        let segments = [segment(0, 1_000, "蝙蝠俠來了")];
        let glossary_terms = batman_glossary();

        let translated_segments = translate_segments(
            &llama.model(),
            &TranslationJob {
                languages: english_pair(),
                glossary_terms: &glossary_terms,
                ..job(&segments)
            },
            &[],
            |_| {},
        )
        .await
        .unwrap();

        assert!(llama.user_messages()[1].contains("must use glossary translation(s): Batman"));
        assert_eq!(
            translations_of(&translated_segments),
            vec!["Bat-Man is here"]
        );
    }

    /// Translates `segments` one per Batch, keeping a Rolling Summary of at most 50 words.
    async fn translate_with_summary(llama: &FakeLlama, segments: &[Segment]) {
        translate_segments(
            &llama.model(),
            &TranslationJob {
                settings: TranslationSettings {
                    batch_size: 1,
                    ..TranslationSettings::default()
                },
                summary_word_limit: Some(50),
                ..job(segments)
            },
            &[],
            |_| {},
        )
        .await
        .unwrap();
    }

    // @behavior TL-044
    #[tokio::test]
    async fn carries_the_rolling_summary_into_the_next_batch() {
        let llama = FakeLlama::with_summaries(numbered_summary);

        translate_with_summary(&llama, &three_segments()[..2]).await;

        let second = &llama.user_messages()[1];
        assert!(
            second.contains("Running summary of the file so far") && second.contains("summary 0"),
            "{second}"
        );
    }

    // @behavior TL-045
    #[tokio::test]
    async fn rewrites_the_rolling_summary_after_each_batch() {
        let llama = FakeLlama::with_summaries(numbered_summary);

        translate_with_summary(&llama, &three_segments()[..2]).await;

        let requests = llama.summary_requests.lock().unwrap();
        let (instruction, lines) = (
            requests[1]["messages"][0]["content"].as_str().unwrap(),
            requests[1]["messages"][1]["content"].as_str().unwrap(),
        );
        assert!(instruction.contains("under 50 words"), "{instruction}");
        assert!(
            lines.contains("Previous summary:\nsummary 0")
                && lines.contains("- 今天天氣很好 => EN:今天天氣很好"),
            "{lines}"
        );
    }

    // @behavior TL-046
    #[tokio::test]
    async fn keeps_the_rolling_summary_when_a_rewrite_fails() {
        let llama = FakeLlama::with_summaries(|request| match request {
            1 => completion("not json"),
            _ => numbered_summary(request),
        });

        translate_with_summary(&llama, &three_segments()).await;

        let third = &llama.user_messages()[2];
        assert!(third.contains("summary 0"), "{third}");
    }

    // @behavior TL-047
    #[tokio::test]
    async fn sends_no_summary_requests_when_the_rolling_summary_is_off() {
        let llama = FakeLlama::with_echo(0);
        let segments = three_segments();

        translate_segments(
            &llama.model(),
            &job_in_batches_of_two(&segments),
            &[],
            |_| {},
        )
        .await
        .unwrap();

        assert!(llama.summary_requests.lock().unwrap().is_empty());
    }

    /// Translates `segments` in one Batch with Self-Review turned on.
    async fn translate_with_self_review(llama: &FakeLlama, segments: &[Segment]) -> Vec<Segment> {
        translate_segments(
            &llama.model(),
            &TranslationJob {
                has_self_review: true,
                ..job(segments)
            },
            &[],
            |_| {},
        )
        .await
        .unwrap()
    }

    /// A review placing line 1 on line 2 in the requests `is_misplaced` picks, and every other line on its own.
    fn llama_misplacing_line_one(
        is_misplaced: impl Fn(usize) -> bool + Send + Sync + 'static,
    ) -> FakeLlama {
        FakeLlama::serve(Replies {
            review: Box::new(move |(asked, items)| {
                let placements = items
                    .iter()
                    .map(|item| {
                        let index = item["index"].as_u64().unwrap() as usize;
                        match index == 1 && is_misplaced(asked) {
                            true => (1, 2),
                            false => (index, index),
                        }
                    })
                    .collect();
                review_answer(placements)
            }),
            ..Replies::default()
        })
    }

    // @behavior TL-048
    #[tokio::test]
    async fn reviews_translations_two_lines_at_a_time() {
        let llama = FakeLlama::with_echo(0);

        translate_with_self_review(&llama, &three_segments()).await;

        let requests = llama.review_requests.lock().unwrap();
        let reviewed: Vec<Vec<serde_json::Value>> =
            requests.iter().map(fake_llama::reviewed_items).collect();
        assert_eq!(
            reviewed[0][1],
            json!({
                "index": 1,
                "source": "今天天氣很好",
                "translation": "EN:今天天氣很好",
                "previous_line_index": 0,
                "previous_line_source": "大家好",
                "next_line_index": 2,
                "next_line_source": "我們出發吧",
            })
        );
        assert_eq!(
            reviewed.iter().map(Vec::len).collect::<Vec<_>>(),
            vec![2, 1]
        );
        let properties: Vec<&String> = requests[0]["response_format"]["json_schema"]["schema"]
            ["properties"]["reviews"]["items"]["properties"]
            .as_object()
            .unwrap()
            .keys()
            .collect();
        assert!(
            properties
                .iter()
                .position(|key| *key == "translation_meaning")
                < properties
                    .iter()
                    .position(|key| *key == "best_matching_index"),
            "{properties:?}"
        );
    }

    // @behavior TL-049
    #[tokio::test]
    async fn repairs_a_translation_the_review_places_on_another_line() {
        let llama = llama_misplacing_line_one(|asked| asked == 0);

        translate_with_self_review(&llama, &three_segments()).await;

        let requests = llama.requests.lock().unwrap();
        let repaired_lines: Vec<usize> = fake_llama::batch_lines(&requests[1])
            .into_iter()
            .map(|(index, _)| index)
            .collect();
        assert_eq!(repaired_lines, vec![1]);
    }

    // @behavior TL-050
    #[tokio::test]
    async fn keeps_a_translation_the_review_keeps_placing_elsewhere() {
        let llama = llama_misplacing_line_one(|_| true);

        let translated_segments = translate_with_self_review(&llama, &three_segments()).await;

        assert_eq!(
            translations_of(&translated_segments),
            vec!["EN:大家好", "EN:今天天氣很好", "EN:我們出發吧"]
        );
    }

    // @behavior TL-051
    #[tokio::test]
    async fn translates_on_when_a_review_cannot_be_read() {
        let llama = FakeLlama::serve(Replies {
            review: Box::new(|_| completion("not json")),
            ..Replies::default()
        });

        let translated_segments = translate_with_self_review(&llama, &three_segments()).await;

        assert_eq!(
            translations_of(&translated_segments),
            vec!["EN:大家好", "EN:今天天氣很好", "EN:我們出發吧"]
        );
        assert_eq!(llama.requests.lock().unwrap().len(), 1);
    }

    // @behavior TL-052
    #[tokio::test]
    async fn sends_no_reviews_when_self_review_is_off() {
        let llama = FakeLlama::with_echo(0);

        translate_all(&llama, &three_segments(), japanese_pair())
            .await
            .unwrap();

        assert!(llama.review_requests.lock().unwrap().is_empty());
    }

    // @behavior TL-058
    #[tokio::test]
    async fn shows_each_batch_as_it_is_translated() {
        let llama = FakeLlama::with_echo(0);
        let dir = TempDir::new("tl-stream");
        let app = mock_app();
        let mut project = project_of(three_segments());
        project.directory = dir.path().to_path_buf();
        app.state::<CurrentProject>().replace(project);
        let source = app.state::<CurrentProject>().snapshot().unwrap();
        let shown = Arc::new(Mutex::new(Vec::new()));
        app.listen_any("project-changed", {
            let shown = Arc::clone(&shown);
            let handle = app.handle().clone();
            move |_| {
                let view = handle.state::<CurrentProject>().view().unwrap();
                let count = view
                    .segments()
                    .iter()
                    .filter(|segment| segment.translation.is_some())
                    .count();
                shown.lock().unwrap().push(count);
            }
        });

        translate_once_ready(
            app.handle(),
            llama.base_url(),
            Duration::from_secs(5),
            || false,
            &job_in_batches_of_two(&source.transcript.segments),
            &mut Phases::start("translate", "load"),
            batch_display(
                app.handle(),
                &app.state::<CurrentProject>(),
                &source,
                Language::Japanese,
            ),
        )
        .await
        .unwrap();

        assert_eq!(*shown.lock().unwrap(), vec![2, 3]);
    }

    // @behavior TL-010
    #[tokio::test]
    async fn translates_the_project_as_edited() {
        let llama = FakeLlama::with_echo(0);
        let dir = TempDir::new("tl-edited");
        let project = CurrentProject::default();
        let mut edited = project_of(vec![segment(0, 1_000, "竹子搞")]);
        edited.directory = dir.path().to_path_buf();
        project.replace(edited);
        project
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();
        let source = project.snapshot().unwrap();

        let translated_segments = translate_segments(
            &llama.model(),
            &job(&source.transcript.segments),
            &[],
            |_| {},
        )
        .await
        .unwrap();
        project
            .write_translations(&source, Language::Japanese, translated_segments)
            .unwrap();

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
        let llama = FakeLlama::with_echo(2);
        let segments = [segment(0, 1_000, "大家好")];

        wait_until_ready(
            &reqwest::Client::new(),
            llama.base_url(),
            Duration::from_secs(5),
            || false,
        )
        .await
        .unwrap();
        translate_segments(&llama.model(), &job(&segments), &[], |_| {})
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

    /// A plan to translate into `target` with the default options and settings.
    fn plan_for(target: Language) -> TranslationPlan {
        TranslationPlan {
            target,
            options: TranslationOptions::default(),
            settings: TranslationSettings::default(),
        }
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
            &AppPorts {
                app: app.handle(),
                processes: &processes,
            },
            &app.state::<CurrentProject>(),
            Path::new("/bin/sleep"),
            &ModelSettings::default(),
            &plan_for(Language::Japanese),
            Duration::from_secs(1),
            Phases::start("translate", "prepare"),
        )
        .await;

        assert!(result.is_err());
        assert!(!record.exists());
    }

    // @behavior TL-039
    #[tokio::test]
    async fn refuses_to_translate_with_a_glossary_without_its_header() {
        let dir = TempDir::new("tl-glossary-header");
        std::fs::write(dir.path().join("glossary.csv"), "蝙蝠俠,Batman\n").unwrap();
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Translation, dir.file("qwen3-4b.gguf"));
        let app = mock_app();
        let processes = Processes::new(dir.path().join("processes.json"));
        let mut project = project_of(vec![segment(0, 1_000, "蝙蝠俠")]);
        project.directory = dir.path().to_path_buf();
        app.state::<CurrentProject>().replace(project);

        let result = run_translate(
            &AppPorts {
                app: app.handle(),
                processes: &processes,
            },
            &app.state::<CurrentProject>(),
            Path::new("/bin/sleep"),
            &settings,
            &plan_for(Language::English),
            Duration::from_secs(1),
            Phases::start("translate", "prepare"),
        )
        .await;

        assert_eq!(result.map(|_| ()), Err(Failure::GlossaryWithoutHeader));
    }

    // @behavior TL-004
    #[cfg(unix)]
    #[tokio::test]
    async fn stops_llama_server_when_translation_gives_up() {
        let dir = TempDir::new("tl-stop");
        let llama = dir.path().join("llama-server");
        let pid_file = dir.path().join("llama.pid");
        crate::test_support::write_executable(
            &llama,
            &format!(
                "#!/bin/sh\necho $$ > '{}'\nexec sleep 30\n",
                pid_file.display()
            ),
        );
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Translation, dir.file("qwen3-4b.gguf"));
        let app = mock_app();
        let processes = Processes::new(dir.path().join("processes.json"));

        app.state::<CurrentProject>()
            .replace(project_of(vec![segment(0, 1_000, "大家好")]));

        let result = run_translate(
            &AppPorts {
                app: app.handle(),
                processes: &processes,
            },
            &app.state::<CurrentProject>(),
            &llama,
            &settings,
            &plan_for(Language::Japanese),
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
        let llama = FakeLlama::with_echo(2);
        let app = mock_app();
        let mut phases = Phases::start("translate", "load");
        let segments = [
            segment(0, 1_000, "大家好"),
            segment(1_000, 2_000, "今天天氣很好"),
        ];

        translate_once_ready(
            app.handle(),
            llama.base_url(),
            Duration::from_secs(5),
            || false,
            &job(&segments),
            &mut phases,
            |_| {},
        )
        .await
        .unwrap();

        let names: Vec<_> = phases.finish().iter().map(|timing| timing.phase).collect();
        assert_eq!(names, vec!["load", "detect", "translate"]);
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
        let mut project = project_of(vec![
            segment(0, 1_000, "co: 大家好"),
            segment(1_000, 3_000, "今天天氣很好"),
            segment(3_000, 5_000, "但我不想出門"),
        ]);
        project.directory = dir.path().to_path_buf();
        app.state::<CurrentProject>().replace(project);

        let translated_segments = run_translate(
            &AppPorts {
                app: app.handle(),
                processes: &processes,
            },
            &app.state::<CurrentProject>(),
            &llama,
            &settings,
            &TranslationPlan {
                options: TranslationOptions {
                    has_speaker_labels: true,
                    has_self_review: true,
                    summary_word_limit: Some(50),
                },
                ..plan_for(Language::English)
            },
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
        println!("phases {:?}", translated_segments.phases);
        assert!(segments.iter().all(|segment| segment.translation.is_some()));
    }
}

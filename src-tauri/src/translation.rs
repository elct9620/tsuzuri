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

mod batching;
#[cfg(test)]
mod fake_llama;
mod model;
mod repair;
mod speaker_labels;

use model::TranslationModel;
use speaker_labels::LabelledText;

/// How long llama-server may take to load its Model before translation gives up.
const READY_TIMEOUT: Duration = Duration::from_secs(180);
const HEALTH_POLL: Duration = Duration::from_millis(500);
/// A Batch and its reference lines fit in a small context, which keeps the KV cache inside 4 GB of VRAM.
const CONTEXT_SIZE: &str = "4096";
/// Subtitles need no reasoning, and a thinking Model spends most of each request on it.
const CHAT_TEMPLATE_KWARGS: &str = r#"{"enable_thinking":false}"#;

/// How a translation is batched and repaired.
#[derive(Debug, Clone, Copy)]
struct TranslationSettings {
    /// Segments per Batch.
    batch_size: usize,
    /// Translated lines around a request that it carries as reference.
    reference_lines: usize,
    /// Requests for the same lines before a failing group is split in half.
    retries: usize,
}

impl Default for TranslationSettings {
    fn default() -> TranslationSettings {
        TranslationSettings {
            batch_size: 8,
            reference_lines: 2,
            retries: 3,
        }
    }
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
    /// Whether Speaker Labels are kept out of what the Model is sent.
    has_speaker_labels: bool,
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
    let glossary = project.translation_glossary();
    let job = TranslationJob {
        segments: &transcript.segments,
        languages,
        settings: TranslationSettings::default(),
        has_speaker_labels: false,
        summary_word_limit: None,
        glossary_terms: glossary.as_ref().map_or(&[], |glossary| glossary.terms()),
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
    let model = TranslationModel::new(base_url);
    enter(app, phases, "detect");
    let split_sentences =
        find_split_sentences(&model, job, |percent| report(app, "detect", Some(percent))).await;
    enter(app, phases, "translate");
    translate_segments(&model, job, &split_sentences, |percent| {
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
    on_progress: impl Fn(u8),
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
        on_progress((translated_segments.len() * 100 / job.segments.len()) as u8);
    }
    Ok(translated_segments)
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
    use serde_json::json;

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

    use super::*;
    use crate::project::{Project, SegmentField};
    use crate::test_support::Response;
    use crate::test_support::TempDir;
    use crate::transcript::Transcript;
    use fake_llama::{completion, echo_lines, numbered_summary, translations, FakeLlama, Lines};

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
            translation_glossary: None,
            transcript: Transcript { segments },
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
            &reqwest::Client::new(),
            llama.base_url(),
            Duration::from_secs(5),
            || false,
            job,
            &mut Phases::start("translate", "load"),
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

    // @behavior TL-010
    #[tokio::test]
    async fn translates_the_project_as_edited() {
        let llama = FakeLlama::with_echo(0);
        let project = CurrentProject::default();
        project.replace(project_of(vec![segment(0, 1_000, "竹子搞")]));
        project
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();
        let (generation, transcript) = project.snapshot().unwrap();

        let translated_segments =
            translate_segments(&llama.model(), &job(&transcript.segments), &[], |_| {})
                .await
                .unwrap();
        project.write_translations(generation, japanese_pair(), translated_segments);

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
            japanese_pair(),
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
            japanese_pair(),
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
            &reqwest::Client::new(),
            llama.base_url(),
            Duration::from_secs(5),
            || false,
            &job(&segments),
            &mut phases,
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
        app.state::<CurrentProject>().replace(project_of(vec![
            segment(0, 1_000, "大家好"),
            segment(1_000, 3_000, "今天天氣很好"),
        ]));

        let translated_segments = run_translate(
            app.handle(),
            &processes,
            &llama,
            &settings,
            english_pair(),
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

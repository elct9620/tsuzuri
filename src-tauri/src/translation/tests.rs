use serde_json::json;

use std::sync::{Arc, Mutex};

use crate::test_support::mode_app;
use tauri::Listener;
use tauri_specta::Event;

use crate::progress::{PipelineProgress, ProjectChanged};

use tauri::Manager;

use super::*;
use crate::model_source::ModelSource;
use crate::processes::{AppPorts, Processes};
use crate::project::{Project, RunningMode, SegmentField};
use crate::steps::{run_mode, ModeLock};
use crate::test_support::Response;
use crate::test_support::{project_of, segment, TempDir};
use fake_llama::{
    completion, echo_lines, numbered_summary, review_answer, translations, FakeLlama, Lines,
    Replies,
};

/// Detects, then translates, as a job does once llama-server is ready.
async fn detect_and_translate(llama: &FakeLlama, job: &TranslationJob<'_>) -> Vec<Segment> {
    let app = mode_app();
    translate_once_ready(
        app.handle(),
        llama.base_url(),
        Duration::from_secs(5),
        || false,
        job,
        &mut Phases::start("translate", Phase::Loading),
        |_, _| {},
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
        chosen_indexes: &[],
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

    let translated_segments = translate_segments(&llama.model(), &job(&segments), &[], |_, _| {})
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
        |_, _| {},
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
        |_, _| {},
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

    let translated_segments = translate_segments(&llama.model(), &job(&segments), &[], |_, _| {})
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
        |_, _| {},
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
        |_, _| {},
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
    let llama = FakeLlama::with_answer_per_request(|request_index, lines| match request_index {
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
    let llama = FakeLlama::with_answer_per_request(|request_index, lines| match request_index {
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
        correction.contains("- index 0: duplicate") && correction.contains("- index 1: duplicate"),
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
    let llama = FakeLlama::with_answer_per_request(|request_index, lines| match request_index {
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
    let llama = FakeLlama::with_answer_per_request(|request_index, lines| match request_index {
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
    let llama = FakeLlama::with_answer_per_request(|request_index, lines| match request_index {
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
    let llama = FakeLlama::with_answer_per_request(move |request_index, lines| {
        if request_index < retries {
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
        headers: Vec::new(),
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
async fn translate_with_speaker_labels(llama: &FakeLlama, segments: &[Segment]) -> Vec<Segment> {
    translate_segments(
        &llama.model(),
        &TranslationJob {
            has_speaker_labels: true,
            ..job(segments)
        },
        &[],
        |_, _| {},
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
        translate_with_speaker_labels(&llama, &[segment(0, 1_000, "甲：你好\n乙：你也好")]).await;

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
        |_, _| {},
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
        |_, _| {},
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
        |_, _| {},
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
        |_, _| {},
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
        |_, _| {},
    )
    .await
    .unwrap()
}

/// A review placing line 1 on line 2 in the requests `is_misplaced` picks, and every other line on its own.
fn llama_misplacing_line_one(
    is_misplaced: impl Fn(usize) -> bool + Send + Sync + 'static,
) -> FakeLlama {
    FakeLlama::serve(Replies {
        review: Box::new(move |(request_index, items)| {
            let placements = items
                .iter()
                .map(|item| {
                    let index = item["index"].as_u64().unwrap() as usize;
                    match index == 1 && is_misplaced(request_index) {
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
    let reviewed_items: Vec<Vec<serde_json::Value>> =
        requests.iter().map(fake_llama::reviewed_items).collect();
    assert_eq!(
        reviewed_items[0][1],
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
        reviewed_items.iter().map(Vec::len).collect::<Vec<_>>(),
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
    let llama = llama_misplacing_line_one(|request_index| request_index == 0);

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
    let app = mode_app();
    let mut project = project_of(three_segments());
    project.directory = dir.path().to_path_buf();
    let current = app.state::<CurrentProject>();
    current.replace(project);
    let source = current.snapshot().unwrap();
    let _hold = current.hold_resource(
        &source.directory,
        &source.name,
        RunningMode::Translation {
            language: Language::Japanese,
            indexes: None,
        },
    );
    let shown_counts = Arc::new(Mutex::new(Vec::new()));
    ProjectChanged::listen_any(&app, {
        let shown_counts = Arc::clone(&shown_counts);
        let handle = app.handle().clone();
        move |_| {
            let view = handle.state::<CurrentProject>().view().unwrap();
            let count = view
                .segments()
                .iter()
                .filter(|segment| segment.translation.is_some())
                .count();
            shown_counts.lock().unwrap().push(count);
        }
    });

    translate_once_ready(
        app.handle(),
        llama.base_url(),
        Duration::from_secs(5),
        || false,
        &job_in_batches_of_two(&source.transcript.segments),
        &mut Phases::start("translate", Phase::Loading),
        batch_display(app.handle(), &current, &source, false),
    )
    .await
    .unwrap();

    assert_eq!(*shown_counts.lock().unwrap(), vec![0, 2, 3]);
}

// @behavior TL-082
#[tokio::test]
async fn names_the_batch_being_translated() {
    let llama = FakeLlama::with_echo(0);
    let dir = TempDir::new("tl-pending-batch");
    let app = mode_app();
    let mut project = project_of(three_segments());
    project.directory = dir.path().to_path_buf();
    let current = app.state::<CurrentProject>();
    current.replace(project);
    let source = current.snapshot().unwrap();
    let _hold = current.hold_resource(
        &source.directory,
        &source.name,
        RunningMode::Translation {
            language: Language::Japanese,
            indexes: None,
        },
    );
    let pending_batches = Arc::new(Mutex::new(Vec::new()));
    ProjectChanged::listen_any(&app, {
        let pending_batches = Arc::clone(&pending_batches);
        let handle = app.handle().clone();
        move |_| {
            let view = handle.state::<CurrentProject>().view().unwrap();
            pending_batches.lock().unwrap().push(view.pending_batch());
        }
    });

    translate_once_ready(
        app.handle(),
        llama.base_url(),
        Duration::from_secs(5),
        || false,
        &job_in_batches_of_two(&source.transcript.segments),
        &mut Phases::start("translate", Phase::Loading),
        batch_display(app.handle(), &current, &source, false),
    )
    .await
    .unwrap();

    assert_eq!(
        *pending_batches.lock().unwrap(),
        vec![
            Some(SegmentSpan { first: 0, last: 1 }),
            Some(SegmentSpan { first: 2, last: 2 }),
            None
        ]
    );
}

// @behavior TL-084
#[tokio::test]
async fn translates_chosen_segments_again_with_their_neighbours() {
    let llama = FakeLlama::with_echo(0);
    let segments: Vec<Segment> = (0..5)
        .map(|index| Segment {
            translation: Some(format!("line {index}")),
            ..segment(index * 1_000, (index + 1) * 1_000, &format!("第{index}句"))
        })
        .collect();
    let app = mode_app();

    translate_once_ready(
        app.handle(),
        llama.base_url(),
        Duration::from_secs(5),
        || false,
        &TranslationJob {
            chosen_indexes: &[2],
            ..job(&segments)
        },
        &mut Phases::start("translate", Phase::Loading),
        |_, _| {},
    )
    .await
    .unwrap();

    let messages = llama.user_messages();
    let message = &messages[0];
    assert_eq!(
        (
            messages.len(),
            llama.batch_sizes(),
            message.contains("第0句 => line 0") && message.contains("第1句 => line 1"),
            message.contains("immediately follows") && message.contains("第3句 第4句"),
        ),
        (1, vec![1], true, true)
    );
}

/// Segments `第0句`… each translated as `line <n>`.
fn segments_translated_as_lines(count: u64) -> Vec<Segment> {
    (0..count)
        .map(|index| Segment {
            translation: Some(format!("line {index}")),
            ..segment(index * 1_000, (index + 1) * 1_000, &format!("第{index}句"))
        })
        .collect()
}

// @behavior TL-087
#[tokio::test]
async fn translates_chosen_segments_again_in_batches() {
    let llama = FakeLlama::with_echo(0);
    let segments = segments_translated_as_lines(5);

    detect_and_translate(
        &llama,
        &TranslationJob {
            chosen_indexes: &[1, 2, 3, 4],
            ..job_in_batches_of_two(&segments)
        },
    )
    .await;

    assert_eq!(llama.batch_sizes(), vec![2, 2]);
}

// @behavior TL-088
#[tokio::test]
async fn keeps_a_split_sentence_among_the_chosen_segments_in_one_batch() {
    let llama = FakeLlama::with_split_sentences(|window| {
        let sentences: Vec<[usize; 2]> = window
            .iter()
            .any(|(index, _)| *index == 3)
            .then_some([2, 3])
            .into_iter()
            .collect();
        json!({"clusters": sentences}).to_string()
    });
    let segments = segments_translated_as_lines(5);

    detect_and_translate(
        &llama,
        &TranslationJob {
            chosen_indexes: &[1, 2, 3],
            ..job_in_batches_of_two(&segments)
        },
    )
    .await;

    assert_eq!(llama.batch_sizes(), vec![1, 2]);
}

// @behavior TL-089
#[tokio::test]
async fn tells_the_model_a_chosen_segment_goes_on_from_a_sentence_before_it() {
    let llama = FakeLlama::with_split_sentences(|window| {
        let sentences: Vec<[usize; 2]> = window
            .iter()
            .any(|(index, _)| *index == 2)
            .then_some([1, 2])
            .into_iter()
            .collect();
        json!({"clusters": sentences}).to_string()
    });
    let segments = segments_translated_as_lines(5);

    let translated = detect_and_translate(
        &llama,
        &TranslationJob {
            chosen_indexes: &[2, 3, 4],
            ..job(&segments)
        },
    )
    .await;

    let first_request = &llama.user_messages()[0];
    assert!(
        first_request.contains("immediately precedes") && first_request.contains("第1句"),
        "{first_request}"
    );
    assert_eq!(translated[1].translation.as_deref(), Some("line 1"));
}

// @behavior TL-090
#[tokio::test]
async fn looks_for_split_sentences_a_batch_around_the_chosen_segments() {
    let llama = FakeLlama::with_echo(0);
    let segments = segments_translated_as_lines(10);

    detect_and_translate(
        &llama,
        &TranslationJob {
            chosen_indexes: &[6, 7, 8, 9],
            settings: TranslationSettings {
                batch_size: 4,
                ..TranslationSettings::default()
            },
            ..job(&segments)
        },
    )
    .await;

    let shown: Vec<usize> = llama
        .windows
        .lock()
        .unwrap()
        .iter()
        .flatten()
        .map(|(index, _)| *index)
        .collect();
    assert_eq!(
        (shown.iter().min(), shown.contains(&0) || shown.contains(&1)),
        (Some(&2), false)
    );
}

// @behavior TL-091
#[tokio::test]
async fn translates_again_with_speaker_labels() {
    let llama = FakeLlama::with_echo(0);
    let segments = [Segment {
        translation: Some("old".to_string()),
        ..segment(0, 1_000, "co: 你好")
    }];

    let translated = detect_and_translate(
        &llama,
        &TranslationJob {
            chosen_indexes: &[0],
            has_speaker_labels: true,
            ..job(&segments)
        },
    )
    .await;

    assert_eq!(sent_lines(&llama), vec!["你好"]);
    assert_eq!(translations_of(&translated), vec!["co: EN:你好"]);
}

// @behavior TL-092
#[tokio::test]
async fn keeps_no_rolling_summary_when_translating_again() {
    let llama = FakeLlama::with_summaries(numbered_summary);
    let segments = segments_translated_as_lines(5);

    detect_and_translate(
        &llama,
        &TranslationJob {
            chosen_indexes: &[1, 2, 3, 4],
            summary_word_limit: Some(50),
            ..job_in_batches_of_two(&segments)
        },
    )
    .await;

    assert!(llama.summary_requests.lock().unwrap().is_empty());
}

// @behavior TL-083
#[tokio::test]
async fn drops_the_translations_shown_when_cancelled() {
    let llama = FakeLlama::with_answer_per_request(|request_index, lines| {
        if request_index > 0 {
            std::thread::sleep(Duration::from_secs(2));
        }
        translations(echo_lines(lines))
    });
    let dir = TempDir::new("tl-cancel");
    let app = mode_app();
    let mut project = project_of(three_segments());
    project.directory = dir.path().to_path_buf();
    let current = app.state::<CurrentProject>();
    current.replace(project);
    let source = current.snapshot().unwrap();
    let processes = Processes::new(dir.path().join("processes.json"));
    let lock = ModeLock::default();
    let run = lock.begin(AppPorts::new(app.handle(), &processes)).await;
    run.keep(current.hold_resource(
        &source.directory,
        &source.name,
        RunningMode::Translation {
            language: Language::Japanese,
            indexes: None,
        },
    ));
    let translated_count = || {
        current
            .view()
            .unwrap()
            .segments()
            .iter()
            .filter(|segment| segment.translation.is_some())
            .count()
    };
    let cancel_once_shown = async {
        while translated_count() < 2 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        lock.cancel();
    };

    let job = job_in_batches_of_two(&source.transcript.segments);
    let mut phases = Phases::start("translate", Phase::Loading);
    let (result, ()) = tokio::join!(
        run.run_until_cancelled(translate_once_ready(
            app.handle(),
            llama.base_url(),
            Duration::from_secs(5),
            || false,
            &job,
            &mut phases,
            batch_display(app.handle(), &current, &source, false),
        )),
        cancel_once_shown
    );
    drop(run);

    let written_srts = std::fs::read_dir(dir.path())
        .unwrap()
        .filter(|entry| {
            entry
                .as_ref()
                .is_ok_and(|entry| entry.path().extension().is_some_and(|ext| ext == "srt"))
        })
        .count();
    assert_eq!(
        (result.map(|_| ()), translated_count(), written_srts),
        (Err(Failure::ModeCancelled), 0, 0)
    );
}

/// The `pipeline-progress` payloads of `phase`, as sent, while three Segments are translated in Batches of two.
async fn progress_events(phase: &str) -> Vec<String> {
    let llama = FakeLlama::with_echo(0);
    let app = mode_app();
    let progress_events = Arc::new(Mutex::new(Vec::new()));
    app.listen_any(PipelineProgress::NAME, {
        let progress_events = Arc::clone(&progress_events);
        move |event| {
            progress_events
                .lock()
                .unwrap()
                .push(event.payload().to_string())
        }
    });
    let segments = three_segments();

    translate_once_ready(
        app.handle(),
        llama.base_url(),
        Duration::from_secs(5),
        || false,
        &job_in_batches_of_two(&segments),
        &mut Phases::start("translate", Phase::Loading),
        |_, _| {},
    )
    .await
    .unwrap();

    let prefix = format!(r#"{{"phase":"{phase}","#);
    let progress_events = progress_events.lock().unwrap();
    progress_events
        .iter()
        .filter(|event| event.starts_with(&prefix))
        .cloned()
        .collect()
}

// @behavior TL-074
#[test]
fn translates_on_a_llama_server_of_its_own_with_the_resident_one_off() {
    let settings = TranslationSettings {
        has_resident_llama: false,
        ..TranslationSettings::default()
    };

    let resident = ResidentLlama::default();

    let server = llama_server(&settings, &resident, Path::new("/presets"));

    assert!(matches!(server, LlamaServer::Job));
}

// @behavior TL-075
#[test]
fn keeps_the_model_for_the_seconds_the_settings_choose() {
    let settings = TranslationSettings {
        model_keep_seconds: 30,
        ..TranslationSettings::default()
    };

    let resident = ResidentLlama::default();

    let server = llama_server(&settings, &resident, Path::new("/presets"));

    assert!(matches!(
        server,
        LlamaServer::Router { keep, .. } if keep == Duration::from_secs(30)
    ));
}

// @behavior TL-063
#[tokio::test]
async fn reports_how_many_segments_are_translated() {
    let events = progress_events("translate").await;

    assert_eq!(
        events,
        vec![
            r#"{"phase":"translate","percent":null}"#,
            r#"{"phase":"translate","percent":66,"count":{"done_count":2,"total":3}}"#,
            r#"{"phase":"translate","percent":100,"count":{"done_count":3,"total":3}}"#,
        ]
    );
}

// @behavior TL-064
#[tokio::test]
async fn reports_how_many_windows_are_searched_for_split_sentences() {
    let events = progress_events("detect").await;

    assert_eq!(
        events,
        vec![
            r#"{"phase":"detect","percent":null}"#,
            r#"{"phase":"detect","percent":50,"count":{"done_count":1,"total":2}}"#,
            r#"{"phase":"detect","percent":100,"count":{"done_count":2,"total":2}}"#,
        ]
    );
}

/// A Project in `ja` whose `lecture.srt` holds one Segment, translated into `zh-TW` by a
/// Model answering 你们好, as the translation file then reads with the cleanup on or off.
async fn translation_file_into_traditional_chinese(name: &str, is_cleaned: bool) -> String {
    let llama = FakeLlama::with_answer(|lines| {
        lines
            .into_iter()
            .map(|(index, _)| (index, "你们好".to_string()))
            .collect()
    });
    let dir = TempDir::new(name);
    std::fs::write(
        dir.path().join("lecture.srt"),
        "1\n00:00:00,000 --> 00:00:01,000\nこんにちは\n",
    )
    .unwrap();
    let project = CurrentProject::default();
    project.replace(Project::open(dir.path().to_path_buf(), Language::Japanese).unwrap());
    let source = project.snapshot().unwrap();
    let translated_segments = translate_segments(
        &llama.model(),
        &job(&source.transcript.segments),
        &[],
        |_, _| {},
    )
    .await
    .unwrap();

    write_translated_segments(
        &project,
        &source,
        &plan_for(Language::TraditionalChinese),
        translated_segments,
        is_cleaned,
    )
    .unwrap();
    std::fs::read_to_string(dir.path().join("lecture.zh-TW.srt")).unwrap()
}

#[test]
fn cleans_only_a_translation_into_traditional_chinese_asked_to_clean() {
    let plan = |target, is_simplified_cleaned| TranslationPlan {
        options: TranslationOptions {
            is_simplified_cleaned,
            ..TranslationOptions::default()
        },
        ..plan_for(target)
    };

    assert_eq!(
        [
            plan(Language::TraditionalChinese, true).is_simplified_cleaned(),
            plan(Language::TraditionalChinese, false).is_simplified_cleaned(),
            plan(Language::Japanese, true).is_simplified_cleaned(),
        ],
        [true, false, false]
    );
}

// @behavior TL-098
#[tokio::test]
async fn writes_a_translation_into_traditional_chinese_cleaned() {
    let file = translation_file_into_traditional_chinese("tl-clean-write", true).await;

    assert!(file.contains("你們好"), "{file}");
}

// @behavior TL-098
#[test]
fn shows_a_batch_into_traditional_chinese_cleaned() {
    let app = mode_app();
    let current = app.state::<CurrentProject>();
    current.replace(project_of(vec![segment(0, 1_000, "こんにちは")]));
    let source = current.snapshot().unwrap();
    let _hold = current.hold_resource(
        &source.directory,
        &source.name,
        RunningMode::Translation {
            language: Language::TraditionalChinese,
            indexes: None,
        },
    );
    let mut translated_segment = segment(0, 1_000, "こんにちは");
    translated_segment.translation = Some("你们好".to_string());

    batch_display(app.handle(), &current, &source, true)(&[translated_segment], None);

    assert_eq!(
        current.view().unwrap().segments()[0].translation.as_deref(),
        Some("你們好")
    );
}

// @behavior TL-099
#[tokio::test]
async fn leaves_a_translation_as_the_model_wrote_it_with_the_cleanup_off() {
    let file = translation_file_into_traditional_chinese("tl-clean-off", false).await;

    assert!(file.contains("你们好"), "{file}");
}

// @behavior TL-010
#[tokio::test]
async fn translates_the_project_as_edited() {
    let llama = FakeLlama::with_echo(0);
    let dir = TempDir::new("tl-edited");
    std::fs::write(
        dir.path().join("lecture.srt"),
        "1\n00:00:00,000 --> 00:00:01,000\n竹子搞\n",
    )
    .unwrap();
    let project = CurrentProject::default();
    project.replace(Project::open(dir.path().to_path_buf(), Language::TraditionalChinese).unwrap());
    project
        .edit(0, SegmentField::Text, "逐字稿".to_string())
        .unwrap();
    let source = project.snapshot().unwrap();

    let translated_segments = translate_segments(
        &llama.model(),
        &job(&source.transcript.segments),
        &[],
        |_, _| {},
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

    llama::wait_until_ready(llama.base_url(), Duration::from_secs(5), || false)
        .await
        .unwrap();
    translate_segments(&llama.model(), &job(&segments), &[], |_, _| {})
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
        scope: TranslationScope::Whole,
    }
}

// @behavior TL-003
#[tokio::test]
async fn refuses_without_a_translation_model() {
    let dir = TempDir::new("tl-no-model");
    let app = mode_app();
    let record = dir.path().join("processes.json");
    let processes = Processes::new(record.clone());

    app.state::<CurrentProject>()
        .replace(project_of(vec![segment(0, 1_000, "大家好")]));

    let result = run_mode(
        &TranslateMode {
            llama: Path::new("/bin/sleep"),
            model_settings: &ModelSettings::default(),
            plan: &plan_for(Language::Japanese),
            server: &LlamaServer::Job,
            ready_timeout: Duration::from_secs(1),
        },
        &ModeLock::default()
            .begin(AppPorts::new(app.handle(), &processes))
            .await,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
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
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: dir.file("qwen3-4b.gguf"),
        },
    );
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));
    let mut project = project_of(vec![segment(0, 1_000, "蝙蝠俠")]);
    project.directory = dir.path().to_path_buf();
    app.state::<CurrentProject>().replace(project);

    let result = run_mode(
        &TranslateMode {
            llama: Path::new("/bin/sleep"),
            model_settings: &settings,
            plan: &plan_for(Language::English),
            server: &LlamaServer::Job,
            ready_timeout: Duration::from_secs(1),
        },
        &ModeLock::default()
            .begin(AppPorts::new(app.handle(), &processes))
            .await,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
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
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: dir.file("qwen3-4b.gguf"),
        },
    );
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));

    app.state::<CurrentProject>()
        .replace(project_of(vec![segment(0, 1_000, "大家好")]));

    let result = run_mode(
        &TranslateMode {
            llama: &llama,
            model_settings: &settings,
            plan: &plan_for(Language::Japanese),
            server: &LlamaServer::Job,
            ready_timeout: Duration::from_secs(1),
        },
        &ModeLock::default()
            .begin(AppPorts::new(app.handle(), &processes))
            .await,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
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

// @behavior TL-069
#[cfg(unix)]
#[tokio::test]
async fn fails_a_translation_whose_model_the_resident_llama_server_cannot_load() {
    let dir = TempDir::new("tl-resident-load-failure");
    let llama = dir.path().join("llama-server");
    crate::test_support::write_executable(&llama, "#!/bin/sh\nexec sleep 30\n");
    let router = FakeLlama::serve(Replies {
        has_load_failure: true,
        ..Replies::default()
    });
    let port = router
        .base_url()
        .rsplit(':')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    let mut settings = ModelSettings::default();
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: dir.file("qwen3-4b.gguf"),
        },
    );
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));
    app.state::<CurrentProject>()
        .replace(project_of(vec![segment(0, 1_000, "大家好")]));
    let ready_timeout = Duration::from_secs(5);
    let started_at = std::time::Instant::now();

    let result = run_mode(
        &TranslateMode {
            llama: &llama,
            model_settings: &settings,
            plan: &plan_for(Language::Japanese),
            server: &LlamaServer::Router {
                resident: &ResidentLlama::with_port(port),
                preset_dir: dir.path(),
                keep: Duration::ZERO,
            },
            ready_timeout,
        },
        &ModeLock::default()
            .begin(AppPorts::new(app.handle(), &processes))
            .await,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
    )
    .await;
    processes.kill_all();

    assert_eq!(result.map(|_| ()), Err(Failure::LlamaExited));
    assert!(started_at.elapsed() < ready_timeout);
}

// @behavior TL-105
#[cfg(unix)]
#[tokio::test]
async fn frees_the_model_when_a_translation_on_the_resident_llama_server_is_cancelled() {
    let dir = TempDir::new("tl-resident-cancel");
    let llama = dir.path().join("llama-server");
    crate::test_support::write_executable(&llama, "#!/bin/sh\nexec sleep 30\n");
    let router = FakeLlama::serve(Replies {
        split_sentences: Box::new(|_| {
            std::thread::sleep(Duration::from_millis(500));
            completion(&json!({"clusters": []}).to_string())
        }),
        ..Replies::default()
    });
    let port = router
        .base_url()
        .rsplit(':')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    let mut settings = ModelSettings::default();
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: dir.file("qwen3-4b.gguf"),
        },
    );
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));
    let mut project = project_of(vec![segment(0, 1_000, "大家好")]);
    project.directory = dir.path().to_path_buf();
    let subtitle = dir.path().join("lecture.srt");
    std::fs::write(&subtitle, "1\n00:00:00,000 --> 00:00:01,000\n大家好\n").unwrap();
    project.resources[0].subtitle = Some(subtitle);
    app.state::<CurrentProject>().replace(project);
    let resident = ResidentLlama::with_port(port);
    let plan = plan_for(Language::Japanese);
    let server = LlamaServer::Router {
        resident: &resident,
        preset_dir: dir.path(),
        keep: Duration::ZERO,
    };
    let translate = TranslateMode {
        llama: &llama,
        model_settings: &settings,
        plan: &plan,
        server: &server,
        ready_timeout: Duration::from_secs(5),
    };
    let lock = ModeLock::default();
    let mode_run = lock.begin(AppPorts::new(app.handle(), &processes)).await;
    let asked_for_chat = async {
        while !router.log.lock().unwrap().contains(&"chat".to_string()) {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    };
    let result = {
        let run = run_mode(
            &translate,
            &mode_run,
            app.state::<CurrentProject>().inner(),
            Phases::start("translate", Phase::Preparation),
        );
        tokio::pin!(run);

        tokio::select! {
            result = &mut run => result,
            () = asked_for_chat => {
                lock.cancel();
                run.await
            }
        }
    };
    drop(mode_run);
    processes.kill_all();

    assert_eq!(result.map(|_| ()), Err(Failure::ModeCancelled));
    assert!(router.log.lock().unwrap().contains(&"unload".to_string()));
}

// @behavior TL-104
#[cfg(unix)]
#[tokio::test]
async fn fails_when_llama_server_exits_before_it_is_ready() {
    let dir = TempDir::new("tl-llama-exits");
    let llama = dir.path().join("llama-server");
    crate::test_support::write_executable(&llama, "#!/bin/sh\nexit 1\n");
    let mut settings = ModelSettings::default();
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: dir.file("qwen3-4b.gguf"),
        },
    );
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));
    app.state::<CurrentProject>()
        .replace(project_of(vec![segment(0, 1_000, "大家好")]));

    let result = run_mode(
        &TranslateMode {
            llama: &llama,
            model_settings: &settings,
            plan: &plan_for(Language::English),
            server: &LlamaServer::Job,
            ready_timeout: Duration::from_secs(10),
        },
        &ModeLock::default()
            .begin(AppPorts::new(app.handle(), &processes))
            .await,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
    )
    .await;

    assert_eq!(result.err(), Some(Failure::LlamaExited));
}

// @behavior TL-085
#[cfg(unix)]
#[tokio::test]
async fn translates_with_the_project_model() {
    let dir = TempDir::new("tl-project-model");
    let llama = dir.path().join("llama-server");
    let args_file = dir.path().join("llama.args");
    crate::test_support::write_executable(
        &llama,
        &format!(
            "#!/bin/sh\necho \"$@\" > '{}'\nexit 1\n",
            args_file.display()
        ),
    );
    let mut settings = ModelSettings::default();
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: dir.file("qwen3-4b.gguf"),
        },
    );
    let project_model = dir.file("gemma-ja.gguf");
    let mut project = project_of(vec![segment(0, 1_000, "大家好")]);
    project.options.models.translation = Some(ModelSource::File {
        path: project_model.clone(),
    });
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));
    app.state::<CurrentProject>().replace(project);

    let _ = run_mode(
        &TranslateMode {
            llama: &llama,
            model_settings: &settings,
            plan: &plan_for(Language::Japanese),
            server: &LlamaServer::Job,
            ready_timeout: Duration::from_secs(1),
        },
        &ModeLock::default()
            .begin(AppPorts::new(app.handle(), &processes))
            .await,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
    )
    .await;

    let args = std::fs::read_to_string(args_file).unwrap();
    assert!(
        args.contains(&format!("-m {} ", project_model.display())),
        "llama-server ran with {args}"
    );
}

// @behavior PJ-094
// @behavior PJ-095
#[cfg(unix)]
#[tokio::test]
async fn holds_the_translation_until_the_run_ends() {
    let dir = TempDir::new("tl-hold");
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
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: dir.file("qwen3-4b.gguf"),
        },
    );
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));
    app.state::<CurrentProject>()
        .replace(project_of(vec![segment(0, 1_000, "大家好")]));
    let running_mode = || app.state::<CurrentProject>().view().unwrap().running_mode();
    let watch = async {
        while !pid_file.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        running_mode()
    };

    let project = app.state::<CurrentProject>();
    let lock = ModeLock::default();
    let mode_run = lock.begin(AppPorts::new(app.handle(), &processes)).await;
    let plan = plan_for(Language::Japanese);
    let translate = TranslateMode {
        llama: &llama,
        model_settings: &settings,
        plan: &plan,
        server: &LlamaServer::Job,
        ready_timeout: Duration::from_secs(1),
    };
    let run = run_mode(
        &translate,
        &mode_run,
        project.inner(),
        Phases::start("translate", Phase::Preparation),
    );

    let (_, seen) = tokio::join!(run, watch);
    drop(mode_run);

    assert_eq!(
        (seen, running_mode()),
        (
            Some(RunningMode::Translation {
                language: Language::Japanese,
                indexes: None
            }),
            None
        )
    );
}

// @behavior TL-007
#[tokio::test]
async fn answers_how_long_each_phase_took() {
    let llama = FakeLlama::with_echo(2);
    let app = mode_app();
    let mut phases = Phases::start("translate", Phase::Loading);
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
        |_, _| {},
    )
    .await
    .unwrap();

    let names: Vec<_> = phases.finish().iter().map(|timing| timing.phase).collect();
    assert_eq!(
        names,
        vec![Phase::Loading, Phase::Detection, Phase::Translation]
    );
}

/// Translates three Segments into English on a real llama-server run as `server`, printing each translation.
async fn translate_on_a_real_llama_server(name: &str, server: &LlamaServer<'_>) {
    let llama = PathBuf::from(std::env::var("TSUZURI_E2E_LLAMA").unwrap());
    let mut settings = ModelSettings::default();
    settings.choose(
        ModelSlot::Translation,
        ModelSource::File {
            path: PathBuf::from(std::env::var("TSUZURI_E2E_TRANSLATION_MODEL").unwrap()),
        },
    );
    let dir = TempDir::new(name);
    let app = mode_app();
    let processes = Processes::new(dir.path().join("processes.json"));
    let mut project = project_of(vec![
        segment(0, 1_000, "co: 大家好"),
        segment(1_000, 3_000, "今天天氣很好"),
        segment(3_000, 5_000, "但我不想出門"),
    ]);
    project.directory = dir.path().to_path_buf();
    std::fs::write(
            dir.file("lecture.srt"),
            "1\n00:00:00,000 --> 00:00:01,000\nco: 大家好\n\n2\n00:00:01,000 --> 00:00:03,000\n今天天氣很好\n\n3\n00:00:03,000 --> 00:00:05,000\n但我不想出門\n",
        )
        .unwrap();
    project.resources[0].subtitle = Some(dir.path().join("lecture.srt"));
    app.state::<CurrentProject>().replace(project);
    let lock = ModeLock::default();
    let mode_run = lock.begin(AppPorts::new(app.handle(), &processes)).await;

    let translated_segments = run_mode(
        &TranslateMode {
            llama: &llama,
            model_settings: &settings,
            plan: &TranslationPlan {
                options: TranslationOptions {
                    has_speaker_labels: true,
                    has_self_review: true,
                    summary_word_limit: Some(50),
                    is_simplified_cleaned: false,
                },
                ..plan_for(Language::English)
            },
            server,
            ready_timeout: llama::READY_TIMEOUT,
        },
        &mode_run,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
    )
    .await
    .unwrap();
    drop(mode_run);
    let mode_run = lock.begin(AppPorts::new(app.handle(), &processes)).await;
    run_mode(
        &TranslateMode {
            llama: &llama,
            model_settings: &settings,
            plan: &TranslationPlan {
                options: TranslationOptions {
                    has_speaker_labels: true,
                    has_self_review: true,
                    summary_word_limit: None,
                    is_simplified_cleaned: false,
                },
                scope: TranslationScope::Segments(vec![1, 2]),
                ..plan_for(Language::English)
            },
            server,
            ready_timeout: llama::READY_TIMEOUT,
        },
        &mode_run,
        app.state::<CurrentProject>().inner(),
        Phases::start("translate", Phase::Preparation),
    )
    .await
    .unwrap();
    processes.kill_all();

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

/// Runs a real llama-server:
/// `TSUZURI_E2E_LLAMA=<llama-server> TSUZURI_E2E_TRANSLATION_MODEL=<gguf> cargo test -- --ignored`
#[tokio::test]
#[ignore = "needs llama-server and a translation Model"]
async fn translates_with_a_real_llama_server() {
    translate_on_a_real_llama_server("tl-e2e", &LlamaServer::Job).await;
}

/// Runs a real llama-server as the Resident llama-server, with the same variables.
#[tokio::test]
#[ignore = "needs llama-server and a translation Model"]
async fn translates_with_a_real_resident_llama_server() {
    let dir = TempDir::new("tl-e2e-resident-preset");
    translate_on_a_real_llama_server(
        "tl-e2e-resident",
        &LlamaServer::Router {
            resident: &ResidentLlama::default(),
            preset_dir: dir.path(),
            keep: Duration::ZERO,
        },
    )
    .await;
}

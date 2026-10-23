use std::collections::BTreeMap;

use super::*;
use crate::script::registry::ScriptFailure;
use crate::script::snapshot::SnapshotSegment;

fn returned(start_ms: u64, end_ms: u64, texts: &[(Language, &str)]) -> SnapshotSegment {
    SnapshotSegment {
        start_ms,
        end_ms,
        speaker: None,
        texts: texts
            .iter()
            .map(|(language, text)| (*language, text.to_string()))
            .collect(),
    }
}

fn greeting_project_in(dir: &TempDir) -> CurrentProject {
    changing_project_in(
        dir,
        &[(0, 1_000, "你好"), (1_000, 2_000, "世界")],
        &[(0, 1_000, "Hello"), (1_000, 2_000, "world")],
    )
}

const MERGED: [(Language, &str); 2] = [
    (Language::TraditionalChinese, "你好，世界"),
    (Language::English, "Hello, world"),
];

// @behavior SR-017
#[test]
fn makes_the_snapshot_of_the_current_resource() {
    let dir = TempDir::new("sr-snapshot");
    let current = greeting_project_in(&dir);

    let snapshot = current.script_snapshot(vec![1]).unwrap();

    assert_eq!(
        (
            snapshot.languages,
            snapshot.segments,
            snapshot.checked_segments
        ),
        (
            vec![Language::TraditionalChinese, Language::English],
            vec![
                returned(
                    0,
                    1_000,
                    &[
                        (Language::TraditionalChinese, "你好"),
                        (Language::English, "Hello")
                    ]
                ),
                returned(
                    1_000,
                    2_000,
                    &[
                        (Language::TraditionalChinese, "世界"),
                        (Language::English, "world")
                    ]
                ),
            ],
            vec![1]
        )
    );
}

// @behavior SR-018
#[test]
fn writes_back_the_segments_an_edit_returns() {
    let dir = TempDir::new("sr-replace");
    let current = greeting_project_in(&dir);

    current
        .replace_segments(&[returned(0, 2_000, &MERGED)])
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[(0, 2_000, "你好，世界")]),
            srt_of(&[(0, 2_000, "Hello, world")])
        ]
    );
}

// @behavior SR-019
#[test]
fn undoes_an_edit_in_one_step() {
    let dir = TempDir::new("sr-replace-undo");
    let current = greeting_project_in(&dir);
    current
        .replace_segments(&[returned(0, 2_000, &MERGED)])
        .unwrap();

    current.undo().unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
            srt_of(&[(0, 1_000, "Hello"), (1_000, 2_000, "world")])
        ]
    );
}

// @behavior SR-020
#[test]
fn drops_the_translation_of_a_segment_returned_without_one() {
    let dir = TempDir::new("sr-replace-drop");
    let current = changing_project_in(&dir, &[(0, 1_000, "你好")], &[(0, 1_000, "Hello")]);

    current
        .replace_segments(&[returned(
            0,
            1_000,
            &[(Language::TraditionalChinese, "你好")],
        )])
        .unwrap();

    assert_eq!(read(&dir, "ep01.en.srt"), srt_of(&[]));
}

fn refusal_of(name: &str, segments: &[SnapshotSegment]) -> (Failure, [String; 2]) {
    let dir = TempDir::new(name);
    let current = greeting_project_in(&dir);
    let failure = current.replace_segments(segments).unwrap_err();
    (failure, [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")])
}

fn untouched() -> [String; 2] {
    [
        srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
        srt_of(&[(0, 1_000, "Hello"), (1_000, 2_000, "world")]),
    ]
}

// @behavior SR-021
#[test]
fn refuses_a_segment_ending_before_it_starts() {
    assert_eq!(
        refusal_of("sr-refuse-times", &[returned(2_000, 1_000, &MERGED)]),
        (
            Failure::Script {
                failure: ScriptFailure::InvalidTimes { number: 1 }
            },
            untouched()
        )
    );
}

// @behavior SR-022
#[test]
fn refuses_segments_out_of_their_start_order() {
    assert_eq!(
        refusal_of(
            "sr-refuse-order",
            &[
                returned(2_000, 3_000, &MERGED),
                returned(1_000, 1_500, &MERGED)
            ]
        ),
        (
            Failure::Script {
                failure: ScriptFailure::UnorderedTimes { number: 2 }
            },
            untouched()
        )
    );
}

// @behavior SR-023
#[test]
fn refuses_a_text_in_a_language_the_resource_has_no_subtitle_in() {
    let texts = [
        (Language::TraditionalChinese, "你好"),
        (Language::Japanese, "こんにちは"),
    ];
    assert_eq!(
        refusal_of("sr-refuse-language", &[returned(0, 1_000, &texts)]),
        (
            Failure::Script {
                failure: ScriptFailure::UnheldLanguage {
                    language: Language::Japanese
                }
            },
            untouched()
        )
    );
}

#[test]
fn reads_a_blank_original_as_an_empty_text() {
    let snapshot = SnapshotSegment {
        texts: BTreeMap::new(),
        ..returned(0, 1_000, &[])
    };
    let dir = TempDir::new("sr-replace-blank");
    let current = greeting_project_in(&dir);

    current.replace_segments(&[snapshot]).unwrap();

    assert_eq!(times_and_texts(&current), owned(&[(0, 1_000, "")]));
}

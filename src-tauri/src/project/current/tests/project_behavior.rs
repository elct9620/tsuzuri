use super::*;

// @behavior PJ-001
#[test]
fn opens_a_directory_as_the_project() {
    let dir = directory_of(
        "pj-open",
        &[
            ("ep01.mp4", ""),
            ("ep01.srt", &cue("你好")),
            ("ep02.mp4", ""),
        ],
    );

    let current = project_in(&dir);

    assert_eq!(
        current.view().unwrap().resource_names(),
        vec!["ep01", "ep02"]
    );
}

// @behavior PJ-015
#[test]
fn selects_the_first_resource_of_an_opened_directory() {
    let dir = directory_of(
        "pj-first",
        &[("ep02.srt", &cue("第二集")), ("ep01.srt", &cue("第一集"))],
    );

    let current = project_in(&dir);

    let view = current.view().unwrap();
    assert_eq!(
        (view.current_resource(), texts(&current)),
        (Some("ep01"), vec!["第一集".to_string()])
    );
}

#[test]
fn opens_a_directory_without_resources_with_none_current() {
    let dir = directory_of("pj-empty", &[("notes.txt", "")]);

    let current = project_in(&dir);

    assert_eq!(current.view().unwrap().current_resource(), None);
}

// @behavior PJ-020
#[test]
fn shows_another_translation_of_the_current_resource() {
    let dir = directory_of(
        "pj-show",
        &[
            ("ep01.srt", &cue("你好")),
            ("ep01.en.srt", &cue("Hello")),
            ("ep01.ja.srt", &cue("こんにちは")),
        ],
    );
    let current = project_in(&dir);

    current.show_translation(Some(Language::Japanese)).unwrap();

    assert_eq!(texts(&current), vec!["こんにちは".to_string()]);
}

// @behavior PJ-108
#[test]
fn shows_a_translation_again_after_showing_none() {
    let dir = directory_of(
        "pj-show-again",
        &[("talk.hd.mp4", ""), ("talk.hd.srt", &cue("你好"))],
    );
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("你好", Some("Hello"))],
        )
        .unwrap();
    current.show_translation(None).unwrap();

    current.show_translation(Some(Language::English)).unwrap();

    assert_eq!(texts(&current), vec!["Hello".to_string()]);
}

#[test]
fn keeps_edited_text_when_showing_another_translation() {
    let dir = directory_of(
        "pj-show-edited",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
    );
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "大家好".to_string())
        .unwrap();

    current.show_translation(None).unwrap();

    assert_eq!(segments(&current), vec![segment("大家好", None)]);
}

// @behavior PJ-021
#[test]
fn selects_another_resource() {
    let dir = directory_of(
        "pj-select",
        &[("ep01.srt", &cue("第一集")), ("ep02.srt", &cue("第二集"))],
    );
    let current = project_in(&dir);

    current.select("ep02").unwrap();

    assert_eq!(texts(&current), vec!["第二集".to_string()]);
}

#[test]
fn refuses_a_resource_the_project_does_not_have() {
    let current = current_project_of(vec![]);

    assert_eq!(current.select("ep09"), Err(Failure::NoResource));
}

// @behavior PJ-007
#[test]
fn opens_the_directory_of_an_srt_file() {
    let dir = directory_of(
        "pj-open-srt",
        &[("interview.srt", &cue("訪談")), ("talk.srt", &cue("演講"))],
    );

    let project =
        open_directory_of(&dir.path().join("talk.srt"), Language::TraditionalChinese).unwrap();

    assert_eq!(
        (
            project.directory.as_path(),
            project.current.map(|current| current.name)
        ),
        (dir.path(), Some("talk".to_string()))
    );
}

// @behavior PJ-023
#[test]
fn opens_a_translation_srt_file_showing_that_translation() {
    let dir = directory_of(
        "pj-open-translation",
        &[
            ("ep01.srt", &cue("你好")),
            ("ep01.en.srt", &cue("Hello")),
            ("ep01.ja.srt", &cue("こんにちは")),
        ],
    );

    let project = open_directory_of(
        &dir.path().join("ep01.ja.srt"),
        Language::TraditionalChinese,
    )
    .unwrap();

    let current = project.current.unwrap();
    assert_eq!(
        (current.name.as_str(), current.translation),
        ("ep01", Some(Language::Japanese))
    );
}

// @behavior PJ-011
#[test]
fn starts_a_new_project_without_a_translation_glossary() {
    let with_glossary = directory_of(
        "pj-glossary",
        &[("glossary.csv", "zh-TW,en\n阿福,Alfred\n")],
    );
    let without_glossary = directory_of("pj-no-glossary", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&with_glossary);

    current.replace(
        Project::open(
            without_glossary.path().to_path_buf(),
            Language::TraditionalChinese,
        )
        .unwrap(),
    );

    assert_eq!(current.view().unwrap().translation_glossary(), None);
}

// @behavior PJ-024
#[test]
fn reads_the_primary_language_from_the_project_config() {
    let dir = directory_of(
        "pj-config-read",
        &[("tsuzuri.config.json", r#"{"language":"ja"}"#)],
    );

    let current = project_in(&dir);

    assert_eq!(current.view().unwrap().language(), Language::Japanese);
}

// @behavior PJ-025
#[test]
fn records_a_new_primary_language_in_the_project_config() {
    let dir = directory_of("pj-config-write", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    current.set_language(Language::Japanese).unwrap();

    assert_eq!(config_of(&dir).language, Some(Language::Japanese));
}

// @behavior PJ-026
#[test]
fn pairs_subtitles_again_under_a_new_primary_language() {
    let dir = directory_of("pj-config-pair", &[("ep01.ja.srt", &cue("こんにちは"))]);
    let current = project_in(&dir);

    current.set_language(Language::Japanese).unwrap();

    assert_eq!(texts(&current), vec!["こんにちは".to_string()]);
}

// @behavior PJ-027
#[test]
fn records_the_translation_language_in_the_project_config() {
    let dir = directory_of("pj-config-translation", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();

    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("你好", Some("Hello"))],
        )
        .unwrap();

    assert_eq!(
        config_of(&dir).translation_language,
        Some(Language::English)
    );
}

// @behavior PJ-028
#[test]
fn writes_an_edited_original_back_to_its_file() {
    let dir = directory_of("pj-write-original", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Text, "大家好".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.srt"), cue("大家好"));
}

// @behavior PJ-029
#[test]
fn writes_an_edited_translation_back_to_its_file() {
    let dir = directory_of(
        "pj-write-translation",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
}

// @behavior PJ-030
#[test]
fn leaves_untranslated_segments_out_of_a_translation_file() {
    let original =
        "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n";
    let dir = directory_of(
        "pj-write-untranslated",
        &[("ep01.srt", original), ("ep01.en.srt", &cue("Hello"))],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
}

// @behavior PJ-012
#[test]
fn names_an_export_by_the_resource_and_its_languages() {
    let mut project = project_of(vec![segment("大家好", Some("Hello"))]);
    if let Some(current) = project.current.as_mut() {
        current.translation = Some(Language::English);
    }
    let current = CurrentProject::default();
    current.replace(project);

    let paths = [
        WrittenText::Original,
        WrittenText::Translation,
        WrittenText::Bilingual,
    ]
    .map(|content| current.export_path(content, ExportFormat::Srt).unwrap());

    assert_eq!(
        paths,
        [
            PathBuf::from("/talks/lecture.srt"),
            PathBuf::from("/talks/lecture.en.srt"),
            PathBuf::from("/talks/lecture.zh-TW.en.srt"),
        ]
    );
}

// @behavior PJ-031
#[test]
fn writes_the_translation_beside_its_original() {
    let original =
        "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n";
    let dir = directory_of("tl-write-file", &[("ep01.srt", original)]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    let translation: Vec<Segment> = source
        .transcript
        .segments
        .iter()
        .map(|segment| Segment {
            translation: Some(format!("EN:{}", segment.text)),
            ..segment.clone()
        })
        .collect();

    current
        .write_translations(&source, Language::English, translation)
        .unwrap();

    assert_eq!(
        file_text(&dir, "ep01.en.srt"),
        "1\n00:00:00,000 --> 00:00:01,000\nEN:你好\n\n2\n00:00:01,000 --> 00:00:02,000\nEN:世界\n"
    );
}

// @behavior PJ-032
#[test]
fn writes_the_translation_of_a_resource_no_longer_current() {
    let dir = directory_of(
        "tl-write-other",
        &[("ep01.srt", &cue("你好")), ("ep02.srt", &cue("再見"))],
    );
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    current.select("ep02").unwrap();

    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("你好", Some("Hello"))],
        )
        .unwrap();

    assert_eq!(
        (file_text(&dir, "ep01.en.srt"), segments(&current)),
        (cue("Hello"), vec![segment("再見", None)])
    );
}

// @behavior PJ-003
#[test]
fn holds_edits_to_text_and_translation() {
    let dir = directory_of(
        "pj-edit",
        &[
            ("ep01.srt", &cue("竹子搞")),
            ("ep01.en.srt", &cue("Bamboo")),
        ],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Text, "逐字稿".to_string())
        .unwrap();
    current
        .edit(0, SegmentField::Translation, "Transcript".to_string())
        .unwrap();

    assert_eq!(
        segments(&current),
        vec![segment("逐字稿", Some("Transcript"))]
    );
}

// @behavior PJ-150
#[test]
fn writes_the_current_resource_as_plain_text() {
    let current = project_with_a_speaker();

    let text = current
        .to_plain_text(WrittenText::Original, true, true)
        .unwrap();

    assert_eq!(text, "阿福: 少爺\n\n我等等就下去\n");
}

// @behavior PJ-151
#[test]
fn leaves_the_speakers_out_of_plain_text() {
    let current = project_with_a_speaker();

    let text = current
        .to_plain_text(WrittenText::Original, false, true)
        .unwrap();

    assert_eq!(text, "少爺\n\n我等等就下去\n");
}

// @behavior PJ-185
#[test]
fn leaves_the_blank_lines_out_of_plain_text() {
    let current = project_with_a_speaker();

    let text = current
        .to_plain_text(WrittenText::Original, true, false)
        .unwrap();

    assert_eq!(text, "阿福: 少爺\n我等等就下去\n");
}

// @behavior PJ-152
#[test]
fn writes_a_bilingual_plain_text_in_the_bilingual_order() {
    let dir = TempDir::new("pj-plain-text-translation-first");
    let current = translation_first_project_in(&dir);

    let text = current
        .to_plain_text(WrittenText::Bilingual, true, true)
        .unwrap();

    assert_eq!(text, "Hello\n大家好\n");
}

// @behavior PJ-153
#[test]
fn names_a_plain_text_export_by_the_resource_and_its_languages() {
    let mut project = project_of(vec![segment("大家好", Some("Hello"))]);
    if let Some(current) = project.current.as_mut() {
        current.translation = Some(Language::English);
    }
    let current = CurrentProject::default();
    current.replace(project);

    let paths = [
        WrittenText::Original,
        WrittenText::Translation,
        WrittenText::Bilingual,
    ]
    .map(|content| {
        current
            .export_path(content, ExportFormat::PlainText)
            .unwrap()
    });

    assert_eq!(
        paths,
        [
            PathBuf::from("/talks/lecture.txt"),
            PathBuf::from("/talks/lecture.en.txt"),
            PathBuf::from("/talks/lecture.zh-TW.en.txt"),
        ]
    );
}

// @behavior PJ-044
#[test]
fn puts_the_translation_first_in_a_bilingual_srt() {
    let dir = TempDir::new("pj-translation-first");
    let current = translation_first_project_in(&dir);

    let srt = current.to_srt(WrittenText::Bilingual).unwrap();

    assert_eq!(srt, cue("Hello\n大家好"));
}

// @behavior PJ-045
#[test]
fn names_a_bilingual_srt_in_its_bilingual_order() {
    let dir = TempDir::new("pj-translation-first-name");
    let current = translation_first_project_in(&dir);

    let path = current
        .export_path(WrittenText::Bilingual, ExportFormat::Srt)
        .unwrap();

    assert_eq!(path, dir.path().join("ep01.en.zh-TW.srt"));
}

// @behavior PJ-046
#[test]
fn keeps_the_project_options_in_the_project_config() {
    let dir = TempDir::new("pj-options-kept");
    translation_first_project_in(&dir);

    let reopened_project = project_in(&dir);

    assert_eq!(
        reopened_project.view().unwrap().options().bilingual_order,
        BilingualOrder::TranslationFirst
    );
}

// @behavior PJ-173
#[test]
fn names_a_project_in_its_project_options() {
    let dir = TempDir::new("pj-project-name");
    let current = lecture_in(&dir);

    current.set_options(options_named(" 週會錄影 ")).unwrap();

    assert_eq!(
        (
            current.view().unwrap().name().to_string(),
            ProjectConfig::load(&dir.path().join("lecture"))
                .unwrap()
                .options
                .name
        ),
        ("週會錄影".to_string(), Some("週會錄影".to_string()))
    );
}

// @behavior PJ-186
#[test]
fn keeps_the_directory_name_in_the_view_of_a_named_project() {
    let dir = TempDir::new("pj-directory-name");
    let current = lecture_in(&dir);

    current.set_options(options_named("週會錄影")).unwrap();

    assert_eq!(current.view().unwrap().directory_name, "lecture");
}

// @behavior PJ-174
#[test]
fn names_a_project_after_its_directory_without_a_name_of_its_own() {
    let dir = TempDir::new("pj-directory-name");
    let current = lecture_in(&dir);

    current.set_options(options_named("   ")).unwrap();

    assert_eq!(
        (
            current.view().unwrap().name().to_string(),
            ProjectConfig::load(&dir.path().join("lecture"))
                .unwrap()
                .options
                .name
        ),
        ("lecture".to_string(), None)
    );
}

// @behavior PJ-104
#[test]
fn keeps_the_project_models_and_transcription_settings_in_the_project_config() {
    let dir = TempDir::new("pj-models-kept");
    let options = ProjectOptions {
        models: ProjectModels {
            transcription: Some(ModelSource::File {
                path: PathBuf::from("/models/kotoba.bin"),
            }),
            ..ProjectModels::default()
        },
        transcription: TranscriptionOverrides {
            has_vad: Some(true),
            ..TranscriptionOverrides::default()
        },
        ..ProjectOptions::default()
    };
    project_in(&dir).set_options(options.clone()).unwrap();

    let reopened_project = project_in(&dir);

    assert_eq!(reopened_project.view().unwrap().options(), &options);
}

// @behavior PJ-050
#[test]
fn saves_the_bilingual_srt_of_an_edited_translation() {
    let dir = TempDir::new("pj-bilingual-translation");
    let current = bilingual_project_in(&dir, &[("en", "Hello")], true);

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.zh-TW.en.srt"), cue("大家好\nHi"));
}

// @behavior PJ-051
#[test]
fn saves_every_bilingual_srt_when_the_original_is_edited() {
    let dir = TempDir::new("pj-bilingual-original");
    let current = bilingual_project_in(&dir, &[("en", "Hello"), ("ja", "こんにちは")], true);

    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();

    assert_eq!(
        [
            read(&dir, "ep01.zh-TW.en.srt"),
            read(&dir, "ep01.zh-TW.ja.srt")
        ],
        [cue("您好\nHello"), cue("您好\nこんにちは")]
    );
}

// @behavior PJ-052
#[test]
fn saves_the_bilingual_srt_once_translated() {
    let dir = TempDir::new("pj-bilingual-translated");
    let current = bilingual_project_in(&dir, &[], true);
    let source = current.snapshot().unwrap();

    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("大家好", Some("Hello"))],
        )
        .unwrap();

    assert_eq!(read(&dir, "ep01.zh-TW.en.srt"), cue("大家好\nHello"));
}

// @behavior PJ-056
#[test]
fn writes_an_edited_speaker_back_to_the_subtitle() {
    let dir = directory_of("pj-speaker", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Speaker, "co".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("co: 你好"));
}

// @behavior PJ-057
#[test]
fn changes_a_segments_times_in_every_subtitle() {
    let dir = TempDir::new("pj-change-times");
    let current = changing_project_in(&dir, &[(0, 1_000, "你好")], &[(0, 1_000, "Hello")]);

    current
        .change_segments(SegmentChange::Times {
            index: 0,
            start_ms: 500,
            end_ms: 1_500,
        })
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[(500, 1_500, "你好")]),
            srt_of(&[(500, 1_500, "Hello")])
        ]
    );
}

// @behavior PJ-058
#[test]
fn inserts_a_segment_into_the_gap_after_another() {
    let dir = TempDir::new("pj-insert-after");
    let current = changing_project_in(&dir, &[(0, 1_000, "你好"), (3_000, 4_000, "再見")], &[]);

    current
        .change_segments(SegmentChange::InsertionAfter { index: 0 })
        .unwrap();

    assert_eq!(
        segments(&current)
            .iter()
            .map(|segment| (segment.start_ms, segment.end_ms, segment.text.as_str()))
            .collect::<Vec<_>>(),
        [
            (0, 1_000, "你好"),
            (1_000, 3_000, ""),
            (3_000, 4_000, "再見")
        ]
    );
}

// @behavior PJ-059
#[test]
fn inserts_a_segment_before_the_first() {
    let dir = TempDir::new("pj-insert-before");
    let current = changing_project_in(&dir, &[(5_000, 6_000, "你好")], &[]);

    current
        .change_segments(SegmentChange::InsertionBefore { index: 0 })
        .unwrap();

    let first = &segments(&current)[0];
    assert_eq!(
        (first.start_ms, first.end_ms, first.text.as_str()),
        (3_000, 5_000, "")
    );
}

// @behavior PJ-060
#[test]
fn deletes_a_segment_from_every_subtitle() {
    let dir = TempDir::new("pj-delete");
    let current = changing_project_in(
        &dir,
        &[(0, 1_000, "你好"), (1_000, 2_000, "世界")],
        &[(0, 1_000, "Hello"), (1_000, 2_000, "world")],
    );

    current
        .change_segments(SegmentChange::Deletion { indexes: vec![0] })
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[(1_000, 2_000, "世界")]),
            srt_of(&[(1_000, 2_000, "world")])
        ]
    );
}

// @behavior PJ-121
#[test]
fn deletes_segments_apart_from_each_other_as_one_change() {
    let dir = TempDir::new("pj-delete-apart");
    let current = changing_project_in(
        &dir,
        &[
            (0, 1_000, "你好"),
            (1_000, 2_000, "今天"),
            (2_000, 3_000, "世界"),
        ],
        &[
            (0, 1_000, "Hello"),
            (1_000, 2_000, "today"),
            (2_000, 3_000, "world"),
        ],
    );

    current
        .change_segments(SegmentChange::Deletion {
            indexes: vec![2, 0],
        })
        .unwrap();
    let after_deletion = [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")];
    current.undo().unwrap();

    assert_eq!(
        (
            after_deletion,
            [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")]
        ),
        (
            [
                srt_of(&[(1_000, 2_000, "今天")]),
                srt_of(&[(1_000, 2_000, "today")])
            ],
            [
                srt_of(&[
                    (0, 1_000, "你好"),
                    (1_000, 2_000, "今天"),
                    (2_000, 3_000, "世界")
                ]),
                srt_of(&[
                    (0, 1_000, "Hello"),
                    (1_000, 2_000, "today"),
                    (2_000, 3_000, "world")
                ])
            ]
        )
    );
}

// @behavior PJ-061
#[test]
fn splits_a_segment_at_a_point_in_its_text() {
    let dir = TempDir::new("pj-split");
    let current = changing_project_in(
        &dir,
        &[(0, 2_000, "你好世界")],
        &[(0, 2_000, "Hello world")],
    );

    current
        .change_segments(SegmentChange::Split { index: 0, at: 2 })
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
            srt_of(&[(0, 1_000, "Hello world")])
        ]
    );
}

// @behavior PJ-192
#[test]
fn keeps_the_translation_shown_through_a_split() {
    let dir = TempDir::new("pj-split-shown");
    let current = changing_project_in(
        &dir,
        &[(0, 2_000, "你好世界")],
        &[(0, 2_000, "Hello world")],
    );
    current.show_translation(Some(Language::English)).unwrap();

    current
        .change_segments(SegmentChange::Split { index: 0, at: 2 })
        .unwrap();

    assert_eq!(
        current.view().unwrap().shown_translation,
        Some(Language::English)
    );
}

// @behavior PJ-062
#[test]
fn merges_a_run_of_segments() {
    let dir = TempDir::new("pj-merge");
    let current = changing_project_in(
        &dir,
        &[(0, 1_000, "你好"), (1_000, 2_000, "世界")],
        &[(0, 1_000, "Hello"), (1_000, 2_000, "world")],
    );

    current
        .change_segments(SegmentChange::Merge { first: 0, last: 1 })
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[(0, 2_000, "你好世界")]),
            srt_of(&[(0, 2_000, "Hello world")])
        ]
    );
}

// @behavior PJ-063
#[test]
fn shifts_a_run_of_segments() {
    let dir = TempDir::new("pj-shift");
    let current = changing_project_in(
        &dir,
        &[(0, 1_000, "一"), (1_000, 2_000, "二"), (2_000, 3_000, "三")],
        &[],
    );

    current
        .change_segments(SegmentChange::Shift {
            first: 1,
            last: 2,
            offset_ms: 500,
        })
        .unwrap();

    assert_eq!(
        read(&dir, "ep01.srt"),
        srt_of(&[(0, 1_000, "一"), (1_500, 2_500, "二"), (2_500, 3_500, "三")])
    );
}

// @behavior PJ-064
#[test]
fn stops_a_shift_at_the_start_of_the_media() {
    let dir = TempDir::new("pj-shift-back");
    let current = changing_project_in(&dir, &[(1_000, 3_000, "你好")], &[]);

    current
        .change_segments(SegmentChange::Shift {
            first: 0,
            last: 0,
            offset_ms: -2_000,
        })
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_000, "你好")]));
}

// @behavior PJ-065
#[test]
fn refuses_a_segment_that_ends_before_it_starts() {
    let dir = TempDir::new("pj-invalid-times");
    let current = changing_project_in(&dir, &[(0, 1_000, "你好")], &[]);

    let result = current.change_segments(SegmentChange::Times {
        index: 0,
        start_ms: 2_000,
        end_ms: 1_000,
    });

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (Err(Failure::InvalidTimes), srt_of(&[(0, 1_000, "你好")]))
    );
}

// @behavior PJ-101
#[test]
fn moves_the_edge_two_segments_share_in_every_subtitle() {
    let dir = TempDir::new("pj-boundary");
    let current = changing_project_in(
        &dir,
        &[(0, 1_000, "你好"), (1_000, 2_000, "世界")],
        &[(0, 1_000, "Hello"), (1_000, 2_000, "world")],
    );

    current
        .change_segments(SegmentChange::Boundary {
            index: 0,
            at_ms: 1_500,
        })
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[(0, 1_500, "你好"), (1_500, 2_000, "世界")]),
            srt_of(&[(0, 1_500, "Hello"), (1_500, 2_000, "world")])
        ]
    );
}

// @behavior PJ-102
#[test]
fn refuses_to_move_a_shared_edge_past_either_segment() {
    let dir = TempDir::new("pj-boundary-past");
    let current = changing_project_in(&dir, &[(0, 1_000, "你好"), (1_000, 2_000, "世界")], &[]);

    let result = current.change_segments(SegmentChange::Boundary {
        index: 0,
        at_ms: 2_500,
    });

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (
            Err(Failure::InvalidTimes),
            srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")])
        )
    );
}

// @behavior PJ-103
#[test]
fn inserts_a_segment_at_times_of_its_own() {
    let dir = TempDir::new("pj-insert-at");
    let current = changing_project_in(&dir, &[(0, 1_000, "你好"), (3_000, 4_000, "再見")], &[]);

    current
        .change_segments(SegmentChange::Insertion {
            start_ms: 1_500,
            end_ms: 2_500,
        })
        .unwrap();

    assert_eq!(
        segments(&current)
            .iter()
            .map(|segment| (segment.start_ms, segment.end_ms, segment.text.as_str()))
            .collect::<Vec<_>>(),
        [
            (0, 1_000, "你好"),
            (1_500, 2_500, ""),
            (3_000, 4_000, "再見")
        ]
    );
}

// @behavior PJ-139
#[test]
fn changes_a_segments_times_to_overlap_the_next() {
    let dir = TempDir::new("pj-times-overlap");
    let current = changing_project_in(&dir, &[(0, 1_000, "一"), (1_000, 2_000, "二")], &[]);

    current
        .change_segments(SegmentChange::Times {
            index: 0,
            start_ms: 0,
            end_ms: 1_500,
        })
        .unwrap();

    assert_eq!(
        read(&dir, "ep01.srt"),
        srt_of(&[(0, 1_500, "一"), (1_000, 2_000, "二")])
    );
}

// @behavior PJ-140
#[test]
fn refuses_a_start_before_the_previous_segments_start() {
    let dir = TempDir::new("pj-times-before-previous");
    let original = [(1_000, 2_000, "一"), (3_000, 4_000, "二")];
    let current = changing_project_in(&dir, &original, &[]);

    let result = current.change_segments(SegmentChange::Times {
        index: 1,
        start_ms: 500,
        end_ms: 4_000,
    });

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (Err(Failure::UnorderedTimes), srt_of(&original))
    );
}

// @behavior PJ-141
#[test]
fn refuses_a_start_after_the_next_segments_start() {
    let dir = TempDir::new("pj-times-after-next");
    let original = [(1_000, 2_000, "一"), (3_000, 4_000, "二")];
    let current = changing_project_in(&dir, &original, &[]);

    let result = current.change_segments(SegmentChange::Times {
        index: 0,
        start_ms: 3_500,
        end_ms: 5_000,
    });

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (Err(Failure::UnorderedTimes), srt_of(&original))
    );
}

// @behavior PJ-142
#[test]
fn inserts_a_segment_after_one_the_next_touches() {
    let dir = TempDir::new("pj-insert-after-touching");
    let current = changing_project_in(&dir, &[(0, 1_000, "一"), (1_000, 2_000, "二")], &[]);

    current
        .change_segments(SegmentChange::InsertionAfter { index: 0 })
        .unwrap();

    assert_eq!(
        times_and_texts(&current),
        owned(&[(0, 1_000, "一"), (1_000, 3_000, ""), (1_000, 2_000, "二")])
    );
}

// @behavior PJ-143
#[test]
fn inserts_a_segment_after_one_the_next_overlaps() {
    let dir = TempDir::new("pj-insert-after-overlapped");
    let current = changing_project_in(&dir, &[(0, 2_000, "一"), (1_000, 3_000, "二")], &[]);

    current
        .change_segments(SegmentChange::InsertionAfter { index: 0 })
        .unwrap();

    assert_eq!(
        times_and_texts(&current),
        owned(&[(0, 2_000, "一"), (1_000, 3_000, "二"), (2_000, 4_000, "")])
    );
}

// @behavior PJ-144
#[test]
fn inserts_a_segment_before_one_the_previous_overlaps() {
    let dir = TempDir::new("pj-insert-before-overlapped");
    let current = changing_project_in(&dir, &[(0, 3_500, "一"), (3_000, 5_000, "二")], &[]);

    current
        .change_segments(SegmentChange::InsertionBefore { index: 1 })
        .unwrap();

    assert_eq!(
        times_and_texts(&current),
        owned(&[(0, 3_500, "一"), (1_000, 3_000, ""), (3_000, 5_000, "二")])
    );
}

// @behavior PJ-148
#[test]
fn splits_a_segment_another_is_said_over() {
    let dir = TempDir::new("pj-split-overlapped");
    let current = changing_project_in(&dir, &[(0, 4_000, "大家好嗎"), (1_000, 1_500, "對啊")], &[]);

    current
        .change_segments(SegmentChange::Split { index: 0, at: 2 })
        .unwrap();

    assert_eq!(
        times_and_texts(&current),
        owned(&[
            (0, 2_000, "大家"),
            (1_000, 1_500, "對啊"),
            (2_000, 4_000, "好嗎")
        ])
    );
}

// @behavior PJ-187
#[test]
fn joins_chinese_and_english_with_a_space() {
    assert_eq!(
        merged_text("pj-merge-english", "這是", "OK 的"),
        srt_of(&[(0, 2_000, "這是 OK 的")])
    );
}

// @behavior PJ-188
#[test]
fn joins_chinese_and_a_number_with_a_space() {
    assert_eq!(
        merged_text("pj-merge-number", "一共有", "3 集"),
        srt_of(&[(0, 2_000, "一共有 3 集")])
    );
}

// @behavior PJ-189
#[test]
fn joins_a_text_already_ending_in_a_space_without_another() {
    assert_eq!(
        merged_text("pj-merge-spaced", "Hello ", "world"),
        srt_of(&[(0, 2_000, "Hello world")])
    );
}

// @behavior PJ-145
#[test]
fn merges_a_segment_with_one_it_overlaps() {
    let dir = TempDir::new("pj-merge-overlapped");
    let current = changing_project_in(&dir, &[(0, 5_000, "大家好"), (2_000, 3_000, "對啊")], &[]);

    current
        .change_segments(SegmentChange::Merge { first: 0, last: 1 })
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 5_000, "大家好對啊")]));
}

// @behavior PJ-146
#[test]
fn refuses_a_shift_past_the_next_segments_start() {
    let dir = TempDir::new("pj-shift-past-next");
    let original = [(0, 1_000, "一"), (2_000, 3_000, "二")];
    let current = changing_project_in(&dir, &original, &[]);

    let result = current.change_segments(SegmentChange::Shift {
        first: 0,
        last: 0,
        offset_ms: 3_000,
    });

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (Err(Failure::UnorderedTimes), srt_of(&original))
    );
}

// @behavior PJ-067
#[test]
fn backs_up_a_translation_before_it_is_written_again() {
    let dir = TempDir::new("pj-backup-translation");
    let current = backup_project_in(&dir, true);
    let source = current.snapshot().unwrap();

    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("大家好", Some("Hi"))],
        )
        .unwrap();

    assert!(is_one_backup_of(
        &overwrite_backups(dir.path()),
        "ep01.en",
        &cue("Hello")
    ));
}

// @behavior PJ-068
#[test]
fn keeps_one_overwrite_each_opening_unless_asked_for_more() {
    let dir = TempDir::new("pj-backup-off");
    let current = backup_project_in(&dir, false);
    let source = current.snapshot().unwrap();

    for translation in ["Hi", "Hey"] {
        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some(translation))],
            )
            .unwrap();
    }

    assert_eq!(
        (kept_overwrites(&dir), output_backups(dir.path()).len()),
        (vec![cue("Hello")], 2)
    );
}

// @behavior PJ-088
#[test]
fn keeps_what_a_transcription_wrote_as_an_output() {
    let dir = directory_of("pj-output-transcribed", &[("lecture.mp4", "")]);
    let current = project_in(&dir);
    let target = whole_transcription_target(&current);

    current.write_transcription(&target, cue("你好")).unwrap();

    let contents: Vec<String> = output_backups(dir.path())
        .into_iter()
        .map(|(_, content)| content)
        .collect();
    assert_eq!(contents, [cue("你好")]);
}

// @behavior PJ-089
#[test]
fn keeps_what_a_translation_wrote_as_an_output() {
    let dir = directory_of("pj-output-translated", &[("ep01.srt", &cue("大家好"))]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();

    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("大家好", Some("Hello"))],
        )
        .unwrap();

    assert!(output_backups(dir.path())
        .iter()
        .any(|(file, content)| file.starts_with("ep01.en.") && *content == cue("Hello")));
}

// @behavior PJ-109
#[test]
fn lists_a_translation_whose_output_could_not_be_kept() {
    let dir = directory_of(
        "pj-output-failed",
        &[("ep01.srt", &cue("大家好")), (".tsuzuri", "")],
    );
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();

    let result = current.write_translations(
        &source,
        Language::English,
        vec![segment("大家好", Some("Hello"))],
    );

    assert_eq!(
        (
            result.is_err(),
            current.view().unwrap().resources[0]
                .translation_languages
                .clone()
        ),
        (true, vec![Language::English])
    );
}

// @behavior PJ-069
#[test]
fn leaves_backups_out_of_the_resources() {
    let dir = directory_of("pj-backup-hidden", &[("ep01.srt", &cue("你好"))]);
    let history = dir.path().join(files::HISTORY_DIR);
    std::fs::create_dir_all(&history).unwrap();
    std::fs::write(history.join("ep01.20260925T023000Z.srt"), cue("舊的")).unwrap();
    std::fs::write(
        history.join("ep01.20260925T023001Z.output.srt"),
        cue("你好"),
    )
    .unwrap();

    let current = project_in(&dir);

    assert_eq!(current.view().unwrap().resource_names(), ["ep01"]);
}

// @behavior PJ-054
#[test]
fn saves_no_bilingual_srt_unless_asked() {
    let dir = TempDir::new("pj-bilingual-off");
    let current = bilingual_project_in(&dir, &[("en", "Hello")], false);

    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();

    assert!(!dir.path().join("ep01.zh-TW.en.srt").exists());
}

// @behavior PJ-004
#[test]
fn writes_the_current_resource_as_edited() {
    let dir = directory_of("pj-export-edited", &[("ep01.srt", &cue("竹子搞"))]);
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "逐字稿".to_string())
        .unwrap();

    let srt = current.to_srt(WrittenText::Original).unwrap();

    assert_eq!(srt, cue("逐字稿"));
}

// @behavior PJ-005
#[test]
fn refuses_work_without_a_project() {
    let current = CurrentProject::default();

    let failures = [
        current.snapshot().map(|_| ()).unwrap_err(),
        current
            .edit(0, SegmentField::Text, "x".to_string())
            .unwrap_err(),
        current
            .to_srt(WrittenText::Original)
            .map(|_| ())
            .unwrap_err(),
    ];

    assert_eq!(
        failures,
        [Failure::NoProject, Failure::NoProject, Failure::NoProject]
    );
}

#[test]
fn refuses_to_transcribe_a_resource_without_media() {
    let current = current_project_of(vec![]);

    assert_eq!(
        current
            .hold_for_transcription(TranscriptionRequest {
                is_overwrite_allowed: false,
                scope: TranscriptionScope::Whole,
            })
            .map(|(target, _)| target),
        Err(Failure::NoMedia)
    );
}

// @behavior PJ-006
#[test]
fn leaves_a_replaced_project_untouched_by_a_late_translation() {
    let dir = directory_of("pj-replaced", &[("ep01.srt", &cue("大家好"))]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    current.replace(project_of(vec![segment("另一份", None)]));

    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("大家好", Some("Hello"))],
        )
        .unwrap();

    assert_eq!(segments(&current), vec![segment("另一份", None)]);
}

// @behavior PJ-010
#[test]
fn records_the_language_of_a_translation() {
    let dir = directory_of(
        "pj-translation-language",
        &[("ep01.srt", &cue("こんにちは"))],
    );
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();

    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("こんにちは", Some("Hello"))],
        )
        .unwrap();

    let view = current.view().unwrap();
    assert_eq!(
        (view.language(), view.translation_language()),
        (Language::TraditionalChinese, Some(Language::English))
    );
}

// @behavior PJ-039
#[test]
fn keeps_an_edit_off_a_subtitle_changed_elsewhere() {
    let dir = directory_of("pj-changed-kept", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

    let _ = current.edit(0, SegmentField::Text, "大家好".to_string());

    assert_eq!(file_text(&dir, "ep01.srt"), cue("您好"));
}

// @behavior PJ-040
#[test]
fn reads_again_a_subtitle_an_edit_found_changed_elsewhere() {
    let dir = directory_of("pj-changed-edit", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

    let result = current.edit(0, SegmentField::Text, "大家好".to_string());

    assert_eq!(
        (result, texts(&current)),
        (Err(Failure::ChangedElsewhere), vec!["您好".to_string()])
    );
}

// @behavior PJ-132
#[test]
fn keeps_what_tsuzuri_wrote_of_a_subtitle_changed_elsewhere() {
    let dir = directory_of("pj-kept-elsewhere", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();
    std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();

    let reload = current.reload_if_changed().unwrap();

    assert_eq!(
        (reload, texts(&current), kept_overwrites(&dir)),
        (
            Reload::ChangedWithBackup,
            vec!["外面改的".to_string()],
            vec![cue("你好"), cue("您好")]
        )
    );
}

// @behavior PJ-133
#[test]
fn keeps_a_version_read_in_from_elsewhere_before_changing_it() {
    let dir = directory_of("pj-kept-read-in", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();
    std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();
    current.reload_if_changed().unwrap();

    current
        .edit(0, SegmentField::Text, "大家好".to_string())
        .unwrap();

    assert_eq!(
        kept_overwrites(&dir),
        vec![cue("你好"), cue("您好"), cue("外面改的")]
    );
}

// @behavior PJ-135
#[test]
fn keeps_a_change_made_elsewhere_during_a_mode_before_writing_over_it() {
    let (dir, current) = translated_in_english("pj-kept-during-mode");
    let (source, _hold) = current
        .hold_for_translation(Language::English, None)
        .unwrap();
    let srt_changed_elsewhere = two_cues("外面改的", "World");
    std::fs::write(dir.path().join("ep01.en.srt"), &srt_changed_elsewhere).unwrap();

    current
        .write_translations(
            &source,
            Language::English,
            translated_again(&source, 0, "Hi"),
        )
        .unwrap();

    assert_eq!(
        (file_text(&dir, "ep01.en.srt"), kept_overwrites(&dir)),
        (
            two_cues("Hi", "World"),
            vec![two_cues("Hello", "World"), srt_changed_elsewhere]
        )
    );
}

// @behavior PJ-136
#[test]
fn counts_the_segments_a_translation_leaves_unmatched_once_retimed_elsewhere() {
    let dir = directory_of(
        "pj-unmatched-translation",
        &[("ep01.srt", &two_cues("你好", "世界"))],
    );
    let current = project_in(&dir);
    let (source, _hold) = current
        .hold_for_translation(Language::English, None)
        .unwrap();
    std::fs::write(
        dir.path().join("ep01.srt"),
        srt_of(&[(0, 1_500, "你好"), (1_500, 2_000, "世界")]),
    )
    .unwrap();
    let mut segments = source.transcript.segments.clone();
    for segment in &mut segments {
        segment.translation = Some(format!("EN:{}", segment.text));
    }

    let restoration = current
        .write_translations(&source, Language::English, segments)
        .unwrap();

    assert_eq!(restoration.unmatched_count, 2);
}

// @behavior PJ-041
#[test]
fn reads_again_a_subtitle_changed_elsewhere_on_focus() {
    let dir = directory_of("pj-changed-focus", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

    current.reload_if_changed().unwrap();

    assert_eq!(texts(&current), vec!["您好".to_string()]);
}

// @behavior PJ-110
#[test]
fn lists_files_added_elsewhere_when_the_project_is_reloaded() {
    let dir = directory_of("pj-reload-added", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();
    std::fs::write(dir.path().join("ep02.srt"), cue("再見")).unwrap();

    current.reload().unwrap();

    assert_eq!(
        (
            resource_names(&current),
            current.view().unwrap().resources[0]
                .translation_languages
                .clone()
        ),
        (
            vec!["ep01".to_string(), "ep02".to_string()],
            vec![Language::English]
        )
    );
}

// @behavior PJ-111
#[test]
fn keeps_the_undo_history_of_a_current_resource_no_one_else_changed() {
    let dir = directory_of("pj-reload-undo", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();

    current.reload().unwrap();

    assert!(current.view().unwrap().has_undo());
}

// @behavior PJ-112
#[test]
fn shows_the_same_translation_after_a_reload() {
    let dir = directory_of(
        "pj-reload-shown",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
    );
    let current = project_in(&dir);
    current.show_translation(None).unwrap();

    current.reload().unwrap();

    assert_eq!(current.view().unwrap().shown_translation, None);
}

// @behavior PJ-119
#[test]
fn forgets_the_undo_history_of_a_resource_that_gained_a_subtitle_elsewhere() {
    let dir = directory_of("pj-reload-undo-added", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();
    std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();

    current.reload().unwrap();

    current.undo().unwrap();
    assert_eq!(
        (
            current.view().unwrap().has_undo(),
            dir.path().join("ep01.en.srt").exists()
        ),
        (false, true)
    );
}

#[test]
fn reads_again_a_subtitle_changed_elsewhere_on_focus_while_a_mode_runs() {
    let dir = directory_of("pj-focus-held", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);
    std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

    let is_reloaded = current.reload_if_changed().unwrap();

    assert_eq!(
        (is_reloaded, texts(&current)),
        (Reload::ChangedWithBackup, vec!["您好".to_string()])
    );
}

// @behavior PJ-113
#[test]
fn selects_the_first_resource_once_the_current_resource_is_gone() {
    let dir = directory_of(
        "pj-reload-gone",
        &[("ep01.srt", &cue("你好")), ("ep02.srt", &cue("再見"))],
    );
    let current = project_in(&dir);
    current.select("ep02").unwrap();
    std::fs::remove_file(dir.path().join("ep02.srt")).unwrap();

    current.reload().unwrap();

    assert_eq!(
        current.view().unwrap().current_resource,
        Some("ep01".to_string())
    );
}

#[test]
fn selects_no_resource_once_none_is_left() {
    let dir = directory_of("pj-reload-empty", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    std::fs::remove_file(dir.path().join("ep01.srt")).unwrap();

    current.reload().unwrap();

    assert_eq!(current.view().unwrap().current_resource, None);
}

// @behavior PJ-114
#[test]
fn keeps_what_a_mode_shows_when_the_project_is_reloaded() {
    let dir = directory_of("pj-reload-held", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);
    current.show_translations(&source, &[segment("你好", Some("Hello"))]);
    std::fs::write(dir.path().join("ep02.srt"), cue("再見")).unwrap();

    current.reload().unwrap();

    assert_eq!(
        (resource_names(&current), texts(&current)),
        (
            vec!["ep01".to_string(), "ep02".to_string()],
            vec!["Hello".to_string()]
        )
    );
}

// @behavior PJ-115
#[test]
fn lists_files_added_elsewhere_when_the_window_regains_focus() {
    let dir = directory_of("pj-focus-added", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    std::fs::write(dir.path().join("ep02.srt"), cue("再見")).unwrap();

    let is_reloaded = current.reload_if_changed().unwrap();

    assert_eq!(
        (is_reloaded, resource_names(&current)),
        (
            Reload::Changed,
            vec!["ep01".to_string(), "ep02".to_string()]
        )
    );
}

// @behavior PJ-042
#[test]
fn writes_edit_after_edit() {
    let dir = directory_of(
        "pj-edit-after-edit",
        &[("ep01.srt", &two_cues("你好", "世界"))],
    );
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "大家好".to_string())
        .unwrap();

    current
        .edit(1, SegmentField::Text, "地球".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.srt"), two_cues("大家好", "地球"));
}

// @behavior PJ-043
#[test]
fn edits_a_translation_tsuzuri_just_wrote() {
    let dir = directory_of("pj-edit-written", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    let translation = vec![Segment {
        translation: Some("Hello".to_string()),
        ..source.transcript.segments[0].clone()
    }];
    current
        .write_translations(&source, Language::English, translation)
        .unwrap();

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
}

// @behavior PJ-071
#[test]
fn names_a_speaker_in_a_translation_as_the_translation_glossary_does() {
    let dir = TempDir::new("pj-speaker-name");
    let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("小明: Hello"))]);

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.en.srt"), cue("Xiao Ming: Hi"));
}

// @behavior PJ-072
#[test]
fn keeps_a_speakers_name_the_translation_glossary_does_not_give() {
    let dir = directory_of(
        "pj-speaker-same-name",
        &[
            ("ep01.srt", &cue("co: 你好")),
            ("ep01.en.srt", &cue("co: Hello")),
        ],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.en.srt"), cue("co: Hi"));
}

// @behavior PJ-073
#[test]
fn names_a_speaker_in_each_text_of_a_bilingual_srt() {
    let dir = TempDir::new("pj-speaker-bilingual");
    let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("小明: Hello"))]);
    current
        .set_options(ProjectOptions {
            is_bilingual_autosaved: true,
            ..ProjectOptions::default()
        })
        .unwrap();

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(
        read(&dir, "ep01.zh-TW.en.srt"),
        cue("小明: 你好\nXiao Ming: Hi")
    );
}

// @behavior PJ-074
#[test]
fn names_a_speaker_in_a_translation_just_made() {
    let dir = TempDir::new("pj-speaker-translated");
    let current = xiao_ming_project_in(&dir, &[]);
    let source = current.snapshot().unwrap();
    let translated_segment = Segment {
        speaker: Some("小明".to_string()),
        ..segment("你好", Some("Hello"))
    };

    current
        .write_translations(&source, Language::English, vec![translated_segment])
        .unwrap();

    assert_eq!(read(&dir, "ep01.en.srt"), cue("Xiao Ming: Hello"));
}

// @behavior PJ-075
#[test]
fn names_a_speaker_in_a_translation_saved_elsewhere() {
    let dir = TempDir::new("pj-speaker-saved");
    let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("Hello"))]);
    let path = dir.path().join("saved.srt");

    current.save_srt(&path, WrittenText::Translation).unwrap();

    assert_eq!(read(&dir, "saved.srt"), cue("Xiao Ming: Hello"));
}

// @behavior PJ-076
#[test]
fn names_a_speaker_in_a_translation_a_segment_change_rewrites() {
    let dir = TempDir::new("pj-speaker-changed");
    let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("Hello"))]);

    current
        .change_segments(SegmentChange::Times {
            index: 0,
            start_ms: 500,
            end_ms: 1_500,
        })
        .unwrap();

    assert_eq!(
        read(&dir, "ep01.en.srt"),
        "1\n00:00:00,500 --> 00:00:01,500\nXiao Ming: Hello\n"
    );
}

// @behavior PJ-147
#[test]
fn names_a_speaker_in_a_translation_for_segments_with_the_same_times_in_their_order() {
    let dir = TempDir::new("pj-speaker-same-times");
    let current = changing_project_in(
        &dir,
        &[(0, 1_000, "大家好"), (0, 1_000, "對啊")],
        &[(0, 1_000, "Hello"), (0, 1_000, "Yeah")],
    );

    current
        .edit(1, SegmentField::Speaker, "co".to_string())
        .unwrap();

    assert_eq!(
        read(&dir, "ep01.en.srt"),
        srt_of(&[(0, 1_000, "Hello"), (0, 1_000, "co: Yeah")])
    );
}

// @behavior PJ-077
#[test]
fn writes_an_edited_speaker_to_every_translation() {
    let dir = directory_of(
        "pj-speaker-every",
        &[
            ("ep01.srt", &cue("你好")),
            ("ep01.en.srt", &cue("Hello")),
            ("ep01.ja.srt", &cue("こんにちは")),
        ],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Speaker, "co".to_string())
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.en.srt"), read(&dir, "ep01.ja.srt")],
        [cue("co: Hello"), cue("co: こんにちは")]
    );
}

// @behavior PJ-096
#[test]
fn clears_a_speaker_from_the_original_and_every_translation() {
    let dir = directory_of(
        "pj-speaker-cleared",
        &[
            ("ep01.srt", &cue("co: 你好")),
            ("ep01.en.srt", &cue("co: Hello")),
        ],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Speaker, String::new())
        .unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [cue("你好"), cue("Hello")]
    );
}

// @behavior PJ-099
#[test]
fn writes_a_translation_made_again_as_one_change() {
    let three =
        |second: &str| srt_of(&[(0, 1_000, "A"), (1_000, 2_000, second), (2_000, 3_000, "C")]);
    let dir = directory_of(
        "tl-retranslate-write",
        &[
            (
                "ep01.srt",
                &srt_of(&[(0, 1_000, "一"), (1_000, 2_000, "二"), (2_000, 3_000, "三")]),
            ),
            ("ep01.en.srt", &three("B")),
        ],
    );
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    let mut segments = source.transcript.segments.clone();
    segments[1].translation = Some("B2".to_string());

    current
        .write_retranslations(&source, Language::English, &[1], segments)
        .unwrap();
    let translation = read(&dir, "ep01.en.srt");
    current.undo().unwrap();

    assert_eq!(
        (
            translation,
            kept_overwrites(&dir),
            read(&dir, "ep01.en.srt")
        ),
        (three("B2"), vec![three("B")], three("B"))
    );
}

// @behavior PJ-100
#[test]
fn refuses_to_translate_again_with_no_translation_shown() {
    let current = current_project_of(vec![segment("大家好", None)]);

    assert_eq!(
        current.shown_translation(),
        Err(Failure::NoTranslationShown)
    );
}

// @behavior PJ-097
#[test]
fn names_the_speaker_of_several_segments_at_once() {
    let three = srt_of(&[
        (0, 1_000, "你好"),
        (1_000, 2_000, "嗨"),
        (2_000, 3_000, "再見"),
    ]);
    let dir = directory_of(
        "pj-speakers-at-once",
        &[
            ("ep01.srt", &three),
            (
                "ep01.en.srt",
                &srt_of(&[
                    (0, 1_000, "Hello"),
                    (1_000, 2_000, "Hi"),
                    (2_000, 3_000, "Bye"),
                ]),
            ),
        ],
    );
    let current = project_in(&dir);

    current.set_speakers(&[0, 2], "co").unwrap();

    assert_eq!(
        [read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")],
        [
            srt_of(&[
                (0, 1_000, "co: 你好"),
                (1_000, 2_000, "嗨"),
                (2_000, 3_000, "co: 再見")
            ]),
            srt_of(&[
                (0, 1_000, "co: Hello"),
                (1_000, 2_000, "Hi"),
                (2_000, 3_000, "co: Bye")
            ]),
        ]
    );
}

// @behavior PJ-098
#[test]
fn undoes_speakers_named_at_once_in_one_step() {
    let three = srt_of(&[
        (0, 1_000, "你好"),
        (1_000, 2_000, "嗨"),
        (2_000, 3_000, "再見"),
    ]);
    let dir = directory_of("pj-speakers-undo", &[("ep01.srt", &three)]);
    let current = project_in(&dir);
    current.set_speakers(&[0, 1, 2], "co").unwrap();

    current.undo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), three);
}

// @behavior PJ-078
#[test]
fn leaves_a_translations_cue_without_a_matching_segment_as_it_is() {
    let dir = directory_of(
            "pj-speaker-unmatched",
            &[
                ("ep01.srt", &cue("你好")),
                (
                    "ep01.ja.srt",
                    "1\n00:00:00,000 --> 00:00:01,000\nこんにちは\n\n2\n00:00:02,000 --> 00:00:03,000\ncl: さようなら\n",
                ),
            ],
        );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Speaker, "co".to_string())
        .unwrap();

    assert_eq!(
            read(&dir, "ep01.ja.srt"),
            "1\n00:00:00,000 --> 00:00:01,000\nco: こんにちは\n\n2\n00:00:02,000 --> 00:00:03,000\ncl: さようなら\n"
        );
}

// @behavior PJ-079
#[test]
fn names_an_edited_speaker_in_every_translation_as_the_translation_glossary_does() {
    let dir = directory_of(
        "pj-speaker-every-named",
        &[
            ("glossary.csv", "zh-TW,en,type\n小明,Xiao Ming,speaker\n"),
            ("ep01.srt", &cue("你好")),
            ("ep01.en.srt", &cue("Hello")),
            ("ep01.ja.srt", &cue("こんにちは")),
        ],
    );
    let current = project_in(&dir);
    current.show_translation(Some(Language::Japanese)).unwrap();

    current
        .edit(0, SegmentField::Speaker, "小明".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.en.srt"), cue("Xiao Ming: Hello"));
}

// @behavior PJ-137
#[test]
fn tells_the_webview_what_the_translation_glossary_calls_each_speaker_in_the_translation_shown() {
    let dir = TempDir::new("pj-speaker-shown-names");
    let current = xiao_ming_project_in(&dir, &[("ep01.en.srt", &cue("Xiao Ming: Hello"))]);
    current.show_translation(Some(Language::English)).unwrap();

    assert_eq!(
        current.view().unwrap().shown_speaker_names(),
        &HashMap::from([("小明".to_string(), "Xiao Ming".to_string())])
    );
}

// @behavior PJ-080
#[test]
fn carries_the_speakers_of_a_new_transcription_to_each_translation() {
    let dir = TempDir::new("pj-speaker-transcribed");

    transcribe_over_speakers(&dir, false);

    assert_eq!(read(&dir, "ep01.en.srt"), cue("Hello"));
}

// @behavior PJ-081
#[test]
fn keeps_a_backup_of_a_translation_a_transcription_changes() {
    let dir = TempDir::new("pj-speaker-transcribed-backup");

    transcribe_over_speakers(&dir, true);

    assert!(overwrite_backups(dir.path())
        .iter()
        .any(|(file, text)| file.starts_with("ep01.en.") && *text == cue("co: Hello")));
}

// @behavior PJ-082
#[test]
fn keeps_no_backup_of_a_translation_a_transcription_leaves_as_it_is() {
    let dir = TempDir::new("pj-transcribed-unchanged");

    transcribe_over(&dir, "", true);

    assert!(!overwrite_backups(dir.path())
        .iter()
        .any(|(file, _)| file.starts_with("ep01.en.")));
}

// @behavior PJ-083
#[test]
fn keeps_one_label_on_a_translation_with_a_long_speaker_name() {
    let dir = directory_of(
        "pj-speaker-long",
        &[
            (
                "glossary.csv",
                "zh-TW,en,type\n小明,Christopher Nolan Jr.,speaker\n",
            ),
            ("ep01.srt", &cue("小明: 你好")),
            ("ep01.en.srt", &cue("Christopher Nolan Jr.: Hello")),
        ],
    );
    let current = project_in(&dir);

    current
        .change_segments(SegmentChange::Times {
            index: 0,
            start_ms: 500,
            end_ms: 1_500,
        })
        .unwrap();

    assert_eq!(
        read(&dir, "ep01.en.srt"),
        "1\n00:00:00,500 --> 00:00:01,500\nChristopher Nolan Jr.: Hello\n"
    );
}

// @behavior PJ-084
#[test]
fn reads_a_translations_dialogue_that_opens_like_a_label() {
    let dir = directory_of(
        "pj-translation-colon",
        &[
            ("ep01.srt", &cue("你好")),
            ("ep01.en.srt", &cue("Note: hi")),
        ],
    );

    let current = project_in(&dir);

    assert_eq!(shown_translation(&current).as_deref(), Some("Note: hi"));
}

// @behavior PJ-085
#[test]
fn takes_off_only_the_label_a_translations_speaker_has() {
    let dir = directory_of(
        "pj-translation-expected-label",
        &[
            ("glossary.csv", "zh-TW,en,type\n小明,Xiao Ming,speaker\n"),
            ("ep01.srt", &cue("小明: 你好")),
            ("ep01.en.srt", &cue("Xiao Ming: Note: hi")),
        ],
    );

    let current = project_in(&dir);

    assert_eq!(shown_translation(&current).as_deref(), Some("Note: hi"));
}

// @behavior PJ-086
#[test]
fn puts_a_new_speaker_before_a_translations_dialogue_as_written() {
    let dir = directory_of(
        "pj-translation-new-speaker",
        &[
            ("ep01.srt", &cue("你好")),
            ("ep01.en.srt", &cue("Note: hi")),
            ("ep01.ja.srt", &cue("メモ：やあ")),
        ],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Speaker, "co".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.ja.srt"), cue("co: メモ：やあ"));
}

// @behavior PJ-087
#[test]
fn takes_off_a_speakers_former_name_in_a_translation() {
    let dir = directory_of(
        "pj-translation-former-name",
        &[
            ("glossary.csv", "zh-TW,en,type\n小明,Ming,speaker\n"),
            ("ep01.srt", &cue("小明: 你好")),
            ("ep01.en.srt", &cue("Xiao Ming: Hello")),
        ],
    );

    let current = project_in(&dir);

    assert_eq!(shown_translation(&current).as_deref(), Some("Hello"));
}

// @behavior PJ-122
#[test]
fn keeps_a_translation_whole_when_edited_after_a_translation_ended_early() {
    let dir = directory_of(
        "pj-translation-ended",
        &[
            ("ep01.srt", &two_cues("你好", "世界")),
            ("ep01.en.srt", &two_cues("Hello", "World")),
        ],
    );
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    {
        let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);
        current.show_translations(&source, &[]);
    }

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "World"));
}

#[test]
fn starts_an_edit_from_what_the_files_hold_rather_than_what_was_shown() {
    let dir = directory_of(
        "pj-edit-from-files",
        &[
            ("ep01.srt", &two_cues("你好", "世界")),
            ("ep01.en.srt", &two_cues("Hello", "World")),
        ],
    );
    let current = project_in(&dir);
    if let Some(shown) = current
        .lock()
        .project
        .as_mut()
        .and_then(|project| project.current.as_mut())
    {
        shown.transcript.segments[1].translation = None;
    }

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "World"));
}

// @behavior PJ-125
#[test]
fn translates_again_the_translation_chosen_whichever_is_shown_when_it_starts() {
    let (dir, current) = translated_in_english("pj-retranslate-shown");
    current.show_translation(None).unwrap();
    let (source, _hold) = current
        .hold_for_translation(Language::English, Some(vec![0]))
        .unwrap();

    current
        .write_retranslations(
            &source,
            Language::English,
            &[0],
            translated_again(&source, 0, "Hi"),
        )
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "World"));
}

// @behavior PJ-126
#[test]
fn keeps_an_edit_made_while_other_segments_are_translated_again() {
    let (dir, current) = translated_in_english("pj-retranslate-edit");
    let (source, _hold) = current
        .hold_for_translation(Language::English, Some(vec![0]))
        .unwrap();
    current
        .edit(1, SegmentField::Translation, "Earth".to_string())
        .unwrap();

    current
        .write_retranslations(
            &source,
            Language::English,
            &[0],
            translated_again(&source, 0, "Hi"),
        )
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.en.srt"), two_cues("Hi", "Earth"));
}

// @behavior PJ-127
#[test]
fn refuses_an_edit_of_a_segment_being_translated_again() {
    let (dir, current) = translated_in_english("pj-retranslate-held");
    let _held = current
        .hold_for_translation(Language::English, Some(vec![0]))
        .unwrap();

    let result = current.edit(0, SegmentField::Translation, "Hi".to_string());

    assert_eq!(
        (result, file_text(&dir, "ep01.en.srt")),
        (Err(Failure::ModeRunning), two_cues("Hello", "World"))
    );
}

// @behavior PJ-128
#[test]
fn refuses_to_show_another_translation_while_a_mode_runs() {
    let (dir, current) = translated_in_english("pj-show-held");
    let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

    let result = current.show_translation(None);

    assert_eq!(
        (result, current.view().unwrap().shown_translation),
        (Err(Failure::ModeRunning), Some(Language::English))
    );
}

// @behavior PJ-129
#[test]
fn keeps_a_subtitle_once_before_its_first_change_since_opening() {
    let (dir, current) = translated_in_english("pj-first-change");

    for translation in ["Hi", "Hey"] {
        current
            .edit(0, SegmentField::Translation, translation.to_string())
            .unwrap();
    }

    assert_eq!(kept_overwrites(&dir), vec![two_cues("Hello", "World")]);
}

// @behavior PJ-130
#[test]
fn keeps_no_overwrite_of_what_a_mode_kept_as_an_output_since_opening() {
    let dir = directory_of("pj-first-change-output", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("你好", Some("Hello"))],
        )
        .unwrap();

    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();

    assert_eq!(
        (kept_overwrites(&dir), output_backups(dir.path()).len()),
        (Vec::<String>::new(), 1)
    );
}

// @behavior PJ-131
#[test]
fn keeps_a_subtitle_again_before_its_first_change_once_opened_again() {
    let (dir, current) = translated_in_english("pj-first-change-again");
    current
        .edit(0, SegmentField::Translation, "Hi".to_string())
        .unwrap();
    let reopened_project = project_in(&dir);

    reopened_project
        .edit(0, SegmentField::Translation, "Hey".to_string())
        .unwrap();

    assert_eq!(
        kept_overwrites(&dir),
        vec![two_cues("Hello", "World"), two_cues("Hi", "World")]
    );
}

// @behavior PJ-123
#[test]
fn keeps_an_original_whole_when_edited_after_a_transcription_ended_early() {
    let dir = directory_of(
        "pj-transcription-ended",
        &[("ep01.srt", &two_cues("你好", "世界"))],
    );
    let current = project_in(&dir);
    {
        let _hold = hold_ep01(&current, &dir, RunningMode::Transcription);
        current.show_transcript(Vec::new());
        current.push_segment(segment("你好", None));
    }

    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();

    assert_eq!(file_text(&dir, "ep01.srt"), two_cues("您好", "世界"));
}

// @behavior PJ-124
#[test]
fn shows_what_the_files_hold_once_a_mode_ends_without_writing() {
    let dir = directory_of("pj-mode-ended", &[("ep01.srt", &two_cues("你好", "世界"))]);
    let current = project_in(&dir);
    let hold = hold_ep01(&current, &dir, RunningMode::Transcription);
    current.show_transcript(vec![segment("大家好", None)]);
    let shown_while_running = texts(&current);

    drop(hold);

    assert_eq!(
        (shown_while_running, texts(&current)),
        (
            vec!["大家好".to_string()],
            vec!["你好".to_string(), "世界".to_string()]
        )
    );
}

// @behavior PJ-090
#[test]
fn refuses_an_edit_while_its_resource_is_transcribed() {
    let dir = directory_of("pj-hold-transcribed", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let _hold = hold_ep01(&current, &dir, RunningMode::Transcription);

    let result = current.edit(0, SegmentField::Text, "您好".to_string());

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (Err(Failure::ModeRunning), cue("你好"))
    );
}

// @behavior PJ-091
#[test]
fn refuses_an_edit_of_the_translation_being_written() {
    let dir = directory_of(
        "pj-hold-translation",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
    );
    let current = project_in(&dir);
    current.show_translation(Some(Language::English)).unwrap();
    let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

    let result = current.edit(0, SegmentField::Translation, "Hi".to_string());

    assert_eq!(result, Err(Failure::ModeRunning));
}

// @behavior PJ-092
#[test]
fn edits_the_original_while_it_is_translated() {
    let dir = directory_of("pj-hold-original", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("您好"));
}

// @behavior PJ-093
#[test]
fn refuses_a_segment_change_or_an_undo_while_a_mode_runs() {
    let dir = directory_of("pj-hold-change", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();
    let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

    let results = (
        current.change_segments(SegmentChange::Deletion { indexes: vec![0] }),
        current.undo(),
    );

    assert_eq!(
        results,
        (Err(Failure::ModeRunning), Err(Failure::ModeRunning))
    );
}

// @behavior PJ-094
#[test]
fn frees_the_subtitles_once_a_mode_ends() {
    let dir = directory_of("pj-hold-freed", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    drop(hold_ep01(&current, &dir, RunningMode::Transcription));

    current
        .edit(0, SegmentField::Text, "您好".to_string())
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("您好"));
}

// @behavior PJ-095
#[test]
fn says_which_mode_runs_on_the_current_resource() {
    let dir = directory_of("pj-hold-view", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    let _hold = hold_ep01(&current, &dir, ENGLISH_TRANSLATION);

    assert_eq!(
        current.view().unwrap().running_mode(),
        Some(ENGLISH_TRANSLATION)
    );
}

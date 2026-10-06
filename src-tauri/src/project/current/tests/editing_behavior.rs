use super::*;

// @behavior ED-079
#[test]
fn replaces_a_text_across_the_current_resource() {
    let dir = directory_of(
        "ed-replace-original",
        &[("ep01.srt", &two_cues("你好，世界。", "再見，朋友。"))],
    );
    let current = project_in(&dir);

    let count = current
        .replace_text(SegmentField::Text, &replacement("，", " ", false))
        .unwrap();

    assert_eq!(count, 2);
    assert_eq!(
        read(&dir, "ep01.srt"),
        two_cues("你好 世界。", "再見 朋友。")
    );
}

// @behavior ED-083
#[test]
fn refuses_a_regular_expression_that_cannot_be_read() {
    let dir = directory_of("ed-replace-invalid", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    let result = current.replace_text(SegmentField::Text, &replacement("(", "", true));

    assert!(matches!(result, Err(Failure::InvalidPattern { .. })));
    assert_eq!(read(&dir, "ep01.srt"), cue("你好"));
}

// @behavior ED-084
#[test]
fn replaces_in_the_translation_shown() {
    let dir = directory_of(
        "ed-replace-translation",
        &[
            ("ep01.srt", &two_cues("你好，世界", "再見")),
            ("ep01.en.srt", &cue("Hello, world")),
        ],
    );
    let current = project_in(&dir);

    current
        .replace_text(SegmentField::Translation, &replacement(",", "", false))
        .unwrap();

    assert_eq!(read(&dir, "ep01.en.srt"), cue("Hello world"));
    assert_eq!(read(&dir, "ep01.srt"), two_cues("你好，世界", "再見"));
    assert_eq!(segments(&current)[1].translation, None);
}

// @behavior ED-085
#[test]
fn undoes_a_replacement_at_once() {
    let original = two_cues("你好，世界", "再見，朋友");
    let dir = directory_of("ed-replace-undo", &[("ep01.srt", &original)]);
    let current = project_in(&dir);
    current
        .replace_text(SegmentField::Text, &replacement("，", " ", false))
        .unwrap();

    current.undo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), original);
}

// @behavior ED-086
#[test]
fn writes_nothing_when_nothing_matches() {
    let as_written = "1\r\n00:00:00,000 --> 00:00:01,000\r\n你好\r\n";
    let dir = directory_of("ed-replace-none", &[("ep01.srt", as_written)]);
    let current = project_in(&dir);
    let nothing = replacement("。", "", false);

    let count = current.replace_text(SegmentField::Text, &nothing).unwrap();
    let file_after = read(&dir, "ep01.srt");
    edit_text(&current, "您好");
    current.replace_text(SegmentField::Text, &nothing).unwrap();
    current.undo().unwrap();

    assert_eq!(count, 0);
    assert_eq!(file_after, as_written);
    assert_eq!(segments(&current)[0].text, "你好");
}

// @behavior ED-094
#[test]
fn leaves_out_what_follows_the_last_character_of_an_edited_text() {
    let dir = directory_of("ed-edit-trailing", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    edit_text(&current, "您好\n ");

    assert_eq!(segments(&current)[0].text, "您好");
}

// @behavior ED-095
#[test]
fn leaves_out_what_follows_the_last_character_of_an_edited_translation() {
    let dir = directory_of(
        "ed-edit-trailing-translation",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hi"))],
    );
    let current = project_in(&dir);

    current
        .edit(0, SegmentField::Translation, "Hello\n".to_string())
        .unwrap();

    assert_eq!(segments(&current), vec![segment("你好", Some("Hello"))]);
}

#[test]
fn refuses_a_translation_with_none_shown() {
    let dir = directory_of("ed-replace-no-translation", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    let result = current.replace_text(SegmentField::Translation, &replacement("你", "您", false));

    assert_eq!(result, Err(Failure::NoTranslationShown));
}

#[test]
fn refuses_to_search_or_replace_in_the_speakers() {
    let dir = directory_of("ed-speaker-search", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    let results = (
        current
            .text_matches(
                SegmentField::Speaker,
                &Search {
                    pattern: "你".to_string(),
                    is_regex: false,
                },
            )
            .err(),
        current
            .replace_text(SegmentField::Speaker, &replacement("你", "您", false))
            .err(),
    );

    let speaker_not_searched = Failure::Internal {
        detail: "a Speaker is not searched".to_string(),
    };
    assert_eq!(
        results,
        (
            Some(speaker_not_searched.clone()),
            Some(speaker_not_searched)
        )
    );
}

// @behavior ED-137
#[test]
fn finds_every_match_across_the_current_resource() {
    let cues = "1\n00:00:00,000 --> 00:00:01,000\n你好，世界\n\n2\n00:00:01,000 --> 00:00:02,000\n再見\n\n3\n00:00:02,000 --> 00:00:03,000\n好，走吧\n";
    let dir = directory_of("ed-find", &[("ep01.srt", cues)]);
    let current = project_in(&dir);

    let matches = current
        .text_matches(
            SegmentField::Text,
            &Search {
                pattern: "，".to_string(),
                is_regex: false,
            },
        )
        .unwrap();

    assert_eq!(
        matches,
        vec![
            TextMatch {
                index: 0,
                start: 2,
                end: 3
            },
            TextMatch {
                index: 2,
                start: 1,
                end: 2
            },
        ]
    );
}

// @behavior ED-123
#[test]
fn cleans_simplified_chinese_out_of_chosen_segments() {
    let dir = directory_of(
        "ed-clean-segments",
        &[("ep01.srt", &two_cues("这是测试", "还没"))],
    );
    let current = project_in(&dir);

    let count = current.clean_simplified(&chosen_segments(&[0])).unwrap();

    assert_eq!(count, 3);
    assert_eq!(read(&dir, "ep01.srt"), two_cues("這是測試", "还没"));
}

// @behavior ED-124
#[test]
fn cleans_simplified_chinese_out_of_a_chosen_range() {
    let dir = directory_of("ed-clean-range", &[("ep01.srt", &cue("这是测试"))]);
    let current = project_in(&dir);

    current
        .clean_simplified(&CleanupScope::Range {
            index: 0,
            field: SegmentField::Text,
            start: 2,
            end: 4,
        })
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("这是測試"));
}

// @behavior ED-125
#[test]
fn cleans_the_translation_shown_when_it_is_in_traditional_chinese() {
    let dir = directory_of(
        "ed-clean-translation",
        &[
            ("tsuzuri.config.json", r#"{"language":"ja"}"#),
            ("ep01.srt", &cue("こんにちは")),
            ("ep01.zh-TW.srt", &cue("你们好")),
        ],
    );
    let current = project_in(&dir);

    current.clean_simplified(&chosen_segments(&[0])).unwrap();

    assert_eq!(read(&dir, "ep01.zh-TW.srt"), cue("你們好"));
    assert_eq!(read(&dir, "ep01.srt"), cue("こんにちは"));
}

// @behavior ED-126
#[test]
fn refuses_a_cleanup_with_no_text_in_traditional_chinese() {
    let dir = directory_of(
        "ed-clean-none",
        &[
            ("tsuzuri.config.json", r#"{"language":"en"}"#),
            ("ep01.srt", &cue("这是")),
        ],
    );
    let current = project_in(&dir);

    let result = current.clean_simplified(&chosen_segments(&[0]));

    assert_eq!(result, Err(Failure::NoTraditionalChinese));
    assert_eq!(read(&dir, "ep01.srt"), cue("这是"));
}

#[test]
fn refuses_a_range_outside_the_text_in_traditional_chinese() {
    let dir = directory_of("ed-clean-range-other", &[("ep01.srt", &cue("这是"))]);
    let current = project_in(&dir);
    let range = |field, end| CleanupScope::Range {
        index: 0,
        field,
        start: 0,
        end,
    };

    assert_eq!(
        current.clean_simplified(&range(SegmentField::Translation, 1)),
        Err(Failure::NoTraditionalChinese)
    );
    assert!(matches!(
        current.clean_simplified(&range(SegmentField::Text, 3)),
        Err(Failure::Internal { .. })
    ));
    assert!(matches!(
        current.clean_simplified(&chosen_segments(&[1])),
        Err(Failure::Internal { .. })
    ));
}

// @behavior ED-127
#[test]
fn undoes_a_cleanup_at_once() {
    let original = two_cues("这是", "测试");
    let dir = directory_of("ed-clean-undo", &[("ep01.srt", &original)]);
    let current = project_in(&dir);
    current.clean_simplified(&chosen_segments(&[0, 1])).unwrap();

    current.undo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), original);
}

use super::*;

// @behavior UD-001
#[test]
fn undoes_an_edit() {
    let dir = directory_of("ud-undo", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    edit_text(&current, "您好");

    current.undo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("你好"));
    assert_eq!(current.view().unwrap().segments()[0].text, "你好");
}

// @behavior UD-002
#[test]
fn redoes_an_undone_edit() {
    let dir = directory_of("ud-redo", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    edit_text(&current, "您好");
    current.undo().unwrap();

    current.redo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("您好"));
}

// @behavior UD-003
#[test]
fn undoes_a_segment_change_across_every_subtitle() {
    let dir = directory_of(
        "ud-merge",
        &[
            ("ep01.srt", &two_cues("你好", "世界")),
            ("ep01.en.srt", &two_cues("Hello", "world")),
        ],
    );
    let current = project_in(&dir);
    current
        .change_segments(SegmentChange::Merge { first: 0, last: 1 })
        .unwrap();

    current.undo().unwrap();

    assert_eq!(
        (read(&dir, "ep01.srt"), read(&dir, "ep01.en.srt")),
        (two_cues("你好", "世界"), two_cues("Hello", "world"))
    );
}

// @behavior UD-019
#[test]
fn keeps_the_translation_shown_through_an_undo() {
    let dir = directory_of(
        "ud-undo-shown",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
    );
    let current = project_in(&dir);
    current.show_translation(Some(Language::English)).unwrap();
    edit_text(&current, "您好");

    current.undo().unwrap();

    assert_eq!(
        current.view().unwrap().shown_translation,
        Some(Language::English)
    );
}

// @behavior UD-004
#[test]
fn undoes_a_translation_as_one_change() {
    let dir = directory_of("ud-translation", &[("ep01.srt", &cue("大家好"))]);
    let current = project_in(&dir);
    let source = current.snapshot().unwrap();
    current
        .write_translations(
            &source,
            Language::English,
            vec![segment("大家好", Some("Hello"))],
        )
        .unwrap();

    current.undo().unwrap();

    assert!(!dir.path().join("ep01.en.srt").exists());
}

// @behavior UD-005
#[test]
fn undoes_a_transcription_as_one_change() {
    let dir = directory_of(
        "ud-transcription",
        &[("ep01.mp4", ""), ("ep01.srt", &cue("舊的"))],
    );
    let current = project_in(&dir);
    let target = whole_transcription_target(&current);
    current.write_transcription(&target, cue("新的")).unwrap();

    current.undo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("舊的"));
}

// @behavior UD-006
#[test]
fn undoes_a_restore() {
    let dir = directory_of("ud-restore", &[("ep01.srt", &cue("新的"))]);
    write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
    let current = project_in(&dir);
    current
        .restore_version(None, "ep01.20260925T023000Z.srt")
        .unwrap();

    current.undo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), cue("新的"));
}

// @behavior UD-007
#[test]
fn clears_what_can_be_redone_with_a_new_change() {
    let dir = directory_of("ud-redo-cleared", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    edit_text(&current, "您好");
    current.undo().unwrap();

    edit_text(&current, "妳好");

    assert!(!current.view().unwrap().has_redo());
}

// @behavior UD-008
#[test]
fn keeps_each_resources_changes_apart() {
    let dir = directory_of(
        "ud-apart",
        &[("ep01.srt", &cue("一")), ("ep02.srt", &cue("二"))],
    );
    let current = project_in(&dir);
    edit_text(&current, "壹");
    current.select("ep02").unwrap();
    edit_text(&current, "貳");
    current.select("ep01").unwrap();

    current.undo().unwrap();

    assert_eq!(
        (read(&dir, "ep01.srt"), read(&dir, "ep02.srt")),
        (cue("一"), cue("貳"))
    );
}

// @behavior UD-009
#[test]
fn undoes_at_most_100_changes() {
    let dir = directory_of("ud-depth", &[("ep01.srt", &cue("0"))]);
    let current = project_in(&dir);
    for text in 1..=101 {
        edit_text(&current, &text.to_string());
    }

    while current.view().unwrap().has_undo() {
        current.undo().unwrap();
    }

    assert_eq!(read(&dir, "ep01.srt"), cue("1"));
}

// @behavior UD-010
#[test]
fn forgets_the_changes_of_a_subtitle_changed_elsewhere() {
    let dir = directory_of("ud-elsewhere", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    edit_text(&current, "您好");
    std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();
    current.reload_if_changed().unwrap();

    assert!(!current.view().unwrap().has_undo());
}

// @behavior UD-018
#[test]
fn refuses_an_undo_over_a_subtitle_changed_elsewhere() {
    let dir = directory_of("ud-elsewhere", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    edit_text(&current, "您好");
    std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();

    let result = current.undo();

    assert_eq!(
        (
            result,
            read(&dir, "ep01.srt"),
            current.view().unwrap().has_undo()
        ),
        (Err(Failure::ChangedElsewhere), cue("外面改的"), false)
    );
}

// @behavior UD-011
#[test]
fn undoes_without_a_backup() {
    let dir = directory_of("ud-no-backup", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);
    current
        .set_options(ProjectOptions {
            is_overwrite_backed_up: true,
            ..ProjectOptions::default()
        })
        .unwrap();
    edit_text(&current, "您好");

    current.undo().unwrap();

    assert_eq!(kept_overwrites(&dir), vec![cue("你好")]);
}

// @behavior UD-012
#[test]
fn leaves_out_an_edit_that_changes_nothing() {
    let dir = directory_of("ud-unchanged", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    edit_text(&current, "你好");

    assert!(!current.view().unwrap().has_undo());
}

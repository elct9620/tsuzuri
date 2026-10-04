use super::*;

// @behavior VR-001
#[test]
fn lists_a_subtitles_backups_newest_first() {
    let dir = directory_of(
        "vr-newest-first",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
    );
    write_backup(&dir, "ep01.en.20260925T023000Z.srt", &cue("Hi"));
    write_backup(&dir, "ep01.en.20260925T030000Z.srt", &cue("Hey"));
    let current = project_in(&dir);

    assert_eq!(
        backup_files(&current)[1],
        (
            Some(Language::English),
            vec![
                "ep01.en.20260925T030000Z.srt".to_string(),
                "ep01.en.20260925T023000Z.srt".to_string()
            ]
        )
    );
}

// @behavior VR-002
#[test]
fn keeps_each_subtitles_backups_apart() {
    let dir = directory_of(
        "vr-apart",
        &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
    );
    write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("您好"));
    write_backup(&dir, "ep01.en.20260925T023000Z.srt", &cue("Hi"));
    let current = project_in(&dir);

    assert_eq!(
        backup_files(&current)[0],
        (None, vec!["ep01.20260925T023000Z.srt".to_string()])
    );
}

// @behavior VR-010
#[test]
fn tells_an_output_from_an_overwrite() {
    let dir = directory_of("vr-kinds", &[("ep01.srt", &cue("你好"))]);
    write_backup(&dir, "ep01.20260925T023000Z.output.srt", &cue("您好"));
    write_backup(&dir, "ep01.20260925T030000Z.srt", &cue("妳好"));
    let current = project_in(&dir);

    let kinds: Vec<(String, BackupKind)> = current.subtitle_versions().unwrap()[0]
        .backups
        .iter()
        .map(|backup| (backup.taken_at.clone(), backup.kind))
        .collect();

    assert_eq!(
        kinds,
        [
            ("20260925T030000Z".to_string(), BackupKind::Overwrite),
            ("20260925T023000Z".to_string(), BackupKind::Output)
        ]
    );
}

// @behavior VR-004
#[test]
fn restores_a_backup() {
    let dir = directory_of("vr-restore", &[("ep01.srt", &cue("新的"))]);
    write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
    let current = project_in(&dir);

    current
        .restore_version(None, "ep01.20260925T023000Z.srt")
        .unwrap();

    assert_eq!(
        (read(&dir, "ep01.srt"), texts(&current)),
        (cue("舊的"), vec!["舊的".to_string()])
    );
}

// @behavior VR-050
#[test]
fn refuses_a_restore_over_a_subtitle_changed_elsewhere() {
    let dir = directory_of("vr-restore-elsewhere", &[("ep01.srt", &cue("新的"))]);
    write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
    let current = project_in(&dir);
    std::fs::write(dir.path().join("ep01.srt"), cue("外面改的")).unwrap();

    let result = current.restore_version(None, "ep01.20260925T023000Z.srt");

    assert_eq!(
        (result, read(&dir, "ep01.srt"), texts(&current)),
        (
            Err(Failure::ChangedElsewhere),
            cue("外面改的"),
            vec!["外面改的".to_string()]
        )
    );
}

// @behavior VR-005
#[test]
fn keeps_the_subtitle_a_restore_replaces() {
    let dir = directory_of("vr-restore-kept", &[("ep01.srt", &cue("新的"))]);
    write_backup(&dir, "ep01.20260925T023000Z.srt", &cue("舊的"));
    let current = project_in(&dir);

    current
        .restore_version(None, "ep01.20260925T023000Z.srt")
        .unwrap();

    assert!(backups(dir.path()).iter().any(|(file, content)| {
        file != "ep01.20260925T023000Z.srt" && content == &cue("新的")
    }));
}

// @behavior VR-006
#[test]
fn refuses_a_backup_the_subtitle_does_not_have() {
    let dir = directory_of("vr-no-backup", &[("ep01.srt", &cue("你好"))]);
    let current = project_in(&dir);

    let result = current.restore_version(None, "../ep01.srt");

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (
            Err(Failure::NoBackup {
                backup: "../ep01.srt".to_string()
            }),
            cue("你好")
        )
    );
}

// @behavior VR-016
#[test]
fn takes_back_the_text_of_one_cue() {
    let dir = TempDir::new("vr-revert-text");
    let current = backed_up_project_in(
        &dir,
        &srt_of(&[(0, 1_000, "你好")]),
        &srt_of(&[(0, 1_200, "您好")]),
    );

    current
        .revert_row(None, BACKUP, 0, RevertPart::Text)
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_200, "你好")]));
}

// @behavior VR-017
#[test]
fn takes_back_the_times_of_one_cue() {
    let dir = TempDir::new("vr-revert-times");
    let current = backed_up_project_in(
        &dir,
        &srt_of(&[(0, 1_000, "你好")]),
        &srt_of(&[(0, 1_200, "您好")]),
    );

    current
        .revert_row(None, BACKUP, 0, RevertPart::Times)
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_000, "您好")]));
}

// @behavior VR-018
#[test]
fn takes_back_a_removed_cue() {
    let dir = TempDir::new("vr-revert-removed");
    let current = backed_up_project_in(
        &dir,
        &srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
        &srt_of(&[(0, 1_000, "你好")]),
    );

    current
        .revert_row(None, BACKUP, 1, RevertPart::Whole)
        .unwrap();

    assert_eq!(
        read(&dir, "ep01.srt"),
        srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")])
    );
}

// @behavior VR-019
#[test]
fn takes_back_an_added_cue() {
    let dir = TempDir::new("vr-revert-added");
    let current = backed_up_project_in(
        &dir,
        &srt_of(&[(0, 1_000, "你好")]),
        &srt_of(&[(0, 1_000, "你好"), (2_000, 3_000, "再見")]),
    );

    current
        .revert_row(None, BACKUP, 1, RevertPart::Whole)
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 1_000, "你好")]));
}

// @behavior VR-020
#[test]
fn takes_back_a_split() {
    let dir = TempDir::new("vr-revert-split");
    let current = backed_up_project_in(
        &dir,
        &srt_of(&[(0, 2_000, "你好世界")]),
        &srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
    );

    current
        .revert_row(None, BACKUP, 0, RevertPart::Whole)
        .unwrap();

    assert_eq!(read(&dir, "ep01.srt"), srt_of(&[(0, 2_000, "你好世界")]));
}

// @behavior VR-021
#[test]
fn undoes_a_cue_taken_back() {
    let dir = TempDir::new("vr-revert-undo");
    let now = srt_of(&[(0, 1_200, "您好")]);
    let current = backed_up_project_in(&dir, &srt_of(&[(0, 1_000, "你好")]), &now);
    current
        .revert_row(None, BACKUP, 0, RevertPart::Text)
        .unwrap();

    current.undo().unwrap();

    assert_eq!(read(&dir, "ep01.srt"), now);
}

// @behavior VR-047
#[test]
fn counts_the_segments_a_restore_leaves_without_a_translation() {
    let dir = TempDir::new("vr-restore-unmatched");
    let current = merged_project_in(&dir);

    let restoration = current.restore_version(None, BACKUP).unwrap();

    assert_eq!(restoration, Restoration { unmatched_count: 2 });
}

// @behavior VR-047
#[test]
fn counts_the_segments_a_row_taken_back_leaves_without_a_translation() {
    let dir = TempDir::new("vr-revert-unmatched");
    let current = merged_project_in(&dir);

    let restoration = current
        .revert_row(None, BACKUP, 0, RevertPart::Whole)
        .unwrap();

    assert_eq!(restoration, Restoration { unmatched_count: 2 });
}

// @behavior VR-022
#[test]
fn refuses_a_row_the_comparison_does_not_have() {
    let dir = TempDir::new("vr-revert-no-row");
    let now = srt_of(&[(0, 1_000, "您好")]);
    let current = backed_up_project_in(&dir, &srt_of(&[(0, 1_000, "你好")]), &now);

    let result = current.revert_row(None, BACKUP, 1, RevertPart::Whole);

    assert_eq!(
        (result, read(&dir, "ep01.srt")),
        (Err(Failure::NoRow { row: 1 }), now)
    );
}

// @behavior VR-037
#[test]
fn reads_a_translations_cues_as_written() {
    let dir = directory_of(
        "vr-reference",
        &[
            ("ep01.srt", &cue("你好")),
            ("ep01.ja.srt", &cue("こんにちは")),
        ],
    );
    let current = project_in(&dir);

    let cues = current.translation_cues(Language::Japanese).unwrap();

    assert_eq!(
        cues,
        [ComparedCue {
            start_ms: 0,
            end_ms: 1_000,
            text: "こんにちは".to_string()
        }]
    );
}

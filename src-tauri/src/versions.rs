use std::collections::BTreeMap;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::failure::Failure;
use crate::history::Backup;
use crate::language::Language;
use crate::progress::Progress;
use crate::project::CurrentProject;
use crate::transcript::Transcript;

/// The Backups of one subtitle of the Current Resource: its original, or its translation into `language`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SubtitleVersions {
    pub language: Option<Language>,
    pub backups: Vec<Backup>,
}

/// One cue of a comparison, by its times, with its text in each Version or none where it has no such cue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ComparedRow {
    pub start_ms: u64,
    pub end_ms: u64,
    pub left: Option<String>,
    pub right: Option<String>,
    pub is_changed: bool,
}

/// The cues of `left` and `right` matched by their times, in time order.
pub fn compare(left: &Transcript, right: &Transcript) -> Vec<ComparedRow> {
    let mut rows: BTreeMap<(u64, u64), (Option<String>, Option<String>)> = BTreeMap::new();
    for segment in &left.segments {
        rows.entry((segment.start_ms, segment.end_ms))
            .or_default()
            .0 = Some(segment.text.clone());
    }
    for segment in &right.segments {
        rows.entry((segment.start_ms, segment.end_ms))
            .or_default()
            .1 = Some(segment.text.clone());
    }
    rows.into_iter()
        .map(|((start_ms, end_ms), (left, right))| ComparedRow {
            start_ms,
            end_ms,
            is_changed: left != right,
            left,
            right,
        })
        .collect()
}

#[tauri::command]
pub fn subtitle_versions(app: AppHandle) -> Result<Vec<SubtitleVersions>, Failure> {
    app.state::<CurrentProject>().subtitle_versions()
}

#[tauri::command]
pub fn compare_versions(
    app: AppHandle,
    language: Option<Language>,
    left: Option<String>,
    right: Option<String>,
) -> Result<Vec<ComparedRow>, Failure> {
    let current = app.state::<CurrentProject>();
    Ok(compare(
        &current.version_transcript(language, left.as_deref())?,
        &current.version_transcript(language, right.as_deref())?,
    ))
}

#[tauri::command]
pub fn restore_version(
    app: AppHandle,
    language: Option<Language>,
    backup: String,
) -> Result<(), Failure> {
    let restored = app
        .state::<CurrentProject>()
        .restore_version(language, &backup);
    app.announce_project();
    restored
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcript::Segment;

    fn transcript(cues: &[(u64, u64, &str)]) -> Transcript {
        Transcript {
            segments: cues
                .iter()
                .map(|(start_ms, end_ms, text)| Segment {
                    start_ms: *start_ms,
                    end_ms: *end_ms,
                    speaker: None,
                    text: text.to_string(),
                    translation: None,
                })
                .collect(),
        }
    }

    fn row(start_ms: u64, end_ms: u64, left: Option<&str>, right: Option<&str>) -> ComparedRow {
        ComparedRow {
            start_ms,
            end_ms,
            left: left.map(str::to_string),
            right: right.map(str::to_string),
            is_changed: left != right,
        }
    }

    // @behavior VR-003
    #[test]
    fn compares_two_versions_cue_by_cue() {
        let backup = transcript(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]);
        let now = transcript(&[(0, 1_000, "您好"), (2_000, 3_000, "再見")]);

        let rows = compare(&backup, &now);

        assert_eq!(
            rows,
            [
                row(0, 1_000, Some("你好"), Some("您好")),
                row(1_000, 2_000, Some("世界"), None),
                row(2_000, 3_000, None, Some("再見")),
            ]
        );
    }
}

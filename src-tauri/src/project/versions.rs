use std::collections::BTreeMap;

use serde::Serialize;

use crate::language::Language;
use crate::project::Backup;
use crate::transcript::{Segment, Transcript};

/// The Backups of one subtitle of the Current Resource: its original, or its translation into `language`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SubtitleVersions {
    pub language: Option<Language>,
    pub backups: Vec<Backup>,
}

/// One cue of a Version as a Comparison Row shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ComparedCue {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// How the cues of a Comparison Row stand to each other.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RowKind {
    Pair,
    Addition,
    Removal,
    Split,
    Merge,
}

/// The cues of two Versions that cover the same speech, and what changed between them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ComparedRow {
    pub kind: RowKind,
    pub left: Vec<ComparedCue>,
    pub right: Vec<ComparedCue>,
    pub is_text_changed: bool,
    pub is_time_changed: bool,
}

/// The cues of `left` and `right` lined up as Comparison Rows, in time order.
pub fn compare(left: &Transcript, right: &Transcript) -> Vec<ComparedRow> {
    let left: Vec<ComparedCue> = left.segments.iter().map(ComparedCue::from).collect();
    let right: Vec<ComparedCue> = right.segments.iter().map(ComparedCue::from).collect();
    // Each cue is a node, the left ones first; a pair of overlapping cues joins their groups.
    let mut groups = Groups::new(left.len() + right.len());
    for (left_index, left_cue) in left.iter().enumerate() {
        for (right_index, right_cue) in right.iter().enumerate() {
            if is_overlapping(left_cue, right_cue) {
                groups.join(left_index, left.len() + right_index);
            }
        }
    }
    pair_moved_cues(&left, &right, &mut groups);
    let mut rows: Vec<ComparedRow> = groups
        .members()
        .into_iter()
        .map(|members| {
            let (lefts, rights): (Vec<usize>, Vec<usize>) =
                members.into_iter().partition(|&node| node < left.len());
            row_of(
                lefts
                    .into_iter()
                    .map(|left_index| left[left_index].clone())
                    .collect(),
                rights
                    .into_iter()
                    .map(|right_index| right[right_index - left.len()].clone())
                    .collect(),
            )
        })
        .collect();
    rows.sort_by_key(|row| {
        row.left
            .iter()
            .chain(&row.right)
            .map(|cue| cue.start_ms)
            .min()
    });
    rows
}

impl From<&Segment> for ComparedCue {
    fn from(segment: &Segment) -> Self {
        ComparedCue {
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            text: segment.text.clone(),
        }
    }
}

/// Whether two cues overlap by at least half of the shorter one, so cues that only touch at
/// their edges, as a slight retime leaves them, stay apart.
fn is_overlapping(a: &ComparedCue, b: &ComparedCue) -> bool {
    let overlap = a
        .end_ms
        .min(b.end_ms)
        .saturating_sub(a.start_ms.max(b.start_ms));
    let shorter = (a.end_ms - a.start_ms).min(b.end_ms - b.start_ms);
    overlap > 0 && overlap * 2 >= shorter
}

/// Pairs each cue left alone with the first cue alone on the other side reading the same, as a
/// cue moved in time is.
fn pair_moved_cues(left: &[ComparedCue], right: &[ComparedCue], groups: &mut Groups) {
    let mut taken = vec![false; right.len()];
    for (left_index, left_cue) in left.iter().enumerate() {
        if !groups.is_alone(left_index) {
            continue;
        }
        let moved = right
            .iter()
            .enumerate()
            .position(|(right_index, right_cue)| {
                !taken[right_index]
                    && groups.is_alone(left.len() + right_index)
                    && right_cue.text == left_cue.text
            });
        if let Some(right_index) = moved {
            taken[right_index] = true;
            groups.join(left_index, left.len() + right_index);
        }
    }
}

fn row_of(left: Vec<ComparedCue>, right: Vec<ComparedCue>) -> ComparedRow {
    let kind = match (left.len(), right.len()) {
        (0, _) => RowKind::Addition,
        (_, 0) => RowKind::Removal,
        (1, 1) => RowKind::Pair,
        (1, _) => RowKind::Split,
        _ => RowKind::Merge,
    };
    let is_paired = !left.is_empty() && !right.is_empty();
    ComparedRow {
        kind,
        is_text_changed: is_paired && is_text_different(kind, &left, &right),
        is_time_changed: is_paired && span(&left) != span(&right),
        left,
        right,
    }
}

/// Whether the texts of the two sides differ. A Split or Merge breaks or joins lines, so there
/// only what is not whitespace is compared.
fn is_text_different(kind: RowKind, left: &[ComparedCue], right: &[ComparedCue]) -> bool {
    let text_of = |cues: &[ComparedCue]| -> String {
        match kind {
            RowKind::Split | RowKind::Merge => cues
                .iter()
                .flat_map(|cue| cue.text.chars())
                .filter(|character| !character.is_whitespace())
                .collect(),
            _ => cues.iter().map(|cue| cue.text.as_str()).collect(),
        }
    };
    text_of(left) != text_of(right)
}

fn span(cues: &[ComparedCue]) -> (u64, u64) {
    let start = cues.iter().map(|cue| cue.start_ms).min().unwrap_or(0);
    let end = cues.iter().map(|cue| cue.end_ms).max().unwrap_or(0);
    (start, end)
}

/// Nodes joined into groups, each group led by one of its nodes.
struct Groups {
    leaders: Vec<usize>,
    sizes: Vec<usize>,
}

impl Groups {
    fn new(count: usize) -> Groups {
        Groups {
            leaders: (0..count).collect(),
            sizes: vec![1; count],
        }
    }

    fn leader(&mut self, node: usize) -> usize {
        let mut leader = node;
        while self.leaders[leader] != leader {
            leader = self.leaders[leader];
        }
        self.leaders[node] = leader;
        leader
    }

    fn join(&mut self, a: usize, b: usize) {
        let (a, b) = (self.leader(a), self.leader(b));
        if a != b {
            self.leaders[b] = a;
            self.sizes[a] += self.sizes[b];
        }
    }

    fn is_alone(&mut self, node: usize) -> bool {
        let leader = self.leader(node);
        self.sizes[leader] == 1
    }

    /// Each group's nodes, in node order.
    fn members(&mut self) -> Vec<Vec<usize>> {
        let mut by_leader: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
        for node in 0..self.leaders.len() {
            let leader = self.leader(node);
            by_leader.entry(leader).or_default().push(node);
        }
        by_leader.into_values().collect()
    }
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

    fn cue(start_ms: u64, end_ms: u64, text: &str) -> ComparedCue {
        ComparedCue {
            start_ms,
            end_ms,
            text: text.to_string(),
        }
    }

    fn kinds_and_changes(rows: &[ComparedRow]) -> Vec<(RowKind, bool, bool)> {
        rows.iter()
            .map(|row| (row.kind, row.is_text_changed, row.is_time_changed))
            .collect()
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
                ComparedRow {
                    kind: RowKind::Pair,
                    left: vec![cue(0, 1_000, "你好")],
                    right: vec![cue(0, 1_000, "您好")],
                    is_text_changed: true,
                    is_time_changed: false,
                },
                ComparedRow {
                    kind: RowKind::Removal,
                    left: vec![cue(1_000, 2_000, "世界")],
                    right: vec![],
                    is_text_changed: false,
                    is_time_changed: false,
                },
                ComparedRow {
                    kind: RowKind::Addition,
                    left: vec![],
                    right: vec![cue(2_000, 3_000, "再見")],
                    is_text_changed: false,
                    is_time_changed: false,
                },
            ]
        );
    }

    // @behavior VR-011
    #[test]
    fn pairs_a_retimed_cue_by_its_overlap() {
        let rows = compare(
            &transcript(&[(0, 1_000, "你好")]),
            &transcript(&[(0, 1_200, "你好")]),
        );

        assert_eq!(kinds_and_changes(&rows), [(RowKind::Pair, false, true)]);
    }

    // @behavior VR-012
    #[test]
    fn keeps_apart_cues_that_only_touch() {
        let rows = compare(
            &transcript(&[(0, 1_000, "一"), (1_000, 2_000, "二")]),
            &transcript(&[(0, 1_050, "一"), (1_050, 2_000, "二")]),
        );

        assert_eq!(
            kinds_and_changes(&rows),
            [(RowKind::Pair, false, true), (RowKind::Pair, false, true)]
        );
    }

    // @behavior VR-013
    #[test]
    fn lines_up_a_split_cue_with_its_parts() {
        let rows = compare(
            &transcript(&[(0, 2_000, "你好世界")]),
            &transcript(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
        );

        assert_eq!(kinds_and_changes(&rows), [(RowKind::Split, false, false)]);
    }

    // @behavior VR-014
    #[test]
    fn lines_up_merged_cues_with_their_whole() {
        let rows = compare(
            &transcript(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
            &transcript(&[(0, 2_000, "你好\n世界")]),
        );

        assert_eq!(kinds_and_changes(&rows), [(RowKind::Merge, false, false)]);
    }

    // @behavior VR-015
    #[test]
    fn pairs_a_cue_moved_in_time_by_its_text() {
        let rows = compare(
            &transcript(&[(0, 1_000, "你好")]),
            &transcript(&[(5_000, 6_000, "你好")]),
        );

        assert_eq!(kinds_and_changes(&rows), [(RowKind::Pair, false, true)]);
    }
}

use std::collections::{BTreeMap, HashMap, VecDeque};

use serde::{Deserialize, Serialize};

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
    /// For a Pair whose text changed, its text character by character: what both keep, what
    /// only the earlier Version has, and what only the later one has.
    pub text_spans: Vec<TextSpan>,
}

/// A run of characters of a Pair's text, and which Version has it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TextSpan {
    pub kind: SpanKind,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SpanKind {
    Common,
    Removal,
    Addition,
}

/// The cues of `left` and `right` lined up as Comparison Rows, in time order.
pub fn compare(left: &Transcript, right: &Transcript) -> Vec<ComparedRow> {
    let left: Vec<ComparedCue> = left.segments.iter().map(ComparedCue::from).collect();
    let right: Vec<ComparedCue> = right.segments.iter().map(ComparedCue::from).collect();
    row_positions(&left, &right)
        .into_iter()
        .map(|positions| {
            row_of(
                positions.left.iter().map(|&at| left[at].clone()).collect(),
                positions
                    .right
                    .iter()
                    .map(|&at| right[at].clone())
                    .collect(),
            )
        })
        .collect()
}

/// Which part of a Comparison Row to take back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RevertPart {
    Text,
    Times,
    Whole,
}

/// `now` with the Comparison Row at `row` against `backup` taken back: for a Pair its text, its
/// times or the whole cue, for any other row the Backup's cues in place of those now. None when
/// the comparison has no such row.
pub fn reverted_transcript(
    backup: &Transcript,
    now: &Transcript,
    row: usize,
    part: RevertPart,
) -> Option<Transcript> {
    let left: Vec<ComparedCue> = backup.segments.iter().map(ComparedCue::from).collect();
    let right: Vec<ComparedCue> = now.segments.iter().map(ComparedCue::from).collect();
    let positions = row_positions(&left, &right).into_iter().nth(row)?;
    let mut segments = now.segments.clone();
    match (positions.left.as_slice(), positions.right.as_slice(), part) {
        ([from], [to], RevertPart::Text) => {
            segments[*to].text = backup.segments[*from].text.clone()
        }
        ([from], [to], RevertPart::Times) => {
            segments[*to].start_ms = backup.segments[*from].start_ms;
            segments[*to].end_ms = backup.segments[*from].end_ms;
        }
        _ => {
            segments = now
                .segments
                .iter()
                .enumerate()
                .filter(|(at, _)| !positions.right.contains(at))
                .map(|(_, segment)| segment.clone())
                .collect();
            segments.extend(positions.left.iter().map(|&at| backup.segments[at].clone()));
            segments.sort_by_key(|segment| (segment.start_ms, segment.end_ms));
        }
    }
    Some(Transcript { segments })
}

/// The positions of the cues of one Comparison Row in each Version.
struct RowPositions {
    left: Vec<usize>,
    right: Vec<usize>,
}

/// The cues of `left` and `right` grouped into Comparison Rows by position, in time order.
fn row_positions(left: &[ComparedCue], right: &[ComparedCue]) -> Vec<RowPositions> {
    // Each cue is a node, the left ones first. Cues at the same times pair first, in order, so a
    // cue someone cuts in keeps its own row; of the rest, a pair of overlapping cues joins their groups.
    let mut groups = Groups::new(left.len() + right.len());
    let mut right_by_times: HashMap<(u64, u64), VecDeque<usize>> = HashMap::new();
    for (right_index, right_cue) in right.iter().enumerate() {
        right_by_times
            .entry((right_cue.start_ms, right_cue.end_ms))
            .or_default()
            .push_back(right_index);
    }
    let mut is_paired_by_times = vec![false; left.len() + right.len()];
    for (left_index, left_cue) in left.iter().enumerate() {
        if let Some(right_index) = right_by_times
            .get_mut(&(left_cue.start_ms, left_cue.end_ms))
            .and_then(VecDeque::pop_front)
        {
            let right_node = left.len() + right_index;
            groups.join(left_index, right_node);
            is_paired_by_times[left_index] = true;
            is_paired_by_times[right_node] = true;
        }
    }
    for (left_index, left_cue) in left.iter().enumerate() {
        for (right_index, right_cue) in right.iter().enumerate() {
            let right_node = left.len() + right_index;
            if !is_paired_by_times[left_index]
                && !is_paired_by_times[right_node]
                && is_overlapping(left_cue, right_cue)
            {
                groups.join(left_index, right_node);
            }
        }
    }
    pair_moved_cues(left, right, &mut groups);
    let mut rows: Vec<RowPositions> = groups
        .members()
        .into_iter()
        .map(|members| {
            let (lefts, rights): (Vec<usize>, Vec<usize>) =
                members.into_iter().partition(|&node| node < left.len());
            RowPositions {
                left: lefts,
                right: rights.into_iter().map(|node| node - left.len()).collect(),
            }
        })
        .collect();
    rows.sort_by_key(|positions| {
        let lefts = positions.left.iter().map(|&at| left[at].start_ms);
        let rights = positions.right.iter().map(|&at| right[at].start_ms);
        lefts.chain(rights).min()
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
        let moved_index = right
            .iter()
            .enumerate()
            .position(|(right_index, right_cue)| {
                !taken[right_index]
                    && groups.is_alone(left.len() + right_index)
                    && right_cue.text == left_cue.text
            });
        if let Some(right_index) = moved_index {
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
    let is_text_changed = is_paired && is_text_different(kind, &left, &right);
    let text_spans = match (kind, left.as_slice(), right.as_slice()) {
        (RowKind::Pair, [before], [after]) if is_text_changed => {
            text_spans(&before.text, &after.text)
        }
        _ => Vec::new(),
    };
    ComparedRow {
        kind,
        is_text_changed,
        is_time_changed: is_paired && span(&left) != span(&right),
        left,
        right,
        text_spans,
    }
}

/// `before` and `after` character by character, along their longest common subsequence.
fn text_spans(before: &str, after: &str) -> Vec<TextSpan> {
    let before: Vec<char> = before.chars().collect();
    let after: Vec<char> = after.chars().collect();
    // lengths[i][j]: the longest common subsequence of before[i..] and after[j..].
    let mut lengths = vec![vec![0usize; after.len() + 1]; before.len() + 1];
    for i in (0..before.len()).rev() {
        for j in (0..after.len()).rev() {
            lengths[i][j] = match before[i] == after[j] {
                true => lengths[i + 1][j + 1] + 1,
                false => lengths[i + 1][j].max(lengths[i][j + 1]),
            };
        }
    }
    let mut spans: Vec<TextSpan> = Vec::new();
    let mut push = |kind: SpanKind, character: char| match spans.last_mut() {
        Some(last) if last.kind == kind => last.text.push(character),
        _ => spans.push(TextSpan {
            kind,
            text: character.to_string(),
        }),
    };
    let (mut i, mut j) = (0, 0);
    while i < before.len() || j < after.len() {
        if i < before.len() && j < after.len() && before[i] == after[j] {
            push(SpanKind::Common, before[i]);
            (i, j) = (i + 1, j + 1);
        } else if i < before.len() && (j == after.len() || lengths[i + 1][j] >= lengths[i][j + 1]) {
            push(SpanKind::Removal, before[i]);
            i += 1;
        } else {
            push(SpanKind::Addition, after[j]);
            j += 1;
        }
    }
    spans
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
                    text_spans: vec![
                        TextSpan {
                            kind: SpanKind::Removal,
                            text: "你".to_string(),
                        },
                        TextSpan {
                            kind: SpanKind::Addition,
                            text: "您".to_string(),
                        },
                        TextSpan {
                            kind: SpanKind::Common,
                            text: "好".to_string(),
                        },
                    ],
                },
                ComparedRow {
                    kind: RowKind::Removal,
                    left: vec![cue(1_000, 2_000, "世界")],
                    right: vec![],
                    is_text_changed: false,
                    is_time_changed: false,
                    text_spans: vec![],
                },
                ComparedRow {
                    kind: RowKind::Addition,
                    left: vec![],
                    right: vec![cue(2_000, 3_000, "再見")],
                    is_text_changed: false,
                    is_time_changed: false,
                    text_spans: vec![],
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

    // @behavior VR-051
    #[test]
    fn pairs_a_cue_someone_cuts_in_with_its_own_cue() {
        let rows = compare(
            &transcript(&[(0, 5_000, "大家好"), (2_000, 3_000, "對啊")]),
            &transcript(&[(0, 5_000, "大家好"), (2_000, 3_000, "對呀")]),
        );

        assert_eq!(
            kinds_and_changes(&rows),
            [(RowKind::Pair, false, false), (RowKind::Pair, true, false)]
        );
    }

    // @behavior VR-052
    #[test]
    fn pairs_cues_with_the_same_times_in_their_order() {
        let rows = compare(
            &transcript(&[(0, 1_000, "大家好"), (0, 1_000, "對啊")]),
            &transcript(&[(0, 1_000, "大家好"), (0, 1_000, "對呀")]),
        );

        assert_eq!(
            kinds_and_changes(&rows),
            [(RowKind::Pair, false, false), (RowKind::Pair, true, false)]
        );
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

    // @behavior VR-031
    #[test]
    fn marks_the_characters_that_changed_within_a_cue() {
        let rows = compare(
            &transcript(&[(0, 1_000, "資料不上傳")]),
            &transcript(&[(0, 1_000, "資料不會上傳")]),
        );

        let spans: Vec<(SpanKind, &str)> = rows[0]
            .text_spans
            .iter()
            .map(|span| (span.kind, span.text.as_str()))
            .collect();
        assert_eq!(
            spans,
            [
                (SpanKind::Common, "資料不"),
                (SpanKind::Addition, "會"),
                (SpanKind::Common, "上傳")
            ]
        );
    }
}

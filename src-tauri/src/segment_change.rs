use serde::Deserialize;

use crate::transcript::Segment;

/// How long a Segment inserted where no neighbour bounds it runs, in milliseconds.
const INSERTED_MS: u64 = 2_000;

/// A change to the Segments themselves, by position, made alike to the original and each translation.
///
/// Segments may overlap, as when someone cuts in, but keep the order they start in: a Segment a
/// change makes takes its place by its start, and a change that would start one before the
/// Segment before it or after the one after it is refused.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SegmentChange {
    Times {
        index: usize,
        start_ms: u64,
        end_ms: u64,
    },
    /// The end of the Segment at `index` and the start of the next, moved together to `at_ms`.
    Boundary { index: usize, at_ms: u64 },
    /// An empty Segment from `start_ms` to `end_ms`, placed among the others by its start.
    Insertion { start_ms: u64, end_ms: u64 },
    /// An empty Segment filling the gap before the one at `index`, or running `INSERTED_MS` up to
    /// its start where there is none.
    InsertionBefore { index: usize },
    /// An empty Segment filling the gap after the one at `index`, or running `INSERTED_MS` from its
    /// end where there is none.
    InsertionAfter { index: usize },
    /// The Segments at `indexes`, in any order.
    Deletion { indexes: Vec<usize> },
    /// Two Segments, split after the `at`th character of the text; the translation stays with the
    /// first, and the second takes its place by its start.
    Split { index: usize, at: usize },
    /// One Segment from `first` through the latest end of `first` through `last`, their texts and
    /// translations each a line.
    Merge { first: usize, last: usize },
    /// `first` through `last` moved by `offset_ms`, stopping at the start of the media.
    Shift {
        first: usize,
        last: usize,
        offset_ms: i64,
    },
}

/// Why a Segment Change was not made: it would end a Segment before it starts, start one out of
/// the order the Segments start in, or it names a position the Segments do not have.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SegmentChangeError {
    InvalidTimes,
    UnorderedTimes,
    InvalidPosition { detail: String },
}

impl SegmentChange {
    pub fn apply(self, segments: &mut Vec<Segment>) -> Result<(), SegmentChangeError> {
        match self {
            SegmentChange::Times {
                index,
                start_ms,
                end_ms,
            } => {
                if end_ms < start_ms {
                    return Err(SegmentChangeError::InvalidTimes);
                }
                let segment = segment_at(segments, index)?;
                segment.start_ms = start_ms;
                segment.end_ms = end_ms;
                refuse_unordered_start(segments, index)?;
            }
            SegmentChange::Boundary { index, at_ms } => {
                let start_ms = segment_at(segments, index)?.start_ms;
                let end_ms = segment_at(segments, index + 1)?.end_ms;
                if !(start_ms..=end_ms).contains(&at_ms) {
                    return Err(SegmentChangeError::InvalidTimes);
                }
                segments[index].end_ms = at_ms;
                segments[index + 1].start_ms = at_ms;
                refuse_unordered_start(segments, index + 1)?;
            }
            SegmentChange::Insertion { start_ms, end_ms } => {
                if end_ms < start_ms {
                    return Err(SegmentChangeError::InvalidTimes);
                }
                let index = segments.partition_point(|segment| segment.start_ms <= start_ms);
                segments.insert(index, empty_segment(start_ms, end_ms));
            }
            SegmentChange::InsertionBefore { index } => {
                let end_ms = segment_at(segments, index)?.start_ms;
                let start_ms = match index.checked_sub(1).map(|previous| &segments[previous]) {
                    Some(previous) if previous.end_ms < end_ms => previous.end_ms,
                    _ => end_ms.saturating_sub(INSERTED_MS),
                };
                // Before a Segment starting at the start of the media there is no room, so it runs after
                let end_ms = if end_ms == start_ms {
                    start_ms + INSERTED_MS
                } else {
                    end_ms
                };
                let at = segments[..index].partition_point(|segment| segment.start_ms <= start_ms);
                segments.insert(at, empty_segment(start_ms, end_ms));
            }
            SegmentChange::InsertionAfter { index } => {
                let start_ms = segment_at(segments, index)?.end_ms;
                let end_ms = match segments.get(index + 1) {
                    Some(next) if next.start_ms > start_ms => next.start_ms,
                    _ => start_ms + INSERTED_MS,
                };
                let at = index
                    + 1
                    + segments[index + 1..].partition_point(|segment| segment.start_ms < start_ms);
                segments.insert(at, empty_segment(start_ms, end_ms));
            }
            SegmentChange::Deletion { mut indexes } => {
                indexes.sort_unstable();
                indexes.dedup();
                let Some(&last) = indexes.last() else {
                    return Err(invalid_position("no Segment to delete".to_string()));
                };
                segment_at(segments, last)?;
                for index in indexes.into_iter().rev() {
                    segments.remove(index);
                }
            }
            SegmentChange::Split { index, at } => {
                let segment = segment_at(segments, index)?;
                let length = segment.text.chars().count();
                if at == 0 || at >= length {
                    return Err(invalid_position(format!("no split after {at} of {length}")));
                }
                let middle_ms = segment.start_ms
                    + (segment.end_ms - segment.start_ms) * at as u64 / length as u64;
                let byte_at = segment.text.char_indices().nth(at).map_or(0, |(at, _)| at);
                let second = Segment {
                    start_ms: middle_ms,
                    text: segment.text[byte_at..].trim_start().to_string(),
                    translation: None,
                    ..segment.clone()
                };
                segment.end_ms = middle_ms;
                segment.text = segment.text[..byte_at].trim_end().to_string();
                let at = index
                    + 1
                    + segments[index + 1..].partition_point(|segment| segment.start_ms < middle_ms);
                segments.insert(at, second);
            }
            SegmentChange::Merge { first, last } => {
                if first >= last {
                    return Err(invalid_position(format!(
                        "no merge of {first} through {last}"
                    )));
                }
                segment_at(segments, last)?;
                let run: Vec<Segment> = segments.drain(first + 1..=last).collect();
                let merged = &mut segments[first];
                merged.end_ms = run
                    .iter()
                    .map(|segment| segment.end_ms)
                    .fold(merged.end_ms, u64::max);
                for segment in &run {
                    merged.text = format!("{}\n{}", merged.text, segment.text);
                }
                let translations: Vec<&str> = std::iter::once(merged.translation.as_deref())
                    .chain(run.iter().map(|segment| segment.translation.as_deref()))
                    .flatten()
                    .filter(|translation| !translation.trim().is_empty())
                    .collect();
                merged.translation = (!translations.is_empty()).then(|| translations.join("\n"));
            }
            SegmentChange::Shift {
                first,
                last,
                offset_ms,
            } => {
                segment_at(segments, last)?;
                let shift = |ms: u64| (ms as i64 + offset_ms).max(0) as u64;
                for segment in &mut segments[first..=last] {
                    segment.start_ms = shift(segment.start_ms);
                    segment.end_ms = shift(segment.end_ms);
                }
                refuse_unordered_start(segments, first)?;
                refuse_unordered_start(segments, last)?;
            }
        }
        Ok(())
    }
}

fn segment_at(segments: &mut [Segment], index: usize) -> Result<&mut Segment, SegmentChangeError> {
    segments
        .get_mut(index)
        .ok_or_else(|| invalid_position(format!("no Segment at {index}")))
}

/// Refuses the Segment at `index` starting before the Segment before it or after the one after it.
fn refuse_unordered_start(segments: &[Segment], index: usize) -> Result<(), SegmentChangeError> {
    let start_ms = segments[index].start_ms;
    let previous = index.checked_sub(1).map(|previous| &segments[previous]);
    let is_after_previous = previous.is_none_or(|previous| previous.start_ms <= start_ms);
    let is_before_next = segments
        .get(index + 1)
        .is_none_or(|next| start_ms <= next.start_ms);
    if is_after_previous && is_before_next {
        Ok(())
    } else {
        Err(SegmentChangeError::UnorderedTimes)
    }
}

fn empty_segment(start_ms: u64, end_ms: u64) -> Segment {
    Segment {
        start_ms,
        end_ms,
        speaker: None,
        text: String::new(),
        translation: None,
    }
}

fn invalid_position(detail: String) -> SegmentChangeError {
    SegmentChangeError::InvalidPosition { detail }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_each_change_as_the_webview_writes_it() {
        let changes: Vec<SegmentChange> = serde_json::from_str(
            r#"[
                {"kind":"times","index":0,"start_ms":500,"end_ms":1000},
                {"kind":"boundary","index":0,"at_ms":700},
                {"kind":"insertion","start_ms":1500,"end_ms":2500},
                {"kind":"insertion-before","index":1},
                {"kind":"insertion-after","index":1},
                {"kind":"deletion","indexes":[0,2]},
                {"kind":"split","index":0,"at":2},
                {"kind":"merge","first":0,"last":1},
                {"kind":"shift","first":1,"last":2,"offset_ms":-500}
            ]"#,
        )
        .unwrap();

        assert_eq!(
            changes,
            [
                SegmentChange::Times {
                    index: 0,
                    start_ms: 500,
                    end_ms: 1_000
                },
                SegmentChange::Boundary {
                    index: 0,
                    at_ms: 700
                },
                SegmentChange::Insertion {
                    start_ms: 1_500,
                    end_ms: 2_500
                },
                SegmentChange::InsertionBefore { index: 1 },
                SegmentChange::InsertionAfter { index: 1 },
                SegmentChange::Deletion {
                    indexes: vec![0, 2]
                },
                SegmentChange::Split { index: 0, at: 2 },
                SegmentChange::Merge { first: 0, last: 1 },
                SegmentChange::Shift {
                    first: 1,
                    last: 2,
                    offset_ms: -500
                },
            ]
        );
    }
}

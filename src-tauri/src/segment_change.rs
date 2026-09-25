use serde::Deserialize;

use crate::failure::Failure;
use crate::transcript::Segment;

/// How long a Segment inserted where no neighbour bounds it runs, in milliseconds.
const INSERTED_MS: u64 = 2_000;

/// A change to the Segments themselves, by position, made alike to the original and each translation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SegmentChange {
    Times {
        index: usize,
        start_ms: u64,
        end_ms: u64,
    },
    /// An empty Segment filling the gap before the one at `index`.
    InsertionBefore {
        index: usize,
    },
    /// An empty Segment filling the gap after the one at `index`.
    InsertionAfter {
        index: usize,
    },
    Deletion {
        index: usize,
    },
    /// Two Segments, split after the `at`th character of the text; the translation stays with the first.
    Split {
        index: usize,
        at: usize,
    },
    /// One Segment from `first` through `last`, their texts and translations each a line.
    Merge {
        first: usize,
        last: usize,
    },
    /// `first` through `last` moved by `offset_ms`, stopping at the start of the media.
    Shift {
        first: usize,
        last: usize,
        offset_ms: i64,
    },
}

impl SegmentChange {
    pub fn apply(self, segments: &mut Vec<Segment>) -> Result<(), Failure> {
        match self {
            SegmentChange::Times {
                index,
                start_ms,
                end_ms,
            } => {
                if end_ms < start_ms {
                    return Err(Failure::InvalidTimes);
                }
                let segment = segment_at(segments, index)?;
                segment.start_ms = start_ms;
                segment.end_ms = end_ms;
            }
            SegmentChange::InsertionBefore { index } => {
                let end_ms = segment_at(segments, index)?.start_ms;
                let start_ms = match index.checked_sub(1) {
                    Some(previous) => segments[previous].end_ms.min(end_ms),
                    None => end_ms.saturating_sub(INSERTED_MS),
                };
                segments.insert(index, empty_segment(start_ms, end_ms));
            }
            SegmentChange::InsertionAfter { index } => {
                let start_ms = segment_at(segments, index)?.end_ms;
                let end_ms = match segments.get(index + 1) {
                    Some(next) => next.start_ms.max(start_ms),
                    None => start_ms + INSERTED_MS,
                };
                segments.insert(index + 1, empty_segment(start_ms, end_ms));
            }
            SegmentChange::Deletion { index } => {
                segment_at(segments, index)?;
                segments.remove(index);
            }
            SegmentChange::Split { index, at } => {
                let segment = segment_at(segments, index)?;
                let length = segment.text.chars().count();
                if at == 0 || at >= length {
                    return Err(internal(format!("no split after {at} of {length}")));
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
                segments.insert(index + 1, second);
            }
            SegmentChange::Merge { first, last } => {
                if first >= last {
                    return Err(internal(format!("no merge of {first} through {last}")));
                }
                segment_at(segments, last)?;
                let run: Vec<Segment> = segments.drain(first + 1..=last).collect();
                let merged = &mut segments[first];
                merged.end_ms = run.last().map_or(merged.end_ms, |segment| segment.end_ms);
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
            }
        }
        Ok(())
    }
}

fn segment_at(segments: &mut [Segment], index: usize) -> Result<&mut Segment, Failure> {
    segments
        .get_mut(index)
        .ok_or_else(|| internal(format!("no Segment at {index}")))
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

fn internal(detail: String) -> Failure {
    Failure::Internal { detail }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_each_change_as_the_webview_writes_it() {
        let changes: Vec<SegmentChange> = serde_json::from_str(
            r#"[
                {"kind":"times","index":0,"start_ms":500,"end_ms":1000},
                {"kind":"insertion-before","index":1},
                {"kind":"insertion-after","index":1},
                {"kind":"deletion","index":2},
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
                SegmentChange::InsertionBefore { index: 1 },
                SegmentChange::InsertionAfter { index: 1 },
                SegmentChange::Deletion { index: 2 },
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

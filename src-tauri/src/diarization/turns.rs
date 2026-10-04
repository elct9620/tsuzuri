use serde::{Deserialize, Serialize};

use crate::transcript::Segment;

/// How many Speakers Speaker Diarization tells apart at most.
pub const MAX_SPEAKERS: usize = 8;

/// One span during which Speaker Diarization hears one Speaker, by the Speaker's number counted
/// from 0 in the order Speakers are first heard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpeakerTurn {
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: usize,
}

/// The name a Speaker gets from its number, counting from `Speaker 1`.
pub fn speaker_name(speaker: usize) -> String {
    format!("Speaker {}", speaker + 1)
}

/// The Speaker heard longest during each Segment, none for a Segment nobody is heard during.
pub fn segment_speakers(segments: &[Segment], turns: &[SpeakerTurn]) -> Vec<Option<String>> {
    segments
        .iter()
        .map(|segment| {
            let mut heard_ms = [0u64; MAX_SPEAKERS];
            for turn in turns {
                let start = turn.start_ms.max(segment.start_ms);
                let end = turn.end_ms.min(segment.end_ms);
                if end > start && turn.speaker < heard_ms.len() {
                    heard_ms[turn.speaker] += end - start;
                }
            }
            let (speaker, longest) = heard_ms
                .iter()
                .enumerate()
                .max_by_key(|&(speaker, ms)| (*ms, std::cmp::Reverse(speaker)))?;
            (*longest > 0).then(|| speaker_name(speaker))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(start_ms: u64, end_ms: u64) -> Segment {
        Segment {
            start_ms,
            end_ms,
            speaker: None,
            text: "text".to_string(),
            translation: None,
        }
    }

    fn turn(start_ms: u64, end_ms: u64, speaker: usize) -> SpeakerTurn {
        SpeakerTurn {
            start_ms,
            end_ms,
            speaker,
        }
    }

    // @behavior DZ-001
    #[test]
    fn gives_a_segment_the_speaker_heard_longest_during_it() {
        let speakers = segment_speakers(
            &[segment(0, 4000)],
            &[turn(0, 1000, 0), turn(1000, 4000, 1)],
        );

        assert_eq!(speakers, [Some("Speaker 2".to_string())]);
    }

    // @behavior DZ-002
    #[test]
    fn leaves_a_segment_nobody_is_heard_during_without_a_speaker() {
        let speakers = segment_speakers(&[segment(5000, 6000)], &[turn(0, 4000, 0)]);

        assert_eq!(speakers, [None]);
    }

    #[test]
    fn gives_a_tie_to_the_speaker_heard_first() {
        let speakers = segment_speakers(
            &[segment(0, 2000)],
            &[turn(1000, 2000, 1), turn(0, 1000, 0)],
        );

        assert_eq!(speakers, [Some("Speaker 1".to_string())]);
    }

    // @behavior DZ-003
    #[test]
    fn numbers_speakers_in_the_order_they_are_first_heard() {
        assert_eq!(
            (speaker_name(0), speaker_name(1)),
            ("Speaker 1".to_string(), "Speaker 2".to_string())
        );
    }
}

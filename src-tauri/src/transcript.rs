use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Transcript {
    pub segments: Vec<Segment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SrtError {
    /// 1-based position of the cue in the file, which is what a person counts when looking for it.
    pub cue: usize,
    pub reason: String,
}

impl fmt::Display for SrtError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "cue {}: {}", self.cue, self.reason)
    }
}

impl std::error::Error for SrtError {}

impl Transcript {
    pub fn from_srt(input: &str) -> Result<Transcript, SrtError> {
        let normalized = input.replace("\r\n", "\n");
        let segments = normalized
            .split("\n\n")
            .map(str::trim)
            .filter(|block| !block.is_empty())
            .enumerate()
            .map(|(index, block)| parse_cue(index + 1, block))
            .collect::<Result<_, _>>()?;
        Ok(Transcript { segments })
    }

    pub fn to_srt(&self) -> String {
        self.segments
            .iter()
            .enumerate()
            .map(|(index, segment)| {
                format!(
                    "{}\n{} --> {}\n{}\n",
                    index + 1,
                    format_timestamp(segment.start_ms),
                    format_timestamp(segment.end_ms),
                    segment.text
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn parse_cue(cue: usize, block: &str) -> Result<Segment, SrtError> {
    let error = |reason: &str| SrtError {
        cue,
        reason: reason.to_string(),
    };
    let mut lines = block.lines();
    lines.next();
    let timing = lines.next().ok_or_else(|| error("missing timing line"))?;
    let (start, end) = timing
        .split_once("-->")
        .ok_or_else(|| error("timing line has no -->"))?;
    let start_ms = parse_timestamp(start.trim()).ok_or_else(|| error("unreadable start time"))?;
    let end_ms = parse_timestamp(end.trim()).ok_or_else(|| error("unreadable end time"))?;
    let text = lines.collect::<Vec<_>>().join("\n");
    Ok(Segment {
        start_ms,
        end_ms,
        text,
    })
}

/// Reads `HH:MM:SS,mmm`; a `.` before the milliseconds is accepted since some tools write WebVTT-style times into SRT.
fn parse_timestamp(value: &str) -> Option<u64> {
    let (clock, millis) = value.split_once([',', '.'])?;
    let mut parts = clock.split(':');
    let hours: u64 = parts.next()?.parse().ok()?;
    let minutes: u64 = parts.next()?.parse().ok()?;
    let seconds: u64 = parts.next()?.parse().ok()?;
    if parts.next().is_some() || millis.len() != 3 {
        return None;
    }
    let millis: u64 = millis.parse().ok()?;
    Some(((hours * 60 + minutes) * 60 + seconds) * 1000 + millis)
}

fn format_timestamp(ms: u64) -> String {
    format!(
        "{:02}:{:02}:{:02},{:03}",
        ms / 3_600_000,
        ms / 60_000 % 60,
        ms / 1000 % 60,
        ms % 1000
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const TWO_CUES: &str = "1\n00:00:01,000 --> 00:00:02,500\n你好\n\n2\n00:01:02,003 --> 01:00:00,000\n世界\n";

    fn segment(start_ms: u64, end_ms: u64, text: &str) -> Segment {
        Segment {
            start_ms,
            end_ms,
            text: text.to_string(),
        }
    }

    // @behavior TR-001
    #[test]
    fn parses_each_cue_into_a_segment() {
        let transcript = Transcript::from_srt(TWO_CUES).unwrap();

        assert_eq!(
            transcript.segments,
            vec![
                segment(1_000, 2_500, "你好"),
                segment(62_003, 3_600_000, "世界"),
            ]
        );
    }

    // @behavior TR-002
    #[test]
    fn keeps_multi_line_cue_text() {
        let input = "1\n00:00:01,000 --> 00:00:02,000\n第一行\n第二行\n";

        let transcript = Transcript::from_srt(input).unwrap();

        assert_eq!(transcript.segments[0].text, "第一行\n第二行");
    }

    // @behavior TR-003
    #[test]
    fn reads_bom_and_crlf_like_plain_utf8() {
        let windows = format!("\u{feff}{}", TWO_CUES.replace('\n', "\r\n"));

        let transcript = Transcript::from_srt(&windows).unwrap();

        assert_eq!(transcript, Transcript::from_srt(TWO_CUES).unwrap());
    }

    // @behavior TR-004
    #[test]
    fn names_the_cue_with_a_malformed_timestamp() {
        let input = "1\n00:00:01,000 --> 00:00:02,000\nok\n\n2\n00:00:0x,000 --> 00:00:04,000\nbad\n";

        let error = Transcript::from_srt(input).unwrap_err();

        assert_eq!(error.cue, 2);
    }

    // @behavior TR-005
    #[test]
    fn writes_numbered_cues_with_srt_timings() {
        let transcript = Transcript {
            segments: vec![
                segment(1_000, 2_500, "你好"),
                segment(62_003, 3_600_000, "世界"),
            ],
        };

        assert_eq!(transcript.to_srt(), TWO_CUES);
    }
}

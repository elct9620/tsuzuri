use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Segment {
    pub start_ms: u64,
    pub end_ms: u64,
    /// Who says it, written as a Speaker Label before its text and its translation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub translation: Option<String>,
}

/// Which text an SRT's cues carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SrtContent {
    Original,
    /// A Segment not yet translated keeps its original text, so no cue is left empty.
    Translation,
    /// The original above the translation in the same cue.
    Bilingual,
}

/// What each text of a cue calls its Speaker, by the name its Segment holds; a Speaker's name can
/// differ by Language, and a name not listed stays as the Segment holds it.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SpeakerNames {
    pub text: HashMap<String, String>,
    pub translation: HashMap<String, String>,
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

    pub fn to_srt(&self, content: SrtContent) -> String {
        self.to_srt_with(content, &SpeakerNames::default())
    }

    pub fn to_srt_with(&self, content: SrtContent, names: &SpeakerNames) -> String {
        self.segments
            .iter()
            .enumerate()
            .map(|(index, segment)| {
                format!(
                    "{}\n{} --> {}\n{}\n",
                    index + 1,
                    format_timestamp(segment.start_ms),
                    format_timestamp(segment.end_ms),
                    cue_text(segment, content, names)
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn cue_text(segment: &Segment, content: SrtContent, names: &SpeakerNames) -> String {
    // A translation edited down to nothing is no translation, so the cue keeps its original text.
    let translation = segment
        .translation
        .as_deref()
        .filter(|translation| !translation.trim().is_empty());
    let with_speaker = |line_names: &HashMap<String, String>, text: &str| match &segment.speaker {
        Some(speaker) => {
            let name = line_names.get(speaker).unwrap_or(speaker);
            format!("{name}: {}", cue_lines(text))
        }
        None => cue_lines(text),
    };
    match (content, translation) {
        (SrtContent::Translation, Some(translation)) => {
            with_speaker(&names.translation, translation)
        }
        (SrtContent::Bilingual, Some(translation)) => {
            format!(
                "{}\n{}",
                with_speaker(&names.text, &segment.text),
                with_speaker(&names.translation, translation)
            )
        }
        _ => with_speaker(&names.text, &segment.text),
    }
}

/// A blank line ends a cue in SRT, so text edited to contain one is written without it.
fn cue_lines(text: &str) -> String {
    text.lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
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
    let (speaker, text) = split_speaker(lines.collect());
    Ok(Segment {
        start_ms,
        end_ms,
        speaker,
        text,
        translation: None,
    })
}

/// The Speaker named by the Speaker Label on the first line, with the text left without it,
/// when no other line carries a label; a cue whose lines name several keeps them all.
fn split_speaker(lines: Vec<&str>) -> (Option<String>, String) {
    let text = lines.join("\n");
    let Some((first, rest)) = lines.split_first() else {
        return (None, text);
    };
    let (Some(label), dialogue) = split_label(first) else {
        return (None, text);
    };
    if rest.iter().any(|line| split_label(line).0.is_some()) {
        return (None, text);
    }
    let speaker = label.trim_end().trim_end_matches([':', '：']).trim_end();
    let text = std::iter::once(dialogue)
        .chain(rest.iter().copied())
        .collect::<Vec<_>>()
        .join("\n");
    (Some(speaker.to_string()), text)
}

/// Longest name a Speaker Label may carry, in characters.
const LONGEST_NAME: usize = 20;

/// The line's Speaker Label exactly as written, colon and spacing included, and its dialogue;
/// a digits-only name, like the `12` of `12:30`, is a clock time.
pub fn split_label(line: &str) -> (Option<String>, &str) {
    let Some((colon, width)) = line
        .char_indices()
        .take(LONGEST_NAME + 1)
        .find(|(_, ch)| matches!(ch, ':' | '：'))
        .map(|(at, ch)| (at, ch.len_utf8()))
    else {
        return (None, line);
    };
    let name = &line[..colon];
    if name.is_empty() || name.chars().all(|ch| ch.is_ascii_digit()) {
        return (None, line);
    }
    let rest = &line[colon + width..];
    let dialogue = rest.trim_start_matches([' ', '\t']);
    let label_end = line.len() - dialogue.len();
    (Some(line[..label_end].to_string()), dialogue)
}

/// Reads `HH:MM:SS,mmm`; a `.` before the milliseconds is accepted since some tools write WebVTT-style times into SRT.
pub(crate) fn parse_timestamp(value: &str) -> Option<u64> {
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

    const TWO_CUES: &str =
        "1\n00:00:01,000 --> 00:00:02,500\n你好\n\n2\n00:01:02,003 --> 01:00:00,000\n世界\n";

    fn segment(start_ms: u64, end_ms: u64, text: &str) -> Segment {
        Segment {
            start_ms,
            end_ms,
            speaker: None,
            text: text.to_string(),
            translation: None,
        }
    }

    fn translated_segment(start_ms: u64, end_ms: u64, text: &str, translation: &str) -> Segment {
        Segment {
            translation: Some(translation.to_string()),
            ..segment(start_ms, end_ms, text)
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
        let input =
            "1\n00:00:01,000 --> 00:00:02,000\nok\n\n2\n00:00:0x,000 --> 00:00:04,000\nbad\n";

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

        assert_eq!(transcript.to_srt(SrtContent::Original), TWO_CUES);
    }

    // @behavior TR-006
    #[test]
    fn writes_text_with_a_blank_line_as_one_cue() {
        let transcript = Transcript {
            segments: vec![
                segment(0, 1_000, "第一行\n\n第二行"),
                segment(1_000, 2_000, "下一段"),
            ],
        };

        let reread = Transcript::from_srt(&transcript.to_srt(SrtContent::Original)).unwrap();

        assert_eq!(reread.segments.len(), 2);
    }

    // @behavior TR-007
    #[test]
    fn writes_each_translation_in_place_of_the_text() {
        let transcript = Transcript {
            segments: vec![translated_segment(1_000, 2_500, "你好", "Hello")],
        };

        assert_eq!(
            transcript.to_srt(SrtContent::Translation),
            "1\n00:00:01,000 --> 00:00:02,500\nHello\n"
        );
    }

    // @behavior TR-008
    #[test]
    fn writes_the_original_above_its_translation() {
        let transcript = Transcript {
            segments: vec![
                translated_segment(1_000, 2_500, "你好", "Hello"),
                segment(62_003, 3_600_000, "世界"),
            ],
        };

        assert_eq!(
            transcript.to_srt(SrtContent::Bilingual),
            "1\n00:00:01,000 --> 00:00:02,500\n你好\nHello\n\n2\n00:01:02,003 --> 01:00:00,000\n世界\n"
        );
    }

    // @behavior TR-008
    #[test]
    fn writes_a_cleared_translation_as_no_translation() {
        let transcript = Transcript {
            segments: vec![translated_segment(1_000, 2_500, "你好", " \n")],
        };

        assert_eq!(
            transcript.to_srt(SrtContent::Bilingual),
            transcript.to_srt(SrtContent::Original)
        );
    }

    /// A Segment from one to two seconds said by `co`.
    fn co_segment(text: &str, translation: Option<&str>) -> Segment {
        Segment {
            speaker: Some("co".to_string()),
            translation: translation.map(str::to_string),
            ..segment(1_000, 2_000, text)
        }
    }

    fn cue_of(text: &str) -> String {
        format!("1\n00:00:01,000 --> 00:00:02,000\n{text}\n")
    }

    // @behavior TR-009
    #[test]
    fn reads_the_speaker_of_a_cue() {
        let transcript = Transcript::from_srt(&cue_of("co: 你好")).unwrap();

        assert_eq!(transcript.segments, vec![co_segment("你好", None)]);
    }

    // @behavior TR-010
    #[test]
    fn keeps_the_labels_of_a_cue_with_several_speakers() {
        let transcript = Transcript::from_srt(&cue_of("co: 你好\ncl: 嗨")).unwrap();

        assert_eq!(
            transcript.segments,
            vec![segment(1_000, 2_000, "co: 你好\ncl: 嗨")]
        );
    }

    // @behavior TR-011
    #[test]
    fn writes_the_speaker_before_the_text() {
        let transcript = Transcript {
            segments: vec![co_segment("你好", None)],
        };

        assert_eq!(transcript.to_srt(SrtContent::Original), cue_of("co: 你好"));
    }

    // @behavior TR-012
    #[test]
    fn writes_the_speaker_before_both_texts_of_a_bilingual_srt() {
        let transcript = Transcript {
            segments: vec![co_segment("你好", Some("Hello"))],
        };

        assert_eq!(
            transcript.to_srt(SrtContent::Bilingual),
            cue_of("co: 你好\nco: Hello")
        );
    }

    /// A Transcript of a Segment said by `小明`, `你好` translated as `Hello`, with `小明` named `Xiao Ming` in the translation.
    fn xiao_ming() -> (Transcript, SpeakerNames) {
        let transcript = Transcript {
            segments: vec![Segment {
                speaker: Some("小明".to_string()),
                ..translated_segment(1000, 2000, "你好", "Hello")
            }],
        };
        let names = SpeakerNames {
            translation: HashMap::from([("小明".to_string(), "Xiao Ming".to_string())]),
            ..SpeakerNames::default()
        };
        (transcript, names)
    }

    // @behavior TR-013
    #[test]
    fn writes_each_texts_own_name_for_its_speaker_in_a_bilingual_srt() {
        let (transcript, names) = xiao_ming();

        assert_eq!(
            transcript.to_srt_with(SrtContent::Bilingual, &names),
            cue_of("小明: 你好\nXiao Ming: Hello")
        );
    }

    // @behavior TR-014
    #[test]
    fn writes_the_translations_name_for_its_speaker() {
        let (transcript, names) = xiao_ming();

        assert_eq!(
            transcript.to_srt_with(SrtContent::Translation, &names),
            cue_of("Xiao Ming: Hello")
        );
    }
}

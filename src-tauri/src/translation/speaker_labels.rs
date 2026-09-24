/// Longest name a Speaker Label may carry, in characters.
const LONGEST_NAME: usize = 20;

/// A Segment's text split into its dialogue and the Speaker Label found on each line.
pub struct Labelled {
    /// Each line's label exactly as written, colon and spacing included, or none.
    labels: Vec<Option<String>>,
    pub dialogue: String,
}

impl Labelled {
    /// Takes the Speaker Label off the front of each line of `text`.
    pub fn strip(text: &str) -> Labelled {
        let (labels, lines): (Vec<_>, Vec<_>) = text.split('\n').map(split_label).unzip();
        Labelled {
            labels,
            dialogue: lines.join("\n"),
        }
    }

    /// Text whose lines carry no label and so needs none put back.
    pub fn unlabelled(text: &str) -> Labelled {
        Labelled {
            labels: Vec::new(),
            dialogue: text.to_string(),
        }
    }

    /// Puts each label back in front of its line of `translation`. Lines are matched by
    /// position, so labels are dropped rather than misplaced when the line count changed.
    pub fn reattach(&self, translation: &str) -> String {
        if self.labels.iter().all(Option::is_none) {
            return translation.to_string();
        }
        let lines: Vec<&str> = translation.split('\n').collect();
        if lines.len() != self.labels.len() {
            log::warn!("line count changed during translation, speaker labels dropped");
            return translation.to_string();
        }
        lines
            .iter()
            .zip(&self.labels)
            .map(|(line, label)| format!("{}{line}", label.as_deref().unwrap_or_default()))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// The line's label and its dialogue; a digits-only name, like the `12` of `12:30`, is a clock time.
fn split_label(line: &str) -> (Option<String>, &str) {
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

use crate::transcript::split_label;

/// A Segment's text split into its dialogue and the Speaker Label found on each line.
pub struct LabelledText {
    /// Each line's label exactly as written, colon and spacing included, or none.
    labels: Vec<Option<String>>,
    pub dialogue: String,
}

impl LabelledText {
    /// Takes the Speaker Label off the front of each line of `text`.
    pub fn split_labels(text: &str) -> LabelledText {
        let (labels, lines): (Vec<_>, Vec<_>) = text.split('\n').map(split_label).unzip();
        LabelledText {
            labels,
            dialogue: lines.join("\n"),
        }
    }

    /// Text whose lines carry no label and so needs none put back.
    pub fn new(text: &str) -> LabelledText {
        LabelledText {
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

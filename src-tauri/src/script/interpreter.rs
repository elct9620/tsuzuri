use std::collections::BTreeMap;
use std::fmt::Write;

use beni::Mrb;

use super::registry::{Registration, ScriptFailure};
use super::snapshot::{ExportOptions, Snapshot, SnapshotSegment};

const PRELUDE: &str = include_str!("prelude.rb");

/// One Script loaded into an mruby interpreter of its own, after the script API's prelude.
pub struct ScriptInterpreter {
    mrb: Mrb,
}

impl ScriptInterpreter {
    /// Loads `source`, running its top level, which registers what it offers.
    pub fn load(source: &str) -> Result<ScriptInterpreter, ScriptFailure> {
        let mrb = Mrb::open().map_err(|error| ScriptFailure::Raised {
            message: error.to_string(),
        })?;
        let interpreter = ScriptInterpreter { mrb };
        interpreter.eval::<beni::Value>(PRELUDE)?;
        interpreter.eval::<beni::Value>(source)?;
        Ok(interpreter)
    }

    /// What the Script registered, in the order it registered them.
    pub fn registrations(&self) -> Result<Vec<Registration>, ScriptFailure> {
        let json: String = self.eval("Tsuzuri.__registrations_json")?;
        Ok(serde_json::from_str(&json).expect("the prelude writes registrations as JSON"))
    }

    /// The text the Export Format registered as `id` writes of `snapshot`.
    pub fn format_text(
        &self,
        id: &str,
        snapshot: &Snapshot,
        options: &ExportOptions,
    ) -> Result<String, ScriptFailure> {
        self.eval(&format!(
            "Tsuzuri.__format_text({}, {}, {})",
            ruby_string(id),
            ruby_snapshot(snapshot),
            ruby_options(options)
        ))
    }

    /// Runs the Macro registered as `id` on `snapshot`, answering the Segments of each edit it
    /// made, in order.
    pub fn record_macro_edits(
        &self,
        id: &str,
        snapshot: &Snapshot,
    ) -> Result<Vec<Vec<SnapshotSegment>>, ScriptFailure> {
        let json: String = self.eval(&format!(
            "Tsuzuri.__macro_edits_json({}, {})",
            ruby_string(id),
            ruby_snapshot(snapshot)
        ))?;
        serde_json::from_str(&json).map_err(|error| ScriptFailure::Raised {
            message: format!("an edit returned Segments Tsuzuri cannot read: {error}"),
        })
    }

    fn eval<T: beni::TryConvert>(&self, source: &str) -> Result<T, ScriptFailure> {
        self.mrb
            .eval(source)
            .map_err(|error| ScriptFailure::Raised {
                message: error.message(&self.mrb),
            })
    }
}

/// `text` as a single-quoted Ruby literal, where only `\` and `'` are escaped.
fn ruby_string(text: &str) -> String {
    format!("'{}'", text.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn ruby_texts(texts: &BTreeMap<impl ToString, String>) -> String {
    let pairs: Vec<String> = texts
        .iter()
        .map(|(key, text)| format!("{} => {}", ruby_string(&key.to_string()), ruby_string(text)))
        .collect();
    format!("{{{}}}", pairs.join(", "))
}

fn ruby_snapshot(snapshot: &Snapshot) -> String {
    let mut segments = String::new();
    for segment in &snapshot.segments {
        let speaker = segment
            .speaker
            .as_deref()
            .map_or("nil".to_string(), ruby_string);
        let _ = write!(
            segments,
            "Tsuzuri::Segment.new(start_ms: {}, end_ms: {}, speaker: {speaker}, texts: {}),",
            segment.start_ms,
            segment.end_ms,
            ruby_texts(&segment.texts)
        );
    }
    let languages: Vec<String> = snapshot
        .languages
        .iter()
        .map(|language| ruby_string(&language.to_string()))
        .collect();
    format!(
        "Tsuzuri::Snapshot.new(primary: {}, languages: [{}], segments: [{segments}], checked: {:?})",
        ruby_string(&snapshot.primary.to_string()),
        languages.join(", "),
        snapshot.checked_segments
    )
}

fn ruby_options(options: &ExportOptions) -> String {
    format!(
        "{{ speakers: {}, blank_lines: {}, speaker_names: {} }}",
        options.has_speakers,
        options.has_blank_lines,
        ruby_texts(&options.speaker_names)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language::Language;

    fn segment(start_ms: u64, end_ms: u64, speaker: &str, text: &str) -> SnapshotSegment {
        SnapshotSegment {
            start_ms,
            end_ms,
            speaker: Some(speaker.to_string()),
            texts: BTreeMap::from([(Language::TraditionalChinese, text.to_string())]),
        }
    }

    fn snapshot(segments: Vec<SnapshotSegment>) -> Snapshot {
        Snapshot {
            primary: Language::TraditionalChinese,
            languages: vec![Language::TraditionalChinese],
            segments,
            checked_segments: vec![],
        }
    }

    fn failure_message(source: &str) -> String {
        match ScriptInterpreter::load(source) {
            Err(ScriptFailure::Raised { message }) => message,
            other => panic!("loaded: {:?}", other.map(|_| ())),
        }
    }

    // @behavior SR-009
    #[test]
    fn offers_what_a_script_registers() {
        let interpreter = ScriptInterpreter::load(
            r##"
            Tsuzuri.macro :merge_runs, label: "合併連續發言" do |context| end
            Tsuzuri.format :tsv_numbered, label: "TSV", extension: "tsv" do |snapshot, options| "" end
            "##,
        )
        .unwrap();

        assert_eq!(
            interpreter.registrations().unwrap(),
            [
                Registration::Macro {
                    id: "merge_runs".to_string(),
                    label: "合併連續發言".to_string()
                },
                Registration::ExportFormat {
                    id: "tsv_numbered".to_string(),
                    label: "TSV".to_string(),
                    extension: "tsv".to_string()
                },
            ]
        );
    }

    // @behavior SR-010
    #[test]
    fn writes_the_text_an_export_format_makes() {
        let interpreter = ScriptInterpreter::load(
            r##"
            Tsuzuri.format :numbered do |snapshot, options|
              snapshot.segments.each_with_index.map do |segment, index|
                text = segment.texts[snapshot.primary]
                "#{'%03d' % (index + 1)} #{text} #{text.size}"
              end.join("\n")
            end
            "##,
        )
        .unwrap();

        let text = interpreter.format_text(
            "numbered",
            &snapshot(vec![segment(0, 1000, "Speaker 1", "你好")]),
            &ExportOptions::default(),
        );

        assert_eq!(text, Ok("001 你好 2".to_string()));
    }

    #[test]
    fn hands_an_export_format_the_export_options() {
        let interpreter = ScriptInterpreter::load(
            r##"
            Tsuzuri.format :options do |snapshot, options|
              "#{options[:speakers]} #{options[:blank_lines]} #{options[:speaker_names]['Speaker 1']}"
            end
            "##,
        )
        .unwrap();
        let options = ExportOptions {
            has_speakers: true,
            has_blank_lines: false,
            speaker_names: BTreeMap::from([("Speaker 1".to_string(), "阿福's".to_string())]),
        };

        let text = interpreter.format_text("options", &snapshot(vec![]), &options);

        assert_eq!(text, Ok("true false 阿福's".to_string()));
    }

    // @behavior SR-011
    #[test]
    fn hands_back_the_segments_each_edit_returns() {
        let interpreter = ScriptInterpreter::load(
            r##"
            Tsuzuri.macro :merge_runs do |context|
              context.edit do |snapshot|
                snapshot.segments.chunk_while { |a, b| a.speaker == b.speaker }.map do |run|
                  run.first.with(
                    end_ms: run.map(&:end_ms).max,
                    texts: snapshot.languages.to_h { |lang| [lang, run.filter_map { |s| s.texts[lang] }.join("，")] }
                  )
                end
              end
            end
            "##,
        )
        .unwrap();

        let edits = interpreter.record_macro_edits(
            "merge_runs",
            &snapshot(vec![
                segment(0, 1000, "Speaker 1", "內容A"),
                segment(1000, 2500, "Speaker 1", "內容B\"\\"),
            ]),
        );

        assert_eq!(
            edits,
            Ok(vec![vec![segment(
                0,
                2500,
                "Speaker 1",
                "內容A，內容B\"\\"
            )]])
        );
    }

    // @behavior SR-012
    #[test]
    fn refuses_an_edit_returning_something_other_than_segments() {
        let interpreter = ScriptInterpreter::load(
            "Tsuzuri.macro :wrong do |context| context.edit { |snapshot| 'text' } end",
        )
        .unwrap();

        let edits = interpreter.record_macro_edits("wrong", &snapshot(vec![]));

        assert_eq!(
            edits,
            Err(ScriptFailure::Raised {
                message: "edit must return an Array of Tsuzuri::Segment or nil".to_string()
            })
        );
    }

    // @behavior SR-013
    #[test]
    fn names_the_error_a_script_raises() {
        assert_eq!(failure_message("raise 'boom'"), "boom");
    }

    // @behavior SR-014
    #[test]
    fn reaches_no_file() {
        assert!(failure_message("File.read('/etc/hosts')").contains("File"));
    }

    #[test]
    fn reaches_no_io() {
        assert!(failure_message("IO.read('/etc/hosts')").contains("IO"));
    }

    #[test]
    fn answers_no_edits_for_a_macro_that_leaves_the_segments() {
        let interpreter =
            ScriptInterpreter::load("Tsuzuri.macro :none do |context| context.edit { nil } end")
                .unwrap();

        assert_eq!(
            interpreter.record_macro_edits("none", &snapshot(vec![])),
            Ok(vec![])
        );
    }

    #[test]
    fn refuses_an_id_registered_twice() {
        assert_eq!(
            failure_message("Tsuzuri.macro(:a) {}\nTsuzuri.format(:a) {}"),
            ":a is registered twice"
        );
    }
}

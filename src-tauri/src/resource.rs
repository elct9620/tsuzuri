use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::failure::Failure;
use crate::language::Language;
use crate::transcript::{Segment, Transcript};

/// The extensions of the containers the bundled ffmpeg demuxes (`scripts/vendor.sh`).
const MEDIA_EXTENSIONS: [&str; 11] = [
    "mp4", "mov", "m4a", "mkv", "webm", "mp3", "wav", "ogg", "opus", "flac", "aac",
];

/// The files of a Project sharing one name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resource {
    pub name: String,
    pub media: Option<PathBuf>,
    /// The subtitle in the Primary Language.
    pub subtitle: Option<PathBuf>,
    /// A subtitle for each other Language, in the order of [`Language::ALL`].
    pub translations: Vec<(Language, PathBuf)>,
}

impl Resource {
    /// The Segments of its subtitle, none without one, carrying their translations into `translation`.
    pub fn transcript(&self, translation: Option<Language>) -> Result<Transcript, Failure> {
        let mut transcript = match &self.subtitle {
            Some(path) => srt_transcript(path)?,
            None => Transcript::default(),
        };
        self.carry_translations(&mut transcript.segments, translation)?;
        Ok(transcript)
    }

    /// Gives each Segment the text of the cue of its translation into `translation` that has the
    /// same start and end, and none where no cue does or `translation` is none.
    pub fn carry_translations(
        &self,
        segments: &mut [Segment],
        translation: Option<Language>,
    ) -> Result<(), Failure> {
        let cues = match translation.and_then(|language| self.translation_path(language)) {
            Some(path) => srt_transcript(path)?.segments,
            None => vec![],
        };
        for segment in segments {
            segment.translation = cues
                .iter()
                .find(|cue| (cue.start_ms, cue.end_ms) == (segment.start_ms, segment.end_ms))
                .map(|cue| cue.text.clone());
        }
        Ok(())
    }

    pub fn translation_path(&self, language: Language) -> Option<&Path> {
        self.translations
            .iter()
            .find(|(each, _)| *each == language)
            .map(|(_, path)| path.as_path())
    }
}

fn srt_transcript(path: &Path) -> Result<Transcript, Failure> {
    Ok(Transcript::from_srt(&std::fs::read_to_string(path)?)?)
}

/// The Resources of `directory` in the order of their names, taking subtitles as in `language`.
pub fn resources_in(directory: &Path, language: Language) -> Result<Vec<Resource>, Failure> {
    let mut file_names: Vec<String> = std::fs::read_dir(directory)?
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .collect();
    file_names.sort();
    let mut files_by_name: BTreeMap<String, FoundFiles> = BTreeMap::new();
    for file_name in file_names {
        if let Some((name, role)) = role_of(&file_name, language) {
            let files = files_by_name.entry(name).or_default();
            let path = directory.join(&file_name);
            match role {
                FileRole::Media => files.media = Some(path),
                FileRole::Subtitle => files.subtitle = Some(path),
                FileRole::CodedSubtitle => files.coded_subtitle = Some(path),
                FileRole::Translation(language) => files.translations.push((language, path)),
            }
        }
    }
    Ok(files_by_name
        .into_iter()
        .filter_map(|(name, files)| files.into_resource(name))
        .collect())
}

#[derive(Default)]
struct FoundFiles {
    media: Option<PathBuf>,
    subtitle: Option<PathBuf>,
    coded_subtitle: Option<PathBuf>,
    translations: Vec<(Language, PathBuf)>,
}

impl FoundFiles {
    /// A Resource needs a media file or a subtitle; a subtitle without a code outranks one with.
    fn into_resource(mut self, name: String) -> Option<Resource> {
        let subtitle = self.subtitle.or(self.coded_subtitle);
        if self.media.is_none() && subtitle.is_none() {
            return None;
        }
        self.translations
            .sort_by_key(|(language, _)| Language::ALL.iter().position(|each| each == language));
        Some(Resource {
            name,
            media: self.media,
            subtitle,
            translations: self.translations,
        })
    }
}

enum FileRole {
    Media,
    /// `[name].srt`
    Subtitle,
    /// `[name].[Primary Language].srt`
    CodedSubtitle,
    Translation(Language),
}

/// The Resource name a file belongs to and what it is there, or none for a file no Resource takes.
fn role_of(file_name: &str, language: Language) -> Option<(String, FileRole)> {
    if file_name.starts_with('.') {
        return None;
    }
    let (stem, extension) = file_name.rsplit_once('.')?;
    let extension = extension.to_ascii_lowercase();
    if MEDIA_EXTENSIONS.contains(&extension.as_str()) {
        return Some((stem.to_string(), FileRole::Media));
    }
    if extension != "srt" {
        return None;
    }
    let Some((name, code)) = stem
        .rsplit_once('.')
        .filter(|(_, code)| is_language_code(code))
    else {
        return Some((stem.to_string(), FileRole::Subtitle));
    };
    let is_bilingual = name
        .rsplit_once('.')
        .is_some_and(|(_, code)| is_language_code(code));
    if is_bilingual {
        return None;
    }
    let coded = Language::from_code(code)?;
    let role = match coded == language {
        true => FileRole::CodedSubtitle,
        false => FileRole::Translation(coded),
    };
    Some((name.to_string(), role))
}

/// Shaped like a BCP 47 tag of a two-letter language and an optional region or script,
/// such as `ko` or `zh-TW`, whether Tsuzuri knows the Language or not.
fn is_language_code(text: &str) -> bool {
    let (primary, subtag) = match text.split_once('-') {
        Some((primary, subtag)) => (primary, Some(subtag)),
        None => (text, None),
    };
    let is_primary = primary.len() == 2 && primary.bytes().all(|byte| byte.is_ascii_lowercase());
    let is_subtag = subtag.is_none_or(|subtag| {
        (2..=4).contains(&subtag.len()) && subtag.bytes().all(|byte| byte.is_ascii_alphanumeric())
    });
    is_primary && is_subtag
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    fn directory_of(name: &str, files: &[(&str, &str)]) -> TempDir {
        let dir = TempDir::new(name);
        for (file_name, content) in files {
            std::fs::write(dir.path().join(file_name), content).unwrap();
        }
        dir
    }

    fn cue(start: &str, end: &str, text: &str) -> String {
        format!("1\n00:00:{start},000 --> 00:00:{end},000\n{text}\n")
    }

    fn names(resources: &[Resource]) -> Vec<&str> {
        resources
            .iter()
            .map(|resource| resource.name.as_str())
            .collect()
    }

    fn texts(transcript: &Transcript) -> Vec<(&str, Option<&str>)> {
        transcript
            .segments
            .iter()
            .map(|segment| (segment.text.as_str(), segment.translation.as_deref()))
            .collect()
    }

    #[test]
    fn pairs_media_and_subtitles_by_name() {
        let dir = directory_of(
            "resource-pairs",
            &[
                ("ep01.mp4", ""),
                ("ep01.srt", ""),
                ("ep02.MKV", ""),
                ("notes.txt", ""),
            ],
        );

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(
            resources,
            vec![
                Resource {
                    name: "ep01".to_string(),
                    media: Some(dir.path().join("ep01.mp4")),
                    subtitle: Some(dir.path().join("ep01.srt")),
                    translations: vec![],
                },
                Resource {
                    name: "ep02".to_string(),
                    media: Some(dir.path().join("ep02.MKV")),
                    subtitle: None,
                    translations: vec![],
                },
            ]
        );
    }

    // @behavior PJ-016
    #[test]
    fn takes_a_subtitle_named_by_the_primary_language_as_the_original() {
        let dir = directory_of(
            "resource-coded",
            &[("ep01.zh-TW.srt", &cue("00", "01", "你好"))],
        );

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(
            texts(&resources[0].transcript(None).unwrap()),
            vec![("你好", None)]
        );
    }

    // @behavior PJ-017
    #[test]
    fn prefers_the_subtitle_without_a_language_code() {
        let dir = directory_of(
            "resource-prefer",
            &[
                ("ep01.srt", &cue("00", "01", "原本")),
                ("ep01.zh-TW.srt", &cue("00", "01", "舊的匯出")),
            ],
        );

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(resources[0].subtitle, Some(dir.path().join("ep01.srt")));
    }

    // @behavior PJ-018
    #[test]
    fn leaves_out_a_bilingual_export_and_an_unknown_language_code() {
        let dir = directory_of(
            "resource-skip",
            &[
                ("ep01.srt", ""),
                ("ep01.zh-TW.en.srt", ""),
                ("ep01.ko.srt", ""),
            ],
        );

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(
            (names(&resources), resources[0].translations.len()),
            (vec!["ep01"], 0)
        );
    }

    #[test]
    fn takes_a_dotted_name_without_a_code_as_a_whole() {
        let dir = directory_of("resource-dotted", &[("part.one.srt", ""), ("ep.1.mp4", "")]);

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(names(&resources), vec!["ep.1", "part.one"]);
    }

    #[test]
    fn leaves_out_a_translation_without_its_original() {
        let dir = directory_of("resource-orphan", &[("ep01.en.srt", "")]);

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(resources, vec![]);
    }

    // @behavior PJ-019
    #[test]
    fn loads_a_translation_by_the_times_of_its_cues() {
        let original = format!("{}\n{}", cue("00", "01", "你好"), cue("01", "02", "世界"));
        let dir = directory_of(
            "resource-times",
            &[
                ("ep01.srt", &original),
                ("ep01.en.srt", &cue("00", "01", "Hello")),
            ],
        );
        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        let transcript = resources[0].transcript(Some(Language::English)).unwrap();

        assert_eq!(
            texts(&transcript),
            vec![("你好", Some("Hello")), ("世界", None)]
        );
    }
}

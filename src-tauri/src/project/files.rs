use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::history::SubtitleSnapshot;
use super::{
    segments_at_times, translated_dialogue, Backup, BackupKind, KnownSubtitle, Project,
    ProjectConfig, Resource,
};
use crate::failure::Failure;
use crate::language::Language;
use crate::transcript::{Segment, SrtContent, Transcript};

/// `name` with the code of each Language, then `.srt`.
pub fn file_name(name: &str, languages: impl IntoIterator<Item = Option<Language>>) -> String {
    let mut file_name = name.to_string();
    for language in languages.into_iter().flatten() {
        file_name.push('.');
        file_name.push_str(language.code());
    }
    file_name.push_str(".srt");
    file_name
}

/// What the subtitle at `path` holds, or `None` when there is no such file.
pub fn content_of(path: &Path) -> Result<KnownSubtitle, Failure> {
    let content = match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    Ok((path.to_path_buf(), content))
}

/// Writes `srt` to the subtitle at `path`.
pub fn write_srt(path: &Path, srt: String) -> Result<(), Failure> {
    Ok(fs::write(path, srt)?)
}

/// What the original and each translation of `resource` hold now.
pub fn subtitle_snapshot(resource: &Resource) -> Result<SubtitleSnapshot, Failure> {
    resource
        .subtitle
        .iter()
        .chain(resource.translations.iter().map(|(_, path)| path))
        .map(|path| Ok((path.clone(), fs::read_to_string(path)?)))
        .collect::<Result<_, Failure>>()
        .map(SubtitleSnapshot)
}

/// Makes the subtitles of `now` hold what `snapshot` does, removing those it has none of.
pub fn put_back(now: &SubtitleSnapshot, snapshot: &SubtitleSnapshot) -> Result<(), Failure> {
    for (path, _) in &now.0 {
        if !snapshot.0.iter().any(|(kept_path, _)| kept_path == path) {
            fs::remove_file(path)?;
        }
    }
    for (path, content) in &snapshot.0 {
        fs::write(path, content)?;
    }
    Ok(())
}

/// Puts the file at `from` in place of the one at `to`.
pub fn copy(from: &Path, to: &Path) -> Result<(), Failure> {
    fs::copy(from, to)?;
    Ok(())
}

/// The cues of the translation at `path` as written, none when there is no such file.
pub fn translation_at(path: &Path) -> Result<Transcript, Failure> {
    match fs::read_to_string(path) {
        Ok(srt) => Ok(Transcript::from_srt_as_written(&srt)?),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Transcript::default()),
        Err(error) => Err(error.into()),
    }
}

/// The Segments of the subtitle at `path`, none when there is no such file.
pub fn transcript_at(path: &Path) -> Result<Transcript, Failure> {
    match fs::read_to_string(path) {
        Ok(srt) => Ok(Transcript::from_srt(&srt)?),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Transcript::default()),
        Err(error) => Err(error.into()),
    }
}

impl Project {
    /// Where the Current Resource keeps its original, or its translation into `language`, whether
    /// or not the file exists yet.
    pub(super) fn subtitle_path(&self, language: Option<Language>) -> Result<PathBuf, Failure> {
        let current = self.current()?;
        let resource = self.resource(&current.name)?;
        let found = match language {
            Some(language) => resource.translation_path(language).map(Path::to_path_buf),
            None => resource.subtitle.clone(),
        };
        Ok(found.unwrap_or_else(|| self.directory.join(file_name(&current.name, [language]))))
    }

    pub(super) fn bilingual_file_name(&self, name: &str, translation: Language) -> String {
        file_name(name, self.bilingual_languages(Some(translation)))
    }

    /// In the directory, named after the Current Resource with the Language codes `content`
    /// carries beyond the Primary Language alone.
    pub(super) fn export_path(&self, content: SrtContent) -> Result<PathBuf, Failure> {
        let current = self.current()?;
        let languages = match content {
            SrtContent::Original => vec![],
            SrtContent::Translation => vec![current.translation],
            SrtContent::Bilingual => self.bilingual_languages(current.translation).to_vec(),
        };
        let name = file_name(&current.name, languages);
        Ok(self.directory.join(name))
    }
}

/// The extensions of the containers the bundled ffmpeg demuxes (`scripts/vendor.sh`).
const MEDIA_EXTENSIONS: [&str; 11] = [
    "mp4", "mov", "m4a", "mkv", "webm", "mp3", "wav", "ogg", "opus", "flac", "aac",
];

impl Resource {
    /// The Segments of its subtitle, none without one, carrying their translations into
    /// `translation`, where each Speaker is named as `speaker_names` gives.
    pub fn transcript(
        &self,
        translation: Option<Language>,
        speaker_names: &HashMap<String, String>,
    ) -> Result<Transcript, Failure> {
        let mut transcript = match &self.subtitle {
            Some(path) => transcript_at(path)?,
            None => Transcript::default(),
        };
        self.carry_translations(&mut transcript.segments, translation, speaker_names)?;
        Ok(transcript)
    }

    /// Gives each Segment the dialogue of the cue of its translation into `translation` that has
    /// the same start and end, the cues at the same times taken in order, and none where no cue
    /// does or `translation` is none.
    pub fn carry_translations(
        &self,
        segments: &mut [Segment],
        translation: Option<Language>,
        speaker_names: &HashMap<String, String>,
    ) -> Result<(), Failure> {
        let cues = match translation.and_then(|language| self.translation_path(language)) {
            Some(path) => translation_at(path)?.segments,
            None => vec![],
        };
        let translations: Vec<Option<String>> = segments_at_times(&cues, segments)
            .into_iter()
            .zip(segments.iter())
            .map(|(cue, segment)| {
                cue.map(|cue| {
                    translated_dialogue(&cue.text, segment.speaker.as_deref(), speaker_names)
                })
            })
            .collect();
        for (segment, translation) in segments.iter_mut().zip(translations) {
            segment.translation = translation;
        }
        Ok(())
    }
}

/// The Resources of `directory` in the order of their names, taking subtitles as in `language`.
///
/// A media file, or a subtitle whose name ends in no code, names a Resource as it stands, so a
/// name may end like a code, as `talk.hd` does; every other subtitle belongs to the Resource its
/// name before the last code names.
pub fn resources_in(directory: &Path, language: Language) -> Result<Vec<Resource>, Failure> {
    let mut file_names: Vec<String> = std::fs::read_dir(directory)?
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|file_name| !file_name.starts_with('.'))
        .collect();
    file_names.sort();
    let mut files_by_name: BTreeMap<String, FoundFiles> = BTreeMap::new();
    let mut subtitles = Vec::new();
    for file_name in &file_names {
        let Some((stem, extension)) = file_name.rsplit_once('.') else {
            continue;
        };
        let path = directory.join(file_name);
        let extension = extension.to_ascii_lowercase();
        if MEDIA_EXTENSIONS.contains(&extension.as_str()) {
            files_by_name.entry(stem.to_string()).or_default().media = Some(path);
        } else if extension == "srt" {
            subtitles.push((stem, path));
        }
    }
    let mut coded_subtitles = Vec::new();
    for (stem, path) in subtitles {
        match name_and_code(stem) {
            Some((name, code)) if !files_by_name.contains_key(stem) => {
                coded_subtitles.push((stem, name, Language::from_code(code), path))
            }
            _ => files_by_name.entry(stem.to_string()).or_default().subtitle = Some(path),
        }
    }
    // A subtitle coded in the Primary Language, or in a code Tsuzuri does not know, may name the
    // Resource a longer name belongs to, so the shorter names are paired first.
    coded_subtitles.sort_by_key(|(stem, _, code_language, _)| {
        (stem.matches('.').count(), *code_language != Some(language))
    });
    for (stem, name, code_language, path) in &coded_subtitles {
        let is_named = files_by_name.contains_key(*name);
        if !is_named && is_bilingual(name, &files_by_name) {
            continue;
        }
        match code_language {
            Some(code_language) if *code_language == language => {
                files_by_name
                    .entry(name.to_string())
                    .or_default()
                    .coded_subtitle = Some(path.clone())
            }
            None if !is_named => {
                files_by_name.entry(stem.to_string()).or_default().subtitle = Some(path.clone())
            }
            _ => {}
        }
    }
    for (_, name, code_language, path) in coded_subtitles {
        match (code_language, files_by_name.get_mut(name)) {
            (Some(code_language), Some(files)) if code_language != language => {
                files.translations.push((code_language, path))
            }
            _ => {}
        }
    }
    Ok(files_by_name
        .into_iter()
        .filter_map(|(name, files)| files.into_resource(name))
        .collect())
}

/// Whether a subtitle whose name before its code is `name` is a Bilingual SRT: `name` itself
/// ends in a code, of a Language Tsuzuri knows or after the name of a Resource.
fn is_bilingual(name: &str, files_by_name: &BTreeMap<String, FoundFiles>) -> bool {
    name_and_code(name).is_some_and(|(resource_name, code)| {
        Language::from_code(code).is_some() || files_by_name.contains_key(resource_name)
    })
}

/// The part of `stem` before its last part, and that last part, when it is shaped like a
/// Language code.
fn name_and_code(stem: &str) -> Option<(&str, &str)> {
    stem.rsplit_once('.')
        .filter(|(_, code)| is_code_shaped(code))
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

/// Shaped like a BCP 47 tag of a two-letter language and an optional region or script,
/// such as `ko` or `zh-TW`, whether Tsuzuri knows the Language or not.
fn is_code_shaped(text: &str) -> bool {
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

const CONFIG_FILE: &str = "tsuzuri.config.json";

impl ProjectConfig {
    /// A directory without the file loads as the default.
    pub fn load(directory: &Path) -> io::Result<ProjectConfig> {
        match fs::read(directory.join(CONFIG_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(ProjectConfig::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(self, directory: &Path) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(&self).map_err(io::Error::other)?;
        fs::write(directory.join(CONFIG_FILE), json)
    }
}

/// Where a Project keeps its Backups, in a directory the Resource list never reads.
pub const HISTORY_DIR: &str = ".tsuzuri/history";

/// Where an Output's name carries its kind, after the time it was taken.
const OUTPUT_MARK: &str = ".output";

/// Copies `subtitle` into the history of `directory` as a Backup of `kind` taken `at`, when it
/// exists. A Backup already taken that second is left alone and this one takes the next free second.
pub fn back_up(
    directory: &Path,
    subtitle: &Path,
    at: SystemTime,
    kind: BackupKind,
) -> io::Result<()> {
    if !subtitle.is_file() {
        return Ok(());
    }
    keep_as_backup(directory, subtitle, &fs::read(subtitle)?, at, kind)
}

/// Keeps `content` as a Backup of `subtitle` taken at `at`, as [`back_up`] keeps the file itself,
/// for a version the file no longer holds.
pub fn keep_as_backup(
    directory: &Path,
    subtitle: &Path,
    content: &[u8],
    at: SystemTime,
    kind: BackupKind,
) -> io::Result<()> {
    let Some(stem) = subtitle_stem(subtitle) else {
        return Ok(());
    };
    let history = directory.join(HISTORY_DIR);
    fs::create_dir_all(&history)?;
    let mut at = at;
    let backup = loop {
        let mark = match kind {
            BackupKind::Output => OUTPUT_MARK,
            BackupKind::Overwrite => "",
        };
        let backup = history.join(format!("{stem}.{}{mark}.srt", utc_stamp(at)));
        if !backup.exists() {
            break backup;
        }
        at += Duration::from_secs(1);
    };
    fs::write(backup, content)
}

/// The Backups of `subtitle` in the history of `directory`, newest first.
pub fn backups_of(directory: &Path, subtitle: &Path) -> io::Result<Vec<Backup>> {
    let Some(stem) = subtitle_stem(subtitle) else {
        return Ok(Vec::new());
    };
    let entries = match fs::read_dir(directory.join(HISTORY_DIR)) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut backups: Vec<Backup> = entries
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter_map(|file| {
            let rest = file.strip_suffix(".srt")?;
            let (rest, kind) = match rest.strip_suffix(OUTPUT_MARK) {
                Some(rest) => (rest, BackupKind::Output),
                None => (rest, BackupKind::Overwrite),
            };
            let (backup_stem, taken_at) = rest.rsplit_once('.')?;
            (backup_stem == stem && is_utc_stamp(taken_at)).then(|| Backup {
                taken_at: taken_at.to_string(),
                file: file.clone(),
                kind,
            })
        })
        .collect();
    // An Output is written after the Overwrite it replaces, so within one second it is the newer.
    backups.sort_by(|a, b| {
        (&b.taken_at, b.kind == BackupKind::Output)
            .cmp(&(&a.taken_at, a.kind == BackupKind::Output))
    });
    Ok(backups)
}

/// Where the Backup named `file` is kept in the history of `directory`.
pub fn backup_path(directory: &Path, file: &str) -> PathBuf {
    directory.join(HISTORY_DIR).join(file)
}

/// `ep01` of `ep01.srt`, `ep01.en` of `ep01.en.srt`.
fn subtitle_stem(subtitle: &Path) -> Option<&str> {
    subtitle.file_name()?.to_str()?.strip_suffix(".srt")
}

fn is_utc_stamp(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 16
        && bytes[8] == b'T'
        && bytes[15] == b'Z'
        && bytes[..8]
            .iter()
            .chain(&bytes[9..15])
            .all(u8::is_ascii_digit)
}

/// `at` as `YYYYMMDDTHHMMSSZ` in UTC, which sorts in time order and names no time zone.
fn utc_stamp(at: SystemTime) -> String {
    let seconds = at
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());
    let (days, of_day) = (seconds / 86_400, seconds % 86_400);
    let (year, month, day) = civil_date(days as i64);
    format!(
        "{year:04}{month:02}{day:02}T{:02}{:02}{:02}Z",
        of_day / 3_600,
        of_day / 60 % 60,
        of_day % 60
    )
}

/// The proleptic Gregorian date `days` after 1970-01-01, by Howard Hinnant's `civil_from_days`.
fn civil_date(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * shifted_month + 2) / 5 + 1) as u32;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    } as u32;
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{BilingualOrder, ProjectModels, ProjectOptions, TranscriptionOverrides};
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
            texts(&resources[0].transcript(None, &HashMap::new()).unwrap()),
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

    // @behavior PJ-105
    #[test]
    fn pairs_subtitles_with_a_media_file_whose_name_ends_like_a_language_code() {
        let dir = directory_of(
            "resource-media-coded-name",
            &[
                ("talk.hd.mp4", ""),
                ("talk.hd.srt", ""),
                ("talk.hd.en.srt", ""),
            ],
        );

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(
            resources,
            vec![Resource {
                name: "talk.hd".to_string(),
                media: Some(dir.path().join("talk.hd.mp4")),
                subtitle: Some(dir.path().join("talk.hd.srt")),
                translations: vec![(Language::English, dir.path().join("talk.hd.en.srt"))],
            }]
        );
    }

    // @behavior PJ-106
    #[test]
    fn names_a_resource_by_a_subtitle_whose_name_ends_like_an_unknown_language_code() {
        let dir = directory_of(
            "resource-subtitle-coded-name",
            &[("talk.hd.srt", ""), ("talk.hd.en.srt", "")],
        );

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(
            resources,
            vec![Resource {
                name: "talk.hd".to_string(),
                media: None,
                subtitle: Some(dir.path().join("talk.hd.srt")),
                translations: vec![(Language::English, dir.path().join("talk.hd.en.srt"))],
            }]
        );
    }

    // @behavior PJ-107
    #[test]
    fn pairs_a_subtitle_with_the_resource_its_whole_name_before_the_code_names() {
        let dir = directory_of(
            "resource-longest-name",
            &[
                ("lecture.mp4", ""),
                ("lecture.ja.mp4", ""),
                ("lecture.ja.en.srt", ""),
            ],
        );

        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        assert_eq!(
            resources
                .iter()
                .map(|resource| (resource.name.as_str(), resource.translations.len()))
                .collect::<Vec<_>>(),
            vec![("lecture", 0), ("lecture.ja", 1)]
        );
    }

    // @behavior PJ-118
    #[test]
    fn leaves_out_an_unknown_language_code_after_a_resource_of_subtitles_alone() {
        for code in ["ko", "vi"] {
            let dir = directory_of(
                "resource-unknown-after-coded-name",
                &[("talk.hd.srt", ""), (&format!("talk.hd.{code}.srt"), "")],
            );

            let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

            assert_eq!(names(&resources), vec!["talk.hd"], "with {code}");
        }
    }

    #[test]
    fn leaves_out_a_bilingual_export_in_translation_first_order() {
        let dir = directory_of(
            "resource-skip-reversed",
            &[("ep01.srt", ""), ("ep01.en.zh-TW.srt", "")],
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

        let transcript = resources[0]
            .transcript(Some(Language::English), &HashMap::new())
            .unwrap();

        assert_eq!(
            texts(&transcript),
            vec![("你好", Some("Hello")), ("世界", None)]
        );
    }

    // @behavior PJ-138
    #[test]
    fn loads_a_translation_for_segments_with_the_same_times_in_their_order() {
        let original = format!("{}\n{}", cue("00", "01", "大家好"), cue("00", "01", "對啊"));
        let translation = format!("{}\n{}", cue("00", "01", "Hello"), cue("00", "01", "Yeah"));
        let dir = directory_of(
            "resource-same-times",
            &[("ep01.srt", &original), ("ep01.en.srt", &translation)],
        );
        let resources = resources_in(dir.path(), Language::TraditionalChinese).unwrap();

        let transcript = resources[0]
            .transcript(Some(Language::English), &HashMap::new())
            .unwrap();

        assert_eq!(
            texts(&transcript),
            vec![("大家好", Some("Hello")), ("對啊", Some("Yeah"))]
        );
    }

    #[test]
    fn loads_what_it_saved() {
        let dir = TempDir::new("config-round-trip");
        let config = ProjectConfig {
            language: Some(Language::Japanese),
            translation_language: Some(Language::English),
            options: ProjectOptions {
                bilingual_order: BilingualOrder::TranslationFirst,
                is_bilingual_autosaved: true,
                is_overwrite_backed_up: true,
                models: ProjectModels {
                    transcription: Some(PathBuf::from("/models/kotoba.bin")),
                    translation: None,
                },
                transcription: TranscriptionOverrides {
                    has_vad: Some(true),
                    ..TranscriptionOverrides::default()
                },
            },
        };

        config.clone().save(dir.path()).unwrap();

        assert_eq!(ProjectConfig::load(dir.path()).unwrap(), config);
    }

    #[test]
    fn loads_the_default_options_from_a_file_written_without_them() {
        let dir = TempDir::new("config-without-options");
        fs::write(dir.path().join(CONFIG_FILE), r#"{"language":"ja"}"#).unwrap();

        let config = ProjectConfig::load(dir.path()).unwrap();

        assert_eq!(
            (config.language, config.options),
            (Some(Language::Japanese), ProjectOptions::default())
        );
    }

    #[test]
    fn loads_the_default_without_a_file() {
        let dir = TempDir::new("config-missing");

        assert_eq!(
            ProjectConfig::load(dir.path()).unwrap(),
            ProjectConfig::default()
        );
    }

    #[test]
    fn stamps_a_time_in_utc() {
        let at = UNIX_EPOCH + Duration::from_secs(1_790_303_400);

        assert_eq!(utc_stamp(at), "20260925T023000Z");
    }

    #[test]
    fn stamps_the_last_day_of_a_leap_february() {
        let at = UNIX_EPOCH + Duration::from_secs(951_782_400);

        assert_eq!(utc_stamp(at), "20000229T000000Z");
    }

    #[test]
    fn takes_the_next_free_second_for_a_backup_taken_twice_in_one() {
        let dir = TempDir::new("history-same-second");
        let subtitle = dir.path().join("ep01.srt");
        let at = UNIX_EPOCH + Duration::from_secs(1_790_303_400);
        std::fs::write(&subtitle, "first").unwrap();
        back_up(dir.path(), &subtitle, at, BackupKind::Overwrite).unwrap();
        std::fs::write(&subtitle, "second").unwrap();

        back_up(dir.path(), &subtitle, at, BackupKind::Overwrite).unwrap();

        let taken: Vec<String> = backups_of(dir.path(), &subtitle)
            .unwrap()
            .into_iter()
            .map(|backup| backup.taken_at)
            .collect();
        assert_eq!(taken, ["20260925T023001Z", "20260925T023000Z"]);
    }
}

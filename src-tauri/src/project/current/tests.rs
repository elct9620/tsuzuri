use super::*;
use crate::model_source::ModelSource;
use crate::project::{
    BilingualOrder, ProjectConfig, ProjectModels, TranscriptionOverrides, TranscriptionScope,
};
use crate::test_support::{backups, output_backups, overwrite_backups, project_of, TempDir};

fn segment(text: &str, translation: Option<&str>) -> Segment {
    Segment {
        start_ms: 0,
        end_ms: 1_000,
        speaker: None,
        text: text.to_string(),
        translation: translation.map(str::to_string),
    }
}

/// What transcribing all of the Current Resource of `current` starts from, writing over its
/// subtitle.
fn whole_transcription_target(current: &CurrentProject) -> TranscriptionTarget {
    current
        .hold_for_transcription(TranscriptionRequest {
            is_overwrite_allowed: true,
            scope: TranscriptionScope::Whole,
        })
        .unwrap()
        .0
}

fn cue(text: &str) -> String {
    format!("1\n00:00:00,000 --> 00:00:01,000\n{text}\n")
}

fn directory_of(name: &str, files: &[(&str, &str)]) -> TempDir {
    let dir = TempDir::new(name);
    for (file_name, content) in files {
        std::fs::write(dir.path().join(file_name), content).unwrap();
    }
    dir
}

fn current_project_of(segments: Vec<Segment>) -> CurrentProject {
    let current = CurrentProject::default();
    current.replace(project_of(segments));
    current
}

fn project_in(dir: &TempDir) -> CurrentProject {
    let current = CurrentProject::default();
    current.replace(Project::open(dir.path().to_path_buf(), Language::TraditionalChinese).unwrap());
    current
}

fn segments(current: &CurrentProject) -> Vec<Segment> {
    current.view().unwrap().segments().to_vec()
}

fn texts(current: &CurrentProject) -> Vec<String> {
    segments(current)
        .into_iter()
        .map(|segment| segment.translation.unwrap_or(segment.text))
        .collect()
}

fn config_of(dir: &TempDir) -> ProjectConfig {
    ProjectConfig::load(dir.path()).unwrap()
}

fn file_text(dir: &TempDir, name: &str) -> String {
    std::fs::read_to_string(dir.path().join(name)).unwrap()
}

/// A Project of two Segments, the first said by `阿福`.
fn project_with_a_speaker() -> CurrentProject {
    let current = CurrentProject::default();
    current.replace(project_of(vec![
        Segment {
            speaker: Some("阿福".to_string()),
            ..segment("少爺", None)
        },
        segment("我等等就下去", None),
    ]));
    current
}

/// A Project in `zh-TW` of `ep01` translated into `en`, whose Bilingual Order puts the
/// translation first.
fn translation_first_project_in(dir: &TempDir) -> CurrentProject {
    std::fs::write(dir.path().join("ep01.srt"), cue("大家好")).unwrap();
    std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();
    let current = project_in(dir);
    current
        .set_options(ProjectOptions {
            bilingual_order: BilingualOrder::TranslationFirst,
            ..ProjectOptions::default()
        })
        .unwrap();
    current
}

/// The Project `lecture`, a directory of its own under `dir`, opened in `zh-TW`.
fn lecture_in(dir: &TempDir) -> CurrentProject {
    let lecture = dir.path().join("lecture");
    std::fs::create_dir_all(&lecture).unwrap();
    let current = CurrentProject::default();
    current.replace(Project::open(lecture, Language::TraditionalChinese).unwrap());
    current
}

fn options_named(name: &str) -> ProjectOptions {
    ProjectOptions {
        name: Some(name.to_string()),
        ..ProjectOptions::default()
    }
}

/// A Project in `zh-TW` of `ep01` translated into each of `translations`, saving Bilingual
/// SRTs as `is_bilingual_autosaved` says.
fn bilingual_project_in(
    dir: &TempDir,
    translations: &[(&str, &str)],
    is_bilingual_autosaved: bool,
) -> CurrentProject {
    std::fs::write(dir.path().join("ep01.srt"), cue("大家好")).unwrap();
    for (code, text) in translations {
        std::fs::write(dir.path().join(format!("ep01.{code}.srt")), cue(text)).unwrap();
    }
    let current = project_in(dir);
    current
        .set_options(ProjectOptions {
            is_bilingual_autosaved,
            ..ProjectOptions::default()
        })
        .unwrap();
    current
}

fn read(dir: &TempDir, file_name: &str) -> String {
    std::fs::read_to_string(dir.path().join(file_name)).unwrap()
}

/// SRT text of cues each `(start ms, end ms, text)`.
fn srt_of(cues: &[(u64, u64, &str)]) -> String {
    Transcript {
        segments: cues
            .iter()
            .map(|(start_ms, end_ms, text)| Segment {
                start_ms: *start_ms,
                end_ms: *end_ms,
                speaker: None,
                text: text.to_string(),
                translation: None,
            })
            .collect(),
    }
    .to_srt(WrittenText::Original)
}

/// A Project in `zh-TW` of `ep01` holding `original`, and `translation` as its `en` translation.
fn changing_project_in(
    dir: &TempDir,
    original: &[(u64, u64, &str)],
    translation: &[(u64, u64, &str)],
) -> CurrentProject {
    std::fs::write(dir.path().join("ep01.srt"), srt_of(original)).unwrap();
    if !translation.is_empty() {
        std::fs::write(dir.path().join("ep01.en.srt"), srt_of(translation)).unwrap();
    }
    project_in(dir)
}

fn times_and_texts(current: &CurrentProject) -> Vec<(u64, u64, String)> {
    segments(current)
        .into_iter()
        .map(|segment| (segment.start_ms, segment.end_ms, segment.text))
        .collect()
}

fn owned(segments: &[(u64, u64, &str)]) -> Vec<(u64, u64, String)> {
    segments
        .iter()
        .map(|&(start_ms, end_ms, text)| (start_ms, end_ms, text.to_string()))
        .collect()
}

/// The one Segment `first` and `second`, one second each, read as merged.
fn merged_text(name: &str, first: &str, second: &str) -> String {
    let dir = TempDir::new(name);
    let current = changing_project_in(&dir, &[(0, 1_000, first), (1_000, 2_000, second)], &[]);

    current
        .change_segments(SegmentChange::Merge { first: 0, last: 1 })
        .unwrap();

    read(&dir, "ep01.srt")
}

/// Whether `backups` is one Backup of `stem`, stamped with a UTC time, holding `content`.
fn is_one_backup_of(backups: &[(String, String)], stem: &str, content: &str) -> bool {
    match backups {
        [(name, backup_content)] => {
            let stamp = name
                .strip_prefix(&format!("{stem}."))
                .and_then(|rest| rest.strip_suffix("Z.srt"));
            stamp.is_some_and(|stamp| stamp.len() == 15) && backup_content == content
        }
        _ => false,
    }
}

/// A Project in `zh-TW` of `ep01` translated into `en` as `Hello`, keeping Backups as asked.
fn backup_project_in(dir: &TempDir, is_overwrite_backed_up: bool) -> CurrentProject {
    std::fs::write(dir.path().join("ep01.srt"), cue("大家好")).unwrap();
    std::fs::write(dir.path().join("ep01.en.srt"), cue("Hello")).unwrap();
    let current = project_in(dir);
    current
        .set_options(ProjectOptions {
            is_overwrite_backed_up,
            ..ProjectOptions::default()
        })
        .unwrap();
    current
}

/// Writes a Backup named `file` into the history of `dir` holding `content`.
fn write_backup(dir: &TempDir, file: &str, content: &str) {
    let history = dir.path().join(files::HISTORY_DIR);
    std::fs::create_dir_all(&history).unwrap();
    std::fs::write(history.join(file), content).unwrap();
}

/// The files of each subtitle's Backups, the original first.
fn backup_files(current: &CurrentProject) -> Vec<(Option<Language>, Vec<String>)> {
    current
        .subtitle_versions()
        .unwrap()
        .into_iter()
        .map(|versions| {
            let files = versions.backups.into_iter().map(|backup| backup.file);
            (versions.language, files.collect())
        })
        .collect()
}

fn two_cues(first: &str, second: &str) -> String {
    format!(
        "1\n00:00:00,000 --> 00:00:01,000\n{first}\n\n2\n00:00:01,000 --> 00:00:02,000\n{second}\n"
    )
}

fn resource_names(current: &CurrentProject) -> Vec<String> {
    current
        .view()
        .unwrap()
        .resources
        .into_iter()
        .map(|resource| resource.name)
        .collect()
}

/// A Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`,
/// whose `ep01.srt` reads `小明: 你好`, and holding `files` besides.
fn xiao_ming_project_in(dir: &TempDir, files: &[(&str, &str)]) -> CurrentProject {
    std::fs::write(
        dir.path().join("glossary.csv"),
        "zh-TW,en,type\n小明,Xiao Ming,speaker\n",
    )
    .unwrap();
    std::fs::write(dir.path().join("ep01.srt"), cue("小明: 你好")).unwrap();
    for (file_name, content) in files {
        std::fs::write(dir.path().join(file_name), content).unwrap();
    }
    project_in(dir)
}

fn replacement(pattern: &str, substitute: &str, is_regex: bool) -> Replacement {
    Replacement {
        pattern: pattern.to_string(),
        substitute: substitute.to_string(),
        is_regex,
    }
}

fn chosen_segments(indexes: &[usize]) -> CleanupScope {
    CleanupScope::Segments {
        indexes: indexes.to_vec(),
    }
}

/// A Project whose `ep01` has a media file, `ep01.srt` reading `co: 你好` and `ep01.en.srt`
/// reading `co: Hello`, and a transcription of `你好` with no Speaker written over it.
fn transcribe_over_speakers(dir: &TempDir, is_overwrite_backed_up: bool) {
    transcribe_over(dir, "co: ", is_overwrite_backed_up);
}

/// A Project whose `ep01` has a media file, `ep01.srt` reading `你好` and `ep01.en.srt`
/// reading `Hello`, each after `label`, and a transcription of `你好` with no Speaker written over it.
fn transcribe_over(dir: &TempDir, label: &str, is_overwrite_backed_up: bool) {
    for (file_name, content) in [
        ("ep01.mp4", String::new()),
        ("ep01.srt", cue(&format!("{label}你好"))),
        ("ep01.en.srt", cue(&format!("{label}Hello"))),
    ] {
        std::fs::write(dir.path().join(file_name), content).unwrap();
    }
    let current = project_in(dir);
    current
        .set_options(ProjectOptions {
            is_overwrite_backed_up,
            ..ProjectOptions::default()
        })
        .unwrap();
    let target = whole_transcription_target(&current);

    current.write_transcription(&target, cue("你好")).unwrap();
}

fn shown_translation(current: &CurrentProject) -> Option<String> {
    segments(current)[0].translation.clone()
}
fn edit_text(current: &CurrentProject, text: &str) {
    current
        .edit(0, SegmentField::Text, text.to_string())
        .unwrap();
}
fn hold_ep01<'a>(
    current: &'a CurrentProject,
    dir: &TempDir,
    mode: RunningMode,
) -> ResourceHold<'a> {
    current.hold_resource(dir.path(), "ep01", mode)
}

const ENGLISH_TRANSLATION: RunningMode = RunningMode::Translation {
    language: Language::English,
    indexes: None,
};

fn translated_again(source: &TranslationSource, index: usize, text: &str) -> Vec<Segment> {
    let mut segments = source.transcript.segments.clone();
    segments[index].translation = Some(text.to_string());
    segments
}

fn translated_in_english(name: &str) -> (TempDir, CurrentProject) {
    let dir = directory_of(
        name,
        &[
            ("ep01.srt", &two_cues("你好", "世界")),
            ("ep01.en.srt", &two_cues("Hello", "World")),
        ],
    );
    let current = project_in(&dir);
    (dir, current)
}

/// What each Overwrite in the history of `dir` reads, oldest first.
fn kept_overwrites(dir: &TempDir) -> Vec<String> {
    overwrite_backups(dir.path())
        .into_iter()
        .map(|(_, content)| content)
        .collect()
}
const BACKUP: &str = "ep01.20260925T023000Z.srt";

/// A Current Resource `ep01` reading `now`, with a Backup of it reading `backup`.
fn backed_up_project_in(dir: &TempDir, backup: &str, now: &str) -> CurrentProject {
    std::fs::write(dir.path().join("ep01.srt"), now).unwrap();
    write_backup(dir, BACKUP, backup);
    project_in(dir)
}

/// A Current Resource `ep01` whose merged cue is translated, with a Backup from before the merge.
fn merged_project_in(dir: &TempDir) -> CurrentProject {
    std::fs::write(
        dir.path().join("ep01.en.srt"),
        srt_of(&[(0, 2_000, "Hello world")]),
    )
    .unwrap();
    backed_up_project_in(
        dir,
        &srt_of(&[(0, 1_000, "你好"), (1_000, 2_000, "世界")]),
        &srt_of(&[(0, 2_000, "你好世界")]),
    )
}

mod editing_behavior;
mod project_behavior;
mod undo_behavior;
mod versions_behavior;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::failure::Failure;
use crate::language::Language;
use crate::resource::{self, Resource};
use crate::transcript::{Segment, SrtContent, Transcript};
use crate::translation_glossary::{TranslationGlossary, TranslationGlossaryView};

/// The opened directory: its Primary Language, the Language of its last translation,
/// its Resources, the Current Resource and the Translation Glossary once loaded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub directory: PathBuf,
    pub language: Language,
    pub translation_language: Option<Language>,
    pub translation_glossary: Option<TranslationGlossary>,
    pub resources: Vec<Resource>,
    pub current: Option<CurrentResource>,
}

/// The Resource the editor shows, with its Segments as read from the directory and edited since.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentResource {
    pub name: String,
    pub transcript: Transcript,
    /// The Language of the translations its Segments carry.
    pub translation: Option<Language>,
}

impl Project {
    /// The directory's Resources in `language`, with the first of them current.
    pub fn open(directory: PathBuf, language: Language) -> Result<Project, Failure> {
        let resources = resource::resources_in(&directory, language)?;
        let mut project = Project {
            directory,
            language,
            translation_language: None,
            translation_glossary: None,
            resources,
            current: None,
        };
        if let Some(first) = project.resources.first().map(|found| found.name.clone()) {
            project.select(&first)?;
        }
        Ok(project)
    }

    /// Reads the named Resource from the directory, showing the Language of the last
    /// translation when it has one, else its first translation.
    pub fn select(&mut self, name: &str) -> Result<(), Failure> {
        let resource = self.resource(name)?;
        let translation = self
            .translation_language
            .filter(|language| resource.translation_path(*language).is_some())
            .or(resource.translations.first().map(|(language, _)| *language));
        self.current = Some(CurrentResource {
            name: name.to_string(),
            transcript: resource.transcript(translation)?,
            translation,
        });
        Ok(())
    }

    /// Shows the Current Resource's translation into `language` from the directory, or none.
    pub fn show_translation(&mut self, language: Option<Language>) -> Result<(), Failure> {
        let current = self.current.as_mut().ok_or(Failure::NoResource)?;
        let resource = self
            .resources
            .iter()
            .find(|resource| resource.name == current.name)
            .ok_or(Failure::NoResource)?;
        resource.carry_translations(&mut current.transcript.segments, language)?;
        current.translation = language;
        Ok(())
    }

    /// In the directory, named after the Current Resource with the Language codes `content`
    /// carries beyond the Primary Language alone.
    pub fn export_path(&self, content: SrtContent) -> Result<PathBuf, Failure> {
        let current = self.current()?;
        let codes = match content {
            SrtContent::Original => vec![],
            SrtContent::Translation => vec![current.translation],
            SrtContent::Bilingual => vec![Some(self.language), current.translation],
        };
        let mut name = current.name.clone();
        for language in codes.into_iter().flatten() {
            name.push('.');
            name.push_str(language.code());
        }
        name.push_str(".srt");
        Ok(self.directory.join(name))
    }

    fn resource(&self, name: &str) -> Result<&Resource, Failure> {
        self.resources
            .iter()
            .find(|resource| resource.name == name)
            .ok_or(Failure::NoResource)
    }

    fn current(&self) -> Result<&CurrentResource, Failure> {
        self.current.as_ref().ok_or(Failure::NoResource)
    }

    fn current_mut(&mut self) -> Result<&mut CurrentResource, Failure> {
        self.current.as_mut().ok_or(Failure::NoResource)
    }
}

/// A Resource as the Resource list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ResourceView {
    name: String,
    has_media: bool,
    has_subtitle: bool,
    translation_languages: Vec<Language>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProjectView {
    directory: PathBuf,
    language: Language,
    translation_language: Option<Language>,
    translation_glossary: Option<TranslationGlossaryView>,
    resources: Vec<ResourceView>,
    current_resource: Option<String>,
    media: Option<PathBuf>,
    segments: Vec<Segment>,
    shown_translation: Option<Language>,
}

impl ProjectView {
    pub fn media(&self) -> Option<&Path> {
        self.media.as_deref()
    }

    pub fn language(&self) -> Language {
        self.language
    }

    pub fn translation_language(&self) -> Option<Language> {
        self.translation_language
    }

    pub fn translation_glossary(&self) -> Option<&TranslationGlossaryView> {
        self.translation_glossary.as_ref()
    }

    pub fn segments(&self) -> &[Segment] {
        &self.segments
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    pub fn resource_names(&self) -> Vec<&str> {
        self.resources
            .iter()
            .map(|resource| resource.name.as_str())
            .collect()
    }

    pub fn current_resource(&self) -> Option<&str> {
        self.current_resource.as_deref()
    }
}

/// Which text of a Segment an edit replaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SegmentField {
    Text,
    Translation,
}

/// What a transcription needs from the Project when it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptionTarget {
    pub generation: u64,
    pub media: PathBuf,
    pub language: Language,
}

#[derive(Debug, Default)]
struct HeldProject {
    /// Counts replacements and selections, so a job that outlives its Current Resource can tell.
    generation: u64,
    project: Option<Project>,
}

/// The one Project every screen reads from and writes to; Rust holds it so no screen keeps its own copy.
#[derive(Debug, Default)]
pub struct CurrentProject(Mutex<HeldProject>);

impl CurrentProject {
    pub fn replace(&self, project: Project) {
        let mut held = self.lock();
        held.generation += 1;
        held.project = Some(project);
    }

    pub fn select(&self, name: &str) -> Result<(), Failure> {
        let mut held = self.lock();
        held.project
            .as_mut()
            .ok_or(Failure::NoProject)?
            .select(name)?;
        held.generation += 1;
        Ok(())
    }

    pub fn show_translation(&self, language: Option<Language>) -> Result<(), Failure> {
        self.update_project(|project| project.show_translation(language))
    }

    pub fn view(&self) -> Option<ProjectView> {
        self.lock().project.as_ref().map(|project| {
            let current = project.current.as_ref();
            ProjectView {
                directory: project.directory.clone(),
                language: project.language,
                translation_language: project.translation_language,
                translation_glossary: project
                    .translation_glossary
                    .as_ref()
                    .map(TranslationGlossary::view),
                resources: project
                    .resources
                    .iter()
                    .map(|resource| ResourceView {
                        name: resource.name.clone(),
                        has_media: resource.media.is_some(),
                        has_subtitle: resource.subtitle.is_some(),
                        translation_languages: resource
                            .translations
                            .iter()
                            .map(|(language, _)| *language)
                            .collect(),
                    })
                    .collect(),
                current_resource: current.map(|current| current.name.clone()),
                media: current
                    .and_then(|current| project.resource(&current.name).ok())
                    .and_then(|resource| resource.media.clone()),
                segments: current
                    .map_or_else(Vec::new, |current| current.transcript.segments.clone()),
                shown_translation: current.and_then(|current| current.translation),
            }
        })
    }

    /// The Current Resource's Transcript as it stands, with the generation to hand back to
    /// [`CurrentProject::write_translations`], and the Primary Language it is in.
    pub fn snapshot(&self) -> Result<(u64, Transcript, Language), Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        Ok((
            held.generation,
            project.current()?.transcript.clone(),
            project.language,
        ))
    }

    /// The Current Resource's media file and the Language to transcribe it in.
    pub fn transcription_target(&self) -> Result<TranscriptionTarget, Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        let media = project
            .resource(&project.current()?.name)?
            .media
            .clone()
            .ok_or(Failure::NoMedia)?;
        Ok(TranscriptionTarget {
            generation: held.generation,
            media,
            language: project.language,
        })
    }

    /// Makes `transcript` the Current Resource's, unless another became current since `generation`.
    pub fn write_transcript(&self, generation: u64, transcript: Transcript) {
        self.write_if_current(generation, |project| {
            if let Some(current) = project.current.as_mut() {
                current.transcript = transcript;
                current.translation = None;
            }
        });
    }

    /// Writes each Segment's translation into `target` by position and records `target` as the
    /// Project's translation Language, unless another Resource became current since `generation`.
    pub fn write_translations(&self, generation: u64, target: Language, segments: Vec<Segment>) {
        self.write_if_current(generation, |project| {
            project.translation_language = Some(target);
            if let Some(current) = project.current.as_mut() {
                current.translation = Some(target);
                for (segment, translated) in current.transcript.segments.iter_mut().zip(segments) {
                    segment.translation = translated.translation;
                }
            }
        });
    }

    /// Replaces the Project's Translation Glossary, or removes it with `None`.
    pub fn set_translation_glossary(
        &self,
        glossary: Option<TranslationGlossary>,
    ) -> Result<(), Failure> {
        self.update_project(|project| {
            project.translation_glossary = glossary;
            Ok(())
        })
    }

    /// The Project's Translation Glossary, for a translation to use.
    pub fn translation_glossary(&self) -> Option<TranslationGlossary> {
        self.lock()
            .project
            .as_ref()
            .and_then(|project| project.translation_glossary.clone())
    }

    pub fn edit(&self, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {
        self.update_project(|project| {
            let segment = project
                .current_mut()?
                .transcript
                .segments
                .get_mut(index)
                .ok_or_else(|| Failure::Internal {
                    detail: format!("no Segment at {index}"),
                })?;
            match field {
                SegmentField::Text => segment.text = value,
                SegmentField::Translation => segment.translation = Some(value),
            }
            Ok(())
        })
    }

    pub fn export_path(&self, content: SrtContent) -> Result<PathBuf, Failure> {
        let held = self.lock();
        held.project
            .as_ref()
            .ok_or(Failure::NoProject)?
            .export_path(content)
    }

    pub fn to_srt(&self, content: SrtContent) -> Result<String, Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        Ok(project.current()?.transcript.to_srt(content))
    }

    fn update_project<T>(
        &self,
        change: impl FnOnce(&mut Project) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        change(self.lock().project.as_mut().ok_or(Failure::NoProject)?)
    }

    fn write_if_current(&self, generation: u64, write: impl FnOnce(&mut Project)) {
        let mut held = self.lock();
        if held.generation != generation {
            return;
        }
        if let Some(project) = held.project.as_mut() {
            write(project);
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HeldProject> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Tells the webview the Project changed, so it asks for what Rust now holds.
pub fn announce<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit("project-changed", ());
}

/// The directory an SRT file is in, opened with the file's Resource current.
fn open_directory_of(path: &Path, language: Language) -> Result<Project, Failure> {
    let directory = path.parent().ok_or_else(|| Failure::Io {
        detail: format!("{} is in no directory", path.display()),
    })?;
    let mut project = Project::open(directory.to_path_buf(), language)?;
    let (name, translation) = project
        .resources
        .iter()
        .find_map(|resource| {
            if resource.subtitle.as_deref() == Some(path) {
                return Some((resource.name.clone(), None));
            }
            let (translation, _) = resource
                .translations
                .iter()
                .find(|(_, translation_path)| translation_path == path)?;
            Some((resource.name.clone(), Some(*translation)))
        })
        .ok_or(Failure::NoResource)?;
    project.select(&name)?;
    if translation.is_some() {
        project.show_translation(translation)?;
    }
    Ok(project)
}

#[tauri::command]
pub fn open_project(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {
    app.state::<CurrentProject>()
        .replace(Project::open(path, language)?);
    announce(&app);
    Ok(())
}

#[tauri::command]
pub fn open_srt(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {
    app.state::<CurrentProject>()
        .replace(open_directory_of(&path, language)?);
    announce(&app);
    Ok(())
}

#[tauri::command]
pub fn select_resource(app: AppHandle, name: String) -> Result<(), Failure> {
    app.state::<CurrentProject>().select(&name)?;
    announce(&app);
    Ok(())
}

#[tauri::command]
pub fn show_translation(app: AppHandle, language: Option<Language>) -> Result<(), Failure> {
    app.state::<CurrentProject>().show_translation(language)?;
    announce(&app);
    Ok(())
}

#[tauri::command]
pub fn current_project(app: AppHandle) -> Option<ProjectView> {
    app.state::<CurrentProject>().view()
}

#[tauri::command]
pub fn edit_segment(
    app: AppHandle,
    index: usize,
    field: SegmentField,
    value: String,
) -> Result<(), Failure> {
    app.state::<CurrentProject>().edit(index, field, value)?;
    announce(&app);
    Ok(())
}

#[tauri::command]
pub fn export_path(app: AppHandle, content: SrtContent) -> Result<PathBuf, Failure> {
    app.state::<CurrentProject>().export_path(content)
}

#[tauri::command]
pub fn save_srt(app: AppHandle, path: PathBuf, content: SrtContent) -> Result<(), Failure> {
    let srt = app.state::<CurrentProject>().to_srt(content)?;
    Ok(std::fs::write(path, srt)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{project_of, TempDir};

    fn segment(text: &str, translation: Option<&str>) -> Segment {
        Segment {
            start_ms: 0,
            end_ms: 1_000,
            text: text.to_string(),
            translation: translation.map(str::to_string),
        }
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
        current.replace(
            Project::open(dir.path().to_path_buf(), Language::TraditionalChinese).unwrap(),
        );
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

    // @behavior PJ-001
    #[test]
    fn opens_a_directory_as_the_project() {
        let dir = directory_of(
            "pj-open",
            &[
                ("ep01.mp4", ""),
                ("ep01.srt", &cue("你好")),
                ("ep02.mp4", ""),
            ],
        );

        let current = project_in(&dir);

        assert_eq!(
            current.view().unwrap().resource_names(),
            vec!["ep01", "ep02"]
        );
    }

    // @behavior PJ-015
    #[test]
    fn selects_the_first_resource_of_an_opened_directory() {
        let dir = directory_of(
            "pj-first",
            &[("ep02.srt", &cue("第二集")), ("ep01.srt", &cue("第一集"))],
        );

        let current = project_in(&dir);

        let view = current.view().unwrap();
        assert_eq!(
            (view.current_resource(), texts(&current)),
            (Some("ep01"), vec!["第一集".to_string()])
        );
    }

    #[test]
    fn opens_a_directory_without_resources_with_none_current() {
        let dir = directory_of("pj-empty", &[("notes.txt", "")]);

        let current = project_in(&dir);

        assert_eq!(current.view().unwrap().current_resource(), None);
    }

    // @behavior PJ-020
    #[test]
    fn shows_another_translation_of_the_current_resource() {
        let dir = directory_of(
            "pj-show",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Hello")),
                ("ep01.ja.srt", &cue("こんにちは")),
            ],
        );
        let current = project_in(&dir);

        current.show_translation(Some(Language::Japanese)).unwrap();

        assert_eq!(texts(&current), vec!["こんにちは".to_string()]);
    }

    #[test]
    fn keeps_edited_text_when_showing_another_translation() {
        let dir = directory_of(
            "pj-show-edited",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "大家好".to_string())
            .unwrap();

        current.show_translation(None).unwrap();

        assert_eq!(segments(&current), vec![segment("大家好", None)]);
    }

    // @behavior PJ-021
    #[test]
    fn selects_another_resource() {
        let dir = directory_of(
            "pj-select",
            &[("ep01.srt", &cue("第一集")), ("ep02.srt", &cue("第二集"))],
        );
        let current = project_in(&dir);

        current.select("ep02").unwrap();

        assert_eq!(texts(&current), vec!["第二集".to_string()]);
    }

    #[test]
    fn refuses_a_resource_the_project_does_not_have() {
        let current = current_project_of(vec![]);

        assert_eq!(current.select("ep09"), Err(Failure::NoResource));
    }

    // @behavior PJ-007
    #[test]
    fn opens_the_directory_of_an_srt_file() {
        let dir = directory_of(
            "pj-open-srt",
            &[("interview.srt", &cue("訪談")), ("talk.srt", &cue("演講"))],
        );

        let project =
            open_directory_of(&dir.path().join("talk.srt"), Language::TraditionalChinese).unwrap();

        assert_eq!(
            (
                project.directory.as_path(),
                project.current.map(|current| current.name)
            ),
            (dir.path(), Some("talk".to_string()))
        );
    }

    // @behavior PJ-023
    #[test]
    fn opens_a_translation_srt_file_showing_that_translation() {
        let dir = directory_of(
            "pj-open-translation",
            &[
                ("ep01.srt", &cue("你好")),
                ("ep01.en.srt", &cue("Hello")),
                ("ep01.ja.srt", &cue("こんにちは")),
            ],
        );

        let project = open_directory_of(
            &dir.path().join("ep01.ja.srt"),
            Language::TraditionalChinese,
        )
        .unwrap();

        let current = project.current.unwrap();
        assert_eq!(
            (current.name.as_str(), current.translation),
            ("ep01", Some(Language::Japanese))
        );
    }

    // @behavior PJ-011
    #[test]
    fn starts_a_new_project_without_a_translation_glossary() {
        let dir = directory_of(
            "pj-glossary",
            &[("names.csv", "source,target\n阿福,Alfred\n")],
        );
        let current = current_project_of(vec![segment("大家好", None)]);
        current
            .set_translation_glossary(Some(
                TranslationGlossary::from_csv(&dir.path().join("names.csv")).unwrap(),
            ))
            .unwrap();

        current.replace(
            Project::open(dir.path().to_path_buf(), Language::TraditionalChinese).unwrap(),
        );

        assert_eq!(current.view().unwrap().translation_glossary(), None);
    }

    // @behavior PJ-012
    #[test]
    fn names_an_export_by_the_resource_and_its_languages() {
        let current = current_project_of(vec![segment("大家好", None)]);
        let (generation, _, _) = current.snapshot().unwrap();
        current.write_translations(
            generation,
            Language::English,
            vec![segment("大家好", Some("Hello"))],
        );

        let paths = [
            SrtContent::Original,
            SrtContent::Translation,
            SrtContent::Bilingual,
        ]
        .map(|content| current.export_path(content).unwrap());

        assert_eq!(
            paths,
            [
                PathBuf::from("/talks/lecture.srt"),
                PathBuf::from("/talks/lecture.en.srt"),
                PathBuf::from("/talks/lecture.zh-TW.en.srt"),
            ]
        );
    }

    // @behavior PJ-003
    #[test]
    fn holds_edits_to_text_and_translation() {
        let current = current_project_of(vec![segment("竹子搞", Some("Bamboo"))]);

        current
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();
        current
            .edit(0, SegmentField::Translation, "Transcript".to_string())
            .unwrap();

        assert_eq!(
            segments(&current),
            vec![segment("逐字稿", Some("Transcript"))]
        );
    }

    // @behavior PJ-004
    #[test]
    fn writes_the_current_resource_as_edited() {
        let current = current_project_of(vec![segment("竹子搞", None)]);
        current
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();

        let srt = current.to_srt(SrtContent::Original).unwrap();

        assert_eq!(srt, "1\n00:00:00,000 --> 00:00:01,000\n逐字稿\n");
    }

    // @behavior PJ-005
    #[test]
    fn refuses_work_without_a_project() {
        let current = CurrentProject::default();

        let failures = [
            current.snapshot().map(|_| ()).unwrap_err(),
            current
                .edit(0, SegmentField::Text, "x".to_string())
                .unwrap_err(),
            current
                .to_srt(SrtContent::Original)
                .map(|_| ())
                .unwrap_err(),
        ];

        assert_eq!(
            failures,
            [Failure::NoProject, Failure::NoProject, Failure::NoProject]
        );
    }

    #[test]
    fn refuses_to_transcribe_a_resource_without_media() {
        let current = current_project_of(vec![]);

        assert_eq!(current.transcription_target(), Err(Failure::NoMedia));
    }

    // @behavior PJ-006
    #[test]
    fn leaves_a_replaced_project_untouched_by_a_late_translation() {
        let current = current_project_of(vec![segment("大家好", None)]);
        let (generation, _, _) = current.snapshot().unwrap();
        current.replace(project_of(vec![segment("另一份", None)]));

        current.write_translations(
            generation,
            Language::English,
            vec![segment("大家好", Some("Hello"))],
        );

        assert_eq!(segments(&current), vec![segment("另一份", None)]);
    }

    // @behavior PJ-010
    #[test]
    fn records_the_language_of_a_translation() {
        let current = current_project_of(vec![segment("こんにちは", None)]);
        let (generation, _, _) = current.snapshot().unwrap();

        current.write_translations(
            generation,
            Language::English,
            vec![segment("こんにちは", Some("Hello"))],
        );

        let view = current.view().unwrap();
        assert_eq!(
            (view.language(), view.translation_language()),
            (Language::TraditionalChinese, Some(Language::English))
        );
    }
}

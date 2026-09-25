use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::failure::Failure;
use crate::language::{Language, LanguagePair};
use crate::project_config::ProjectConfig;
use crate::resource::{self, Resource};
use crate::transcript::{Segment, SrtContent, Transcript};
use crate::translation_glossary::{GlossaryTable, TranslationGlossary, TranslationGlossaryView};

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
    /// What its subtitle files held when Tsuzuri last read or wrote them, to tell a change made elsewhere.
    pub subtitle_digests: Vec<SubtitleDigest>,
}

/// A subtitle file and a digest of what it held, or `None` while it did not exist.
pub type SubtitleDigest = (PathBuf, Option<u64>);

fn digest_of(path: &Path) -> Result<SubtitleDigest, Failure> {
    let digest = match std::fs::read(path) {
        Ok(bytes) => {
            let mut hasher = DefaultHasher::new();
            bytes.hash(&mut hasher);
            Some(hasher.finish())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    Ok((path.to_path_buf(), digest))
}

impl Project {
    /// The directory's Resources in the Primary Language its Project Config records, else in
    /// `language`, with the first of them current. A `glossary.csv` it cannot read is left out
    /// here and reported when a translation reads it again.
    pub fn open(directory: PathBuf, language: Language) -> Result<Project, Failure> {
        let config = ProjectConfig::load(&directory)?;
        let language = config.language.unwrap_or(language);
        let mut project = Project {
            resources: resource::resources_in(&directory, language)?,
            translation_glossary: None,
            directory,
            language,
            translation_language: config.translation_language,
            current: None,
        };
        project.translation_glossary =
            TranslationGlossary::from_directory(&project.directory, project.source_target())
                .ok()
                .flatten();
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
            subtitle_digests: Vec::new(),
        });
        self.remember_subtitles()
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
        self.remember_subtitles()
    }

    /// The Languages a Translation Glossary's `source,target` header stands for: the Primary
    /// Language and the translation Language, once the Project has one.
    fn source_target(&self) -> Option<LanguagePair> {
        self.translation_language.map(|target| LanguagePair {
            source: self.language,
            target,
        })
    }

    /// Digests of the Current Resource's original subtitle and the translation file it shows.
    fn subtitle_digests(&self) -> Result<Vec<SubtitleDigest>, Failure> {
        let current = self.current()?;
        let resource = self.resource(&current.name)?;
        let translation_path = current
            .translation
            .and_then(|language| resource.translation_path(language));
        resource
            .subtitle
            .as_deref()
            .into_iter()
            .chain(translation_path)
            .map(digest_of)
            .collect()
    }

    /// Records what the Current Resource's subtitle files hold now, as read or written by Tsuzuri.
    fn remember_subtitles(&mut self) -> Result<(), Failure> {
        let digests = self.subtitle_digests()?;
        self.current_mut()?.subtitle_digests = digests;
        Ok(())
    }

    /// Whether a subtitle file of the Current Resource no longer holds what Tsuzuri last read or wrote.
    fn is_changed_elsewhere(&self) -> Result<bool, Failure> {
        Ok(self.subtitle_digests()? != self.current()?.subtitle_digests)
    }

    /// Reads the Current Resource again from the directory, showing the same translation.
    fn read_current_again(&mut self) -> Result<(), Failure> {
        let current = self.current()?;
        let (name, translation) = (current.name.clone(), current.translation);
        self.resources = resource::resources_in(&self.directory, self.language)?;
        self.select(&name)?;
        self.show_translation(translation)
    }

    /// Pairs the directory's subtitles again as in `language`, keeping the Current Resource
    /// when it is still one, and records `language` in the Project Config.
    pub fn set_language(&mut self, language: Language) -> Result<(), Failure> {
        ProjectConfig {
            language: Some(language),
            translation_language: self.translation_language,
        }
        .save(&self.directory)?;
        self.language = language;
        self.resources = resource::resources_in(&self.directory, language)?;
        let name = self
            .current
            .as_ref()
            .map(|current| current.name.clone())
            .filter(|name| self.resource(name).is_ok())
            .or(self.resources.first().map(|first| first.name.clone()));
        match name {
            Some(name) => self.select(&name),
            None => {
                self.current = None;
                Ok(())
            }
        }
    }

    /// Writes the Current Resource's subtitle that `field` belongs to back to the directory:
    /// the original, or the translation shown, which holds only the Segments translated.
    fn write_back(&mut self, field: SegmentField) -> Result<(), Failure> {
        let current = self.current()?;
        let (content, srt) = match (field, current.translation) {
            (SegmentField::Text, _) => (
                SrtContent::Original,
                current.transcript.to_srt(SrtContent::Original),
            ),
            (SegmentField::Translation, Some(_)) => (
                SrtContent::Translation,
                translation_only(&current.transcript).to_srt(SrtContent::Original),
            ),
            (SegmentField::Translation, None) => return Ok(()),
        };
        let resource = self.resource(&current.name)?;
        let path = match (content, current.translation) {
            (SrtContent::Translation, Some(language)) => {
                resource.translation_path(language).map(Path::to_path_buf)
            }
            _ => resource.subtitle.clone(),
        };
        let path = match path {
            Some(path) => path,
            None => self.export_path(content)?,
        };
        std::fs::write(path, srt)?;
        self.resources = resource::resources_in(&self.directory, self.language)?;
        self.remember_subtitles()
    }

    fn save_config(&self) -> Result<(), Failure> {
        Ok(ProjectConfig {
            language: Some(self.language),
            translation_language: self.translation_language,
        }
        .save(&self.directory)?)
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

/// Records the subtitles a transcription or translation has just written as Tsuzuri's own.
fn remember_written_subtitles(project: &mut Project) {
    if let Err(failure) = project.remember_subtitles() {
        log::warn!("could not read back the subtitles just written: {failure:?}");
    }
}

/// The translated Segments alone, each with its translation as its text.
fn translation_only(transcript: &Transcript) -> Transcript {
    Transcript {
        segments: transcript
            .segments
            .iter()
            .filter_map(|segment| {
                let translation = segment.translation.as_deref()?;
                (!translation.trim().is_empty()).then(|| Segment {
                    text: translation.to_string(),
                    translation: None,
                    ..segment.clone()
                })
            })
            .collect(),
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

/// What a translation needs from the Project when it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationSource {
    pub generation: u64,
    pub directory: PathBuf,
    /// The Resource being translated.
    pub name: String,
    pub transcript: Transcript,
    /// The Primary Language it is translated from.
    pub language: Language,
}

/// What a transcription needs from the Project when it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptionTarget {
    pub generation: u64,
    pub directory: PathBuf,
    pub media: PathBuf,
    /// Where the Resource's original subtitle is written.
    pub subtitle: PathBuf,
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

    /// What a translation of the Current Resource starts from, to hand back to
    /// [`CurrentProject::show_translations`] and [`CurrentProject::write_translations`].
    pub fn snapshot(&self) -> Result<TranslationSource, Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        let current = project.current()?;
        Ok(TranslationSource {
            generation: held.generation,
            directory: project.directory.clone(),
            name: current.name.clone(),
            transcript: current.transcript.clone(),
            language: project.language,
        })
    }

    /// The Current Resource's media file, the Language to transcribe it in and the subtitle to
    /// write, refused when that subtitle exists unless `overwrite`.
    pub fn transcription_target(&self, overwrite: bool) -> Result<TranscriptionTarget, Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        let resource = project.resource(&project.current()?.name)?;
        let media = resource.media.clone().ok_or(Failure::NoMedia)?;
        let subtitle = match &resource.subtitle {
            Some(path) if !overwrite => return Err(Failure::SubtitleExists { path: path.clone() }),
            Some(path) => path.clone(),
            None => project.export_path(SrtContent::Original)?,
        };
        Ok(TranscriptionTarget {
            generation: held.generation,
            directory: project.directory.clone(),
            media,
            subtitle,
            language: project.language,
        })
    }

    /// Pairs the directory's files again after one was written, if it is still the Project's.
    pub fn refresh_resources(&self, directory: &Path) -> Result<(), Failure> {
        let mut held = self.lock();
        match held.project.as_mut() {
            Some(project) if project.directory == directory => {
                project.resources = resource::resources_in(directory, project.language)?;
                Ok(())
            }
            _ => Ok(()),
        }
    }

    /// Makes `transcript` the Current Resource's, unless another became current since `generation`.
    pub fn write_transcript(&self, generation: u64, transcript: Transcript) {
        self.write_if_current(generation, |project| {
            if let Some(current) = project.current.as_mut() {
                current.transcript = transcript;
                current.translation = None;
            }
            remember_written_subtitles(project);
        });
    }

    /// Adds a Segment just transcribed to the Current Resource, unless another became current
    /// since `generation`.
    pub fn push_segment(&self, generation: u64, segment: Segment) {
        self.write_if_current(generation, |project| {
            if let Some(current) = project.current.as_mut() {
                current.transcript.segments.push(segment);
            }
        });
    }

    /// Shows the translations into `target` finished so far, by position, and none after them,
    /// unless another Resource became current since `source` was taken.
    pub fn show_translations(
        &self,
        source: &TranslationSource,
        target: Language,
        translated_segments: &[Segment],
    ) {
        self.write_if_current(source.generation, |project| {
            if let Some(current) = project.current.as_mut() {
                current.translation = Some(target);
                for (index, segment) in current.transcript.segments.iter_mut().enumerate() {
                    segment.translation = translated_segments
                        .get(index)
                        .and_then(|translated_segment| translated_segment.translation.clone());
                }
            }
            remember_written_subtitles(project);
        });
    }

    /// Writes the translations into `target` to the Resource's translation file, whichever
    /// Resource is current now, and, while it is still current, shows them and records `target`
    /// as the Project's translation Language.
    pub fn write_translations(
        &self,
        source: &TranslationSource,
        target: Language,
        segments: Vec<Segment>,
    ) -> Result<(), Failure> {
        let path = source
            .directory
            .join(format!("{}.{}.srt", source.name, target.code()));
        let translation = Transcript { segments };
        std::fs::write(
            path,
            translation_only(&translation).to_srt(SrtContent::Original),
        )?;
        self.refresh_resources(&source.directory)?;
        self.show_translations(source, target, &translation.segments);
        self.write_if_current(source.generation, |project| {
            project.translation_language = Some(target);
            if let Err(failure) = project.save_config() {
                log::warn!("could not record the translation Language: {failure:?}");
            }
        });
        Ok(())
    }

    /// Reads the directory's `glossary.csv` again into the Project, for a translation to use.
    pub fn reload_translation_glossary(&self) -> Result<Option<TranslationGlossary>, Failure> {
        self.update_project(|project| {
            project.translation_glossary =
                TranslationGlossary::from_directory(&project.directory, project.source_target())?;
            Ok(project.translation_glossary.clone())
        })
    }

    /// The directory's `glossary.csv` as a table to edit, or an empty one without the file.
    pub fn glossary_table(&self) -> Result<GlossaryTable, Failure> {
        self.update_project(|project| {
            Ok(
                TranslationGlossary::from_directory(&project.directory, project.source_target())?
                    .map_or_else(GlossaryTable::empty, |glossary| glossary.table()),
            )
        })
    }

    /// Writes an edited table to the directory's `glossary.csv` and holds it as the Project's.
    pub fn save_translation_glossary(&self, rows: &[Vec<String>]) -> Result<(), Failure> {
        self.update_project(|project| {
            TranslationGlossary::write(&project.directory, rows)?;
            project.translation_glossary =
                TranslationGlossary::from_directory(&project.directory, project.source_target())?;
            Ok(())
        })
    }

    pub fn set_language(&self, language: Language) -> Result<(), Failure> {
        let mut held = self.lock();
        held.project
            .as_mut()
            .ok_or(Failure::NoProject)?
            .set_language(language)?;
        held.generation += 1;
        Ok(())
    }

    /// Reads the Current Resource again when one of its subtitles was changed elsewhere, answering
    /// whether it did.
    pub fn read_again_if_changed(&self) -> Result<bool, Failure> {
        self.update_project(|project| {
            if project.current.is_none() || !project.is_changed_elsewhere()? {
                return Ok(false);
            }
            project.read_current_again()?;
            Ok(true)
        })
    }

    /// Makes an edit and writes it back, unless a subtitle was changed elsewhere since Tsuzuri last
    /// read or wrote it: then the Current Resource is read again instead, keeping that change.
    pub fn edit(&self, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {
        self.update_project(|project| {
            if project.is_changed_elsewhere()? {
                project.read_current_again()?;
                return Err(Failure::ChangedElsewhere);
            }
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
            project.write_back(field)
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

/// Reads the Current Resource again when a subtitle of it was changed elsewhere, and tells the
/// webview; a failure is logged, since nobody asked for this read.
pub fn read_again_if_changed<R: Runtime>(app: &AppHandle<R>) {
    match app.state::<CurrentProject>().read_again_if_changed() {
        Ok(true) => announce(app),
        Ok(false) => {}
        Err(failure) => log::warn!("could not read the Current Resource again: {failure:?}"),
    }
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
pub fn set_primary_language(app: AppHandle, language: Language) -> Result<(), Failure> {
    app.state::<CurrentProject>().set_language(language)?;
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
    let edited = app.state::<CurrentProject>().edit(index, field, value);
    announce(&app);
    edited
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
    use crate::project_config::ProjectConfig;
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
        let with_glossary = directory_of(
            "pj-glossary",
            &[("glossary.csv", "zh-TW,en\n阿福,Alfred\n")],
        );
        let without_glossary = directory_of("pj-no-glossary", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&with_glossary);

        current.replace(
            Project::open(
                without_glossary.path().to_path_buf(),
                Language::TraditionalChinese,
            )
            .unwrap(),
        );

        assert_eq!(current.view().unwrap().translation_glossary(), None);
    }

    // @behavior PJ-024
    #[test]
    fn reads_the_primary_language_from_the_project_config() {
        let dir = directory_of(
            "pj-config-read",
            &[("tsuzuri.config.json", r#"{"language":"ja"}"#)],
        );

        let current = project_in(&dir);

        assert_eq!(current.view().unwrap().language(), Language::Japanese);
    }

    fn config_of(dir: &TempDir) -> ProjectConfig {
        ProjectConfig::load(dir.path()).unwrap()
    }

    // @behavior PJ-025
    #[test]
    fn records_a_new_primary_language_in_the_project_config() {
        let dir = directory_of("pj-config-write", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);

        current.set_language(Language::Japanese).unwrap();

        assert_eq!(config_of(&dir).language, Some(Language::Japanese));
    }

    // @behavior PJ-026
    #[test]
    fn pairs_subtitles_again_under_a_new_primary_language() {
        let dir = directory_of("pj-config-pair", &[("ep01.ja.srt", &cue("こんにちは"))]);
        let current = project_in(&dir);

        current.set_language(Language::Japanese).unwrap();

        assert_eq!(texts(&current), vec!["こんにちは".to_string()]);
    }

    // @behavior PJ-027
    #[test]
    fn records_the_translation_language_in_the_project_config() {
        let dir = directory_of("pj-config-translation", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("你好", Some("Hello"))],
            )
            .unwrap();

        assert_eq!(
            config_of(&dir).translation_language,
            Some(Language::English)
        );
    }

    fn file_text(dir: &TempDir, name: &str) -> String {
        std::fs::read_to_string(dir.path().join(name)).unwrap()
    }

    // @behavior PJ-028
    #[test]
    fn writes_an_edited_original_back_to_its_file() {
        let dir = directory_of("pj-write-original", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Text, "大家好".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.srt"), cue("大家好"));
    }

    // @behavior PJ-029
    #[test]
    fn writes_an_edited_translation_back_to_its_file() {
        let dir = directory_of(
            "pj-write-translation",
            &[("ep01.srt", &cue("你好")), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
    }

    // @behavior PJ-030
    #[test]
    fn leaves_untranslated_segments_out_of_a_translation_file() {
        let original =
            "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n";
        let dir = directory_of(
            "pj-write-untranslated",
            &[("ep01.srt", original), ("ep01.en.srt", &cue("Hello"))],
        );
        let current = project_in(&dir);

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
    }

    // @behavior PJ-012
    #[test]
    fn names_an_export_by_the_resource_and_its_languages() {
        let current = current_project_of(vec![segment("大家好", None)]);
        let source = current.snapshot().unwrap();
        current.show_translations(
            &source,
            Language::English,
            &[segment("大家好", Some("Hello"))],
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

    // @behavior PJ-031
    #[test]
    fn writes_the_translation_beside_its_original() {
        let original =
            "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n";
        let dir = directory_of("tl-write-file", &[("ep01.srt", original)]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        let translation: Vec<Segment> = source
            .transcript
            .segments
            .iter()
            .map(|segment| Segment {
                translation: Some(format!("EN:{}", segment.text)),
                ..segment.clone()
            })
            .collect();

        current
            .write_translations(&source, Language::English, translation)
            .unwrap();

        assert_eq!(
            file_text(&dir, "ep01.en.srt"),
            "1\n00:00:00,000 --> 00:00:01,000\nEN:你好\n\n2\n00:00:01,000 --> 00:00:02,000\nEN:世界\n"
        );
    }

    // @behavior PJ-032
    #[test]
    fn writes_the_translation_of_a_resource_no_longer_current() {
        let dir = directory_of(
            "tl-write-other",
            &[("ep01.srt", &cue("你好")), ("ep02.srt", &cue("再見"))],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        current.select("ep02").unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("你好", Some("Hello"))],
            )
            .unwrap();

        assert_eq!(
            (file_text(&dir, "ep01.en.srt"), segments(&current)),
            (cue("Hello"), vec![segment("再見", None)])
        );
    }

    // @behavior PJ-003
    #[test]
    fn holds_edits_to_text_and_translation() {
        let dir = directory_of(
            "pj-edit",
            &[
                ("ep01.srt", &cue("竹子搞")),
                ("ep01.en.srt", &cue("Bamboo")),
            ],
        );
        let current = project_in(&dir);

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
        let dir = directory_of("pj-export-edited", &[("ep01.srt", &cue("竹子搞"))]);
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "逐字稿".to_string())
            .unwrap();

        let srt = current.to_srt(SrtContent::Original).unwrap();

        assert_eq!(srt, cue("逐字稿"));
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

        assert_eq!(current.transcription_target(false), Err(Failure::NoMedia));
    }

    // @behavior PJ-006
    #[test]
    fn leaves_a_replaced_project_untouched_by_a_late_translation() {
        let dir = directory_of("pj-replaced", &[("ep01.srt", &cue("大家好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        current.replace(project_of(vec![segment("另一份", None)]));

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("大家好", Some("Hello"))],
            )
            .unwrap();

        assert_eq!(segments(&current), vec![segment("另一份", None)]);
    }

    // @behavior PJ-010
    #[test]
    fn records_the_language_of_a_translation() {
        let dir = directory_of(
            "pj-translation-language",
            &[("ep01.srt", &cue("こんにちは"))],
        );
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();

        current
            .write_translations(
                &source,
                Language::English,
                vec![segment("こんにちは", Some("Hello"))],
            )
            .unwrap();

        let view = current.view().unwrap();
        assert_eq!(
            (view.language(), view.translation_language()),
            (Language::TraditionalChinese, Some(Language::English))
        );
    }

    fn two_cues(first: &str, second: &str) -> String {
        format!(
            "1\n00:00:00,000 --> 00:00:01,000\n{first}\n\n2\n00:00:01,000 --> 00:00:02,000\n{second}\n"
        )
    }

    // @behavior PJ-039
    #[test]
    fn keeps_an_edit_off_a_subtitle_changed_elsewhere() {
        let dir = directory_of("pj-changed-kept", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

        let _ = current.edit(0, SegmentField::Text, "大家好".to_string());

        assert_eq!(file_text(&dir, "ep01.srt"), cue("您好"));
    }

    // @behavior PJ-040
    #[test]
    fn reads_again_a_subtitle_an_edit_found_changed_elsewhere() {
        let dir = directory_of("pj-changed-edit", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

        let edited = current.edit(0, SegmentField::Text, "大家好".to_string());

        assert_eq!(
            (edited, texts(&current)),
            (Err(Failure::ChangedElsewhere), vec!["您好".to_string()])
        );
    }

    // @behavior PJ-041
    #[test]
    fn reads_again_a_subtitle_changed_elsewhere_on_focus() {
        let dir = directory_of("pj-changed-focus", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        std::fs::write(dir.path().join("ep01.srt"), cue("您好")).unwrap();

        current.read_again_if_changed().unwrap();

        assert_eq!(texts(&current), vec!["您好".to_string()]);
    }

    // @behavior PJ-042
    #[test]
    fn writes_edit_after_edit() {
        let dir = directory_of(
            "pj-edit-after-edit",
            &[("ep01.srt", &two_cues("你好", "世界"))],
        );
        let current = project_in(&dir);
        current
            .edit(0, SegmentField::Text, "大家好".to_string())
            .unwrap();

        current
            .edit(1, SegmentField::Text, "地球".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.srt"), two_cues("大家好", "地球"));
    }

    // @behavior PJ-043
    #[test]
    fn edits_a_translation_tsuzuri_just_wrote() {
        let dir = directory_of("pj-edit-written", &[("ep01.srt", &cue("你好"))]);
        let current = project_in(&dir);
        let source = current.snapshot().unwrap();
        let translation = vec![Segment {
            translation: Some("Hello".to_string()),
            ..source.transcript.segments[0].clone()
        }];
        current
            .write_translations(&source, Language::English, translation)
            .unwrap();

        current
            .edit(0, SegmentField::Translation, "Hi".to_string())
            .unwrap();

        assert_eq!(file_text(&dir, "ep01.en.srt"), cue("Hi"));
    }
}

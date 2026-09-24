use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::failure::Failure;
use crate::language::{Language, LanguagePair};
use crate::transcript::{Segment, SrtContent, Transcript};

/// The work on one input: the media file, when there is one, its Transcript, the Language it is in
/// and the Language of its translations once translated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub media: Option<PathBuf>,
    pub transcript: Transcript,
    pub language: Language,
    pub translation_language: Option<Language>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProjectView {
    media: Option<PathBuf>,
    segments: Vec<Segment>,
    language: Language,
    translation_language: Option<Language>,
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

    pub fn segments(&self) -> &[Segment] {
        &self.segments
    }
}

/// Which text of a Segment an edit replaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SegmentField {
    Text,
    Translation,
}

#[derive(Debug, Default)]
struct HeldProject {
    /// Counts replacements, so a job that outlives its Project can tell.
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

    pub fn view(&self) -> Option<ProjectView> {
        self.lock().project.as_ref().map(|project| ProjectView {
            media: project.media.clone(),
            segments: project.transcript.segments.clone(),
            language: project.language,
            translation_language: project.translation_language,
        })
    }

    /// The Transcript as it stands, with the generation to hand back to [`CurrentProject::translated`].
    pub fn snapshot(&self) -> Result<(u64, Transcript), Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        Ok((held.generation, project.transcript.clone()))
    }

    /// Writes each Segment's translation by position and the Languages it went between,
    /// unless the Project was replaced since `generation`.
    pub fn write_translations(
        &self,
        generation: u64,
        languages: LanguagePair,
        segments: Vec<Segment>,
    ) {
        let mut held = self.lock();
        if held.generation != generation {
            return;
        }
        if let Some(project) = held.project.as_mut() {
            project.language = languages.source;
            project.translation_language = Some(languages.target);
            for (segment, translated) in project.transcript.segments.iter_mut().zip(segments) {
                segment.translation = translated.translation;
            }
        }
    }

    pub fn edit(&self, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {
        let mut held = self.lock();
        let project = held.project.as_mut().ok_or(Failure::NoProject)?;
        let segment =
            project
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
    }

    pub fn to_srt(&self, content: SrtContent) -> Result<String, Failure> {
        let held = self.lock();
        let project = held.project.as_ref().ok_or(Failure::NoProject)?;
        Ok(project.transcript.to_srt(content))
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

fn open(path: PathBuf) -> Result<Project, Failure> {
    let srt = std::fs::read_to_string(&path)?;
    Ok(Project {
        media: None,
        transcript: Transcript::from_srt(&srt)?,
        language: Language::TraditionalChinese,
        translation_language: None,
    })
}

#[tauri::command]
pub fn open_srt(app: AppHandle, path: PathBuf) -> Result<(), Failure> {
    app.state::<CurrentProject>().replace(open(path)?);
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
pub fn save_srt(app: AppHandle, path: PathBuf, content: SrtContent) -> Result<(), Failure> {
    let srt = app.state::<CurrentProject>().to_srt(content)?;
    Ok(std::fs::write(path, srt)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language::LanguagePair;
    use crate::test_support::TempDir;

    fn segment(text: &str, translation: Option<&str>) -> Segment {
        Segment {
            start_ms: 0,
            end_ms: 1_000,
            text: text.to_string(),
            translation: translation.map(str::to_string),
        }
    }

    fn current_project_of(segments: Vec<Segment>) -> CurrentProject {
        let current = CurrentProject::default();
        current.replace(Project {
            media: None,
            language: Language::TraditionalChinese,
            translation_language: None,
            transcript: Transcript { segments },
        });
        current
    }

    fn segments(current: &CurrentProject) -> Vec<Segment> {
        current.view().unwrap().segments().to_vec()
    }

    // @behavior PJ-001
    #[test]
    fn opens_an_srt_file_as_a_project_without_media() {
        let dir = TempDir::new("pj-open");
        let path = dir.path().join("lecture.srt");
        std::fs::write(
            &path,
            "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n",
        )
        .unwrap();
        let current = CurrentProject::default();

        current.replace(open(path).unwrap());

        let view = current.view().unwrap();
        assert_eq!((view.media(), view.segments().len()), (None, 2));
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
    fn writes_the_project_as_edited() {
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

    // @behavior PJ-006
    #[test]
    fn leaves_a_replaced_project_untouched_by_a_late_translation() {
        let current = current_project_of(vec![segment("大家好", None)]);
        let (generation, _) = current.snapshot().unwrap();
        current.replace(Project {
            media: None,
            language: Language::TraditionalChinese,
            translation_language: None,
            transcript: Transcript {
                segments: vec![segment("另一份", None)],
            },
        });

        current.write_translations(generation, pair(), vec![segment("大家好", Some("Hello"))]);

        assert_eq!(segments(&current), vec![segment("另一份", None)]);
    }

    fn pair() -> LanguagePair {
        LanguagePair {
            source: Language::TraditionalChinese,
            target: Language::English,
        }
    }

    // @behavior PJ-010
    #[test]
    fn records_the_languages_of_a_translation() {
        let current = current_project_of(vec![segment("こんにちは", None)]);
        let (generation, _) = current.snapshot().unwrap();

        current.write_translations(
            generation,
            LanguagePair {
                source: Language::Japanese,
                target: Language::English,
            },
            vec![segment("こんにちは", Some("Hello"))],
        );

        let view = current.view().unwrap();
        assert_eq!(
            (view.language(), view.translation_language()),
            (Language::Japanese, Some(Language::English))
        );
    }
}

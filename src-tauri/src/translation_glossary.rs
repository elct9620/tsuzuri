use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::failure::Failure;
use crate::project::{self, CurrentProject};

/// The user's terms, such as names and titles, whose target a translation must use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationGlossary {
    file: PathBuf,
    terms: Vec<(String, String)>,
}

/// What the webview shows of a Translation Glossary: the file it came from and how many terms it holds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranslationGlossaryView {
    file: PathBuf,
    term_count: usize,
}

#[derive(Deserialize)]
struct TermRow {
    source: String,
    target: String,
}

impl TranslationGlossary {
    /// Reads a CSV file whose header is `source,target`; rows missing either side are skipped.
    pub fn from_csv(path: &Path) -> Result<TranslationGlossary, Failure> {
        let mut reader = csv::Reader::from_reader(std::fs::File::open(path)?);
        let headers = reader.headers().map_err(malformed_glossary)?;
        if !headers.iter().any(|name| name.trim() == "source")
            || !headers.iter().any(|name| name.trim() == "target")
        {
            return Err(Failure::GlossaryWithoutHeader);
        }
        let mut terms = Vec::new();
        for row in reader.deserialize::<TermRow>() {
            let row = row.map_err(malformed_glossary)?;
            let (source, target) = (row.source.trim(), row.target.trim());
            if !source.is_empty() && !target.is_empty() {
                terms.push((source.to_string(), target.to_string()));
            }
        }
        Ok(TranslationGlossary {
            file: path.to_path_buf(),
            terms,
        })
    }

    pub fn terms(&self) -> &[(String, String)] {
        &self.terms
    }

    pub fn view(&self) -> TranslationGlossaryView {
        TranslationGlossaryView {
            file: self.file.clone(),
            term_count: self.terms.len(),
        }
    }
}

fn malformed_glossary(error: csv::Error) -> Failure {
    Failure::MalformedGlossary {
        detail: error.to_string(),
    }
}

/// Reads `path` into the Project's Translation Glossary; a file that cannot be read leaves the one it had.
fn load_glossary_into(project: &CurrentProject, path: &Path) -> Result<(), Failure> {
    project.set_translation_glossary(Some(TranslationGlossary::from_csv(path)?))
}

#[tauri::command]
pub fn load_glossary(app: AppHandle, path: PathBuf) -> Result<(), Failure> {
    load_glossary_into(&app.state::<CurrentProject>(), &path)?;
    project::announce(&app);
    Ok(())
}

#[tauri::command]
pub fn clear_glossary(app: AppHandle) -> Result<(), Failure> {
    app.state::<CurrentProject>()
        .set_translation_glossary(None)?;
    project::announce(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language::Language;
    use crate::project::Project;
    use crate::test_support::TempDir;
    use crate::transcript::Transcript;

    fn current_project() -> CurrentProject {
        let current = CurrentProject::default();
        current.replace(Project {
            media: None,
            opened_srt: None,
            transcript: Transcript {
                segments: Vec::new(),
            },
            language: Language::TraditionalChinese,
            translation_language: None,
            translation_glossary: None,
        });
        current
    }

    fn csv_file(dir: &TempDir, name: &str, text: &str) -> PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, text).unwrap();
        path
    }

    fn glossary_view(current: &CurrentProject) -> Option<TranslationGlossaryView> {
        current.view().unwrap().translation_glossary().cloned()
    }

    // @behavior TL-038
    #[test]
    fn loads_a_translation_glossary_into_the_project() {
        let dir = TempDir::new("gl-load");
        let names = csv_file(
            &dir,
            "names.csv",
            "\u{feff}source,target\n蝙蝠俠,Batman\n\"諾蘭\",\"Nolan, Christopher\"\n",
        );
        let current = current_project();

        load_glossary_into(&current, &names).unwrap();

        assert_eq!(
            current.translation_glossary().unwrap().terms(),
            [
                ("蝙蝠俠".to_string(), "Batman".to_string()),
                ("諾蘭".to_string(), "Nolan, Christopher".to_string()),
            ]
        );
        assert_eq!(
            glossary_view(&current),
            Some(TranslationGlossaryView {
                file: names,
                term_count: 2
            })
        );
    }

    // @behavior TL-039
    #[test]
    fn refuses_a_translation_glossary_without_its_header() {
        let dir = TempDir::new("gl-header");
        let names = csv_file(&dir, "names.csv", "source,target\n蝙蝠俠,Batman\n");
        let headless = csv_file(&dir, "headless.csv", "蝙蝠俠,Batman\n");
        let current = current_project();
        load_glossary_into(&current, &names).unwrap();

        let result = load_glossary_into(&current, &headless);

        assert_eq!(result, Err(Failure::GlossaryWithoutHeader));
        assert_eq!(glossary_view(&current).map(|view| view.file), Some(names));
    }

    // @behavior TL-043
    #[test]
    fn clears_the_translation_glossary() {
        let dir = TempDir::new("gl-clear");
        let current = current_project();
        load_glossary_into(
            &current,
            &csv_file(&dir, "names.csv", "source,target\n阿福,Alfred\n"),
        )
        .unwrap();

        current.set_translation_glossary(None).unwrap();

        assert_eq!(glossary_view(&current), None);
    }
}

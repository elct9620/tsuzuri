use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::failure::Failure;

const GLOSSARY_FILE: &str = "glossary.csv";

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

    /// The Project's `glossary.csv`, or none when the directory has no such file.
    pub fn from_directory(directory: &Path) -> Result<Option<TranslationGlossary>, Failure> {
        let path = directory.join(GLOSSARY_FILE);
        match path.try_exists()? {
            true => Ok(Some(TranslationGlossary::from_csv(&path)?)),
            false => Ok(None),
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language::Language;
    use crate::project::{CurrentProject, Project};
    use crate::test_support::TempDir;

    fn project_in(dir: &TempDir) -> CurrentProject {
        let current = CurrentProject::default();
        current.replace(
            Project::open(dir.path().to_path_buf(), Language::TraditionalChinese).unwrap(),
        );
        current
    }

    fn write_glossary(dir: &TempDir, text: &str) {
        std::fs::write(dir.path().join(GLOSSARY_FILE), text).unwrap();
    }

    // @behavior TL-038
    #[test]
    fn reads_the_translation_glossary_with_the_project() {
        let dir = TempDir::new("gl-open");
        write_glossary(
            &dir,
            "\u{feff}source,target\n蝙蝠俠,Batman\n\"諾蘭\",\"Nolan, Christopher\"\n",
        );

        let current = project_in(&dir);

        assert_eq!(
            current.view().unwrap().translation_glossary().cloned(),
            Some(TranslationGlossaryView {
                file: dir.path().join(GLOSSARY_FILE),
                term_count: 2
            })
        );
    }

    #[test]
    fn reads_both_sides_of_each_term() {
        let dir = TempDir::new("gl-terms");
        write_glossary(&dir, "source,target\n\"諾蘭\",\"Nolan, Christopher\"\n");

        let glossary = TranslationGlossary::from_directory(dir.path())
            .unwrap()
            .unwrap();

        assert_eq!(
            glossary.terms(),
            [("諾蘭".to_string(), "Nolan, Christopher".to_string())]
        );
    }

    #[test]
    fn refuses_a_translation_glossary_without_its_header() {
        let dir = TempDir::new("gl-header");
        write_glossary(&dir, "蝙蝠俠,Batman\n");

        let result = TranslationGlossary::from_directory(dir.path());

        assert_eq!(result, Err(Failure::GlossaryWithoutHeader));
    }

    // @behavior TL-043
    #[test]
    fn reads_the_translation_glossary_again_before_translating() {
        let dir = TempDir::new("gl-reload");
        let current = project_in(&dir);
        write_glossary(&dir, "source,target\n阿福,Alfred\n");

        let glossary = current.reload_translation_glossary().unwrap();

        assert_eq!(
            glossary.map(|glossary| glossary.terms().to_vec()),
            Some(vec![("阿福".to_string(), "Alfred".to_string())])
        );
    }
}

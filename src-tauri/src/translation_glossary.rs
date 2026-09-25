use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::failure::Failure;
use crate::language::{Language, LanguagePair};
use crate::project::{self, CurrentProject};

const GLOSSARY_FILE: &str = "glossary.csv";

/// The user's terms, such as names and titles, with a word for each Language; a translation must
/// use the target Language's word wherever the source Language's word appears.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationGlossary {
    file: PathBuf,
    /// The Language of each column.
    languages: Vec<Language>,
    /// Each term's word in every column, empty where the file gives none.
    rows: Vec<Vec<String>>,
    has_source_target_header: bool,
}

/// What the webview shows of a Translation Glossary: the file it came from and how many terms it holds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranslationGlossaryView {
    file: PathBuf,
    term_count: usize,
}

/// A Translation Glossary laid out for editing: a column for every Language and a row per term.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GlossaryTable {
    languages: Vec<Language>,
    rows: Vec<Vec<String>>,
    /// Whether its file has a `source,target` header, which saving rewrites as Language codes.
    has_source_target_header: bool,
}

impl GlossaryTable {
    /// The table of a Project without `glossary.csv`.
    pub fn empty() -> GlossaryTable {
        GlossaryTable {
            languages: Language::ALL.to_vec(),
            rows: Vec::new(),
            has_source_target_header: false,
        }
    }
}

impl TranslationGlossary {
    /// Reads a CSV file whose header names a Language for each column, or is `source,target`,
    /// which stands for `source_target` and is refused without one.
    pub fn from_csv(
        path: &Path,
        source_target: Option<LanguagePair>,
    ) -> Result<TranslationGlossary, Failure> {
        let mut reader = csv::ReaderBuilder::new()
            .flexible(true)
            .from_reader(std::fs::File::open(path)?);
        let header: Vec<String> = reader
            .headers()
            .map_err(malformed_glossary)?
            .iter()
            .map(|name| name.trim().to_string())
            .collect();
        let has_source_target_header = header == ["source", "target"];
        let languages = if has_source_target_header {
            let pair = source_target.ok_or(Failure::GlossaryWithoutHeader)?;
            vec![pair.source, pair.target]
        } else {
            header
                .iter()
                .map(|code| Language::from_code(code).ok_or(Failure::GlossaryWithoutHeader))
                .collect::<Result<_, _>>()?
        };
        let mut rows = Vec::new();
        for record in reader.records() {
            let record = record.map_err(malformed_glossary)?;
            let row: Vec<String> = (0..languages.len())
                .map(|column| record.get(column).unwrap_or("").trim().to_string())
                .collect();
            if row.iter().any(|word| !word.is_empty()) {
                rows.push(row);
            }
        }
        Ok(TranslationGlossary {
            file: path.to_path_buf(),
            languages,
            rows,
            has_source_target_header,
        })
    }

    /// The Project's `glossary.csv`, or none when the directory has no such file.
    pub fn from_directory(
        directory: &Path,
        source_target: Option<LanguagePair>,
    ) -> Result<Option<TranslationGlossary>, Failure> {
        let path = directory.join(GLOSSARY_FILE);
        match path.try_exists()? {
            true => Ok(Some(TranslationGlossary::from_csv(&path, source_target)?)),
            false => Ok(None),
        }
    }

    /// Writes `rows`, each with a word for every Language in `Language::ALL` order, to the
    /// directory's `glossary.csv` under a header of Language codes, leaving out empty rows.
    pub fn write(directory: &Path, rows: &[Vec<String>]) -> Result<(), Failure> {
        let mut writer =
            csv::Writer::from_path(directory.join(GLOSSARY_FILE)).map_err(malformed_glossary)?;
        writer
            .write_record(Language::ALL.map(Language::code))
            .map_err(malformed_glossary)?;
        for row in rows {
            let words: Vec<&str> = (0..Language::ALL.len())
                .map(|column| row.get(column).map_or("", |word| word.trim()))
                .collect();
            if words.iter().any(|word| !word.is_empty()) {
                writer.write_record(words).map_err(malformed_glossary)?;
            }
        }
        writer.flush()?;
        Ok(())
    }

    /// The source and target word of each term that has both, for translating between `pair`.
    pub fn terms_for(&self, pair: LanguagePair) -> Vec<(String, String)> {
        let column = |language| self.languages.iter().position(|each| *each == language);
        let (Some(source), Some(target)) = (column(pair.source), column(pair.target)) else {
            return Vec::new();
        };
        self.rows
            .iter()
            .filter(|row| !row[source].is_empty() && !row[target].is_empty())
            .map(|row| (row[source].clone(), row[target].clone()))
            .collect()
    }

    pub fn view(&self) -> TranslationGlossaryView {
        TranslationGlossaryView {
            file: self.file.clone(),
            term_count: self.rows.len(),
        }
    }

    /// Its terms with a word for every Language, empty where it has no column for one.
    pub fn table(&self) -> GlossaryTable {
        let rows = self
            .rows
            .iter()
            .map(|row| {
                Language::ALL
                    .iter()
                    .map(|language| {
                        self.languages
                            .iter()
                            .position(|each| each == language)
                            .map_or_else(String::new, |column| row[column].clone())
                    })
                    .collect()
            })
            .collect();
        GlossaryTable {
            languages: Language::ALL.to_vec(),
            rows,
            has_source_target_header: self.has_source_target_header,
        }
    }
}

fn malformed_glossary(error: csv::Error) -> Failure {
    Failure::MalformedGlossary {
        detail: error.to_string(),
    }
}

#[tauri::command]
pub fn translation_glossary_table(app: AppHandle) -> Result<GlossaryTable, Failure> {
    app.state::<CurrentProject>().glossary_table()
}

#[tauri::command]
pub fn save_translation_glossary(app: AppHandle, rows: Vec<Vec<String>>) -> Result<(), Failure> {
    app.state::<CurrentProject>()
        .save_translation_glossary(&rows)?;
    project::announce(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::Project;
    use crate::project_config::ProjectConfig;
    use crate::test_support::TempDir;

    const ZH_TO_EN: LanguagePair = LanguagePair {
        source: Language::TraditionalChinese,
        target: Language::English,
    };

    fn project_in(dir: &TempDir) -> CurrentProject {
        let current = CurrentProject::default();
        current.replace(
            Project::open(dir.path().to_path_buf(), Language::TraditionalChinese).unwrap(),
        );
        current
    }

    /// A Project in `zh-TW` whose last translation was into `en`.
    fn translated_project_in(dir: &TempDir) -> CurrentProject {
        ProjectConfig {
            language: Some(Language::TraditionalChinese),
            translation_language: Some(Language::English),
        }
        .save(dir.path())
        .unwrap();
        project_in(dir)
    }

    fn write_glossary(dir: &TempDir, text: &str) {
        std::fs::write(dir.path().join(GLOSSARY_FILE), text).unwrap();
    }

    fn glossary_text(dir: &TempDir) -> String {
        std::fs::read_to_string(dir.path().join(GLOSSARY_FILE)).unwrap()
    }

    fn words(row: &[&str]) -> Vec<String> {
        row.iter().map(|word| word.to_string()).collect()
    }

    fn terms_in(dir: &TempDir, pair: LanguagePair) -> Vec<(String, String)> {
        TranslationGlossary::from_directory(dir.path(), None)
            .unwrap()
            .unwrap()
            .terms_for(pair)
    }

    // @behavior TL-038
    #[test]
    fn reads_the_translation_glossary_with_the_project() {
        let dir = TempDir::new("gl-open");
        write_glossary(
            &dir,
            "\u{feff}zh-TW,en\n蝙蝠俠,Batman\n\"諾蘭\",\"Nolan, Christopher\"\n",
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
    fn reads_a_word_holding_a_comma() {
        let dir = TempDir::new("gl-terms");
        write_glossary(&dir, "zh-TW,en\n\"諾蘭\",\"Nolan, Christopher\"\n");

        assert_eq!(
            terms_in(&dir, ZH_TO_EN),
            [("諾蘭".to_string(), "Nolan, Christopher".to_string())]
        );
    }

    #[test]
    fn refuses_a_translation_glossary_without_its_header() {
        let dir = TempDir::new("gl-header");
        write_glossary(&dir, "蝙蝠俠,Batman\n");

        let result = TranslationGlossary::from_directory(dir.path(), Some(ZH_TO_EN));

        assert_eq!(result, Err(Failure::GlossaryWithoutHeader));
    }

    // @behavior TL-043
    #[test]
    fn reads_the_translation_glossary_again_before_translating() {
        let dir = TempDir::new("gl-reload");
        let current = project_in(&dir);
        write_glossary(&dir, "zh-TW,en\n阿福,Alfred\n");

        let glossary = current.reload_translation_glossary().unwrap();

        assert_eq!(
            glossary.map(|glossary| glossary.terms_for(ZH_TO_EN)),
            Some(vec![("阿福".to_string(), "Alfred".to_string())])
        );
    }

    // @behavior TL-059
    #[test]
    fn uses_the_columns_of_the_languages_translated_between() {
        let dir = TempDir::new("gl-columns");
        write_glossary(&dir, "zh-TW,en,ja\n蝙蝠俠,Batman,バットマン\n");

        let terms = terms_in(
            &dir,
            LanguagePair {
                source: Language::TraditionalChinese,
                target: Language::Japanese,
            },
        );

        assert_eq!(terms, [("蝙蝠俠".to_string(), "バットマン".to_string())]);
    }

    // @behavior TL-060
    #[test]
    fn leaves_out_a_term_the_target_language_has_no_word_for() {
        let dir = TempDir::new("gl-no-word");
        write_glossary(&dir, "zh-TW,en,ja\n阿福,Alfred,\n");

        let terms = terms_in(
            &dir,
            LanguagePair {
                source: Language::TraditionalChinese,
                target: Language::Japanese,
            },
        );

        assert_eq!(terms, []);
    }

    // @behavior TL-061
    #[test]
    fn takes_a_source_target_header_as_the_primary_and_translation_languages() {
        let dir = TempDir::new("gl-source-target");
        write_glossary(&dir, "source,target\n蝙蝠俠,Batman\n");
        let current = translated_project_in(&dir);

        let glossary = current.reload_translation_glossary().unwrap().unwrap();

        assert_eq!(
            glossary.terms_for(ZH_TO_EN),
            [("蝙蝠俠".to_string(), "Batman".to_string())]
        );
    }

    // @behavior TL-062
    #[test]
    fn refuses_a_source_target_header_without_a_translation_language() {
        let dir = TempDir::new("gl-source-target-alone");
        write_glossary(&dir, "source,target\n蝙蝠俠,Batman\n");
        let current = project_in(&dir);

        let result = current.reload_translation_glossary();

        assert_eq!(result, Err(Failure::GlossaryWithoutHeader));
    }

    // @behavior GL-001
    #[test]
    fn lays_out_the_translation_glossary_as_a_table() {
        let dir = TempDir::new("gl-table");
        write_glossary(&dir, "zh-TW,en\n蝙蝠俠,Batman\n");
        let current = project_in(&dir);

        let table = current.glossary_table().unwrap();

        assert_eq!(
            table,
            GlossaryTable {
                languages: Language::ALL.to_vec(),
                rows: vec![words(&["蝙蝠俠", "Batman", ""])],
                has_source_target_header: false,
            }
        );
    }

    // @behavior GL-002
    #[test]
    fn creates_the_glossary_file_from_the_table() {
        let dir = TempDir::new("gl-create");
        let current = project_in(&dir);

        current
            .save_translation_glossary(&[words(&["蝙蝠俠", "Batman", ""])])
            .unwrap();

        assert_eq!(glossary_text(&dir), "zh-TW,en,ja\n蝙蝠俠,Batman,\n");
    }

    // @behavior GL-003
    #[test]
    fn writes_language_codes_over_a_source_target_header() {
        let dir = TempDir::new("gl-rewrite");
        write_glossary(&dir, "source,target\n蝙蝠俠,Batman\n");
        let current = translated_project_in(&dir);
        let table = current.glossary_table().unwrap();

        current.save_translation_glossary(&table.rows).unwrap();

        assert_eq!(glossary_text(&dir), "zh-TW,en,ja\n蝙蝠俠,Batman,\n");
    }

    // @behavior GL-004
    #[test]
    fn leaves_out_an_empty_row_when_saving() {
        let dir = TempDir::new("gl-empty-row");
        let current = project_in(&dir);

        current
            .save_translation_glossary(&[words(&["", " ", ""]), words(&["阿福", "Alfred", ""])])
            .unwrap();

        assert_eq!(glossary_text(&dir), "zh-TW,en,ja\n阿福,Alfred,\n");
    }

    // @behavior GL-005
    #[test]
    fn holds_the_saved_translation_glossary_in_the_project() {
        let dir = TempDir::new("gl-held");
        let current = project_in(&dir);

        current
            .save_translation_glossary(&[words(&["阿福", "Alfred", ""])])
            .unwrap();

        assert_eq!(
            current.view().unwrap().translation_glossary().cloned(),
            Some(TranslationGlossaryView {
                file: dir.path().join(GLOSSARY_FILE),
                term_count: 1
            })
        );
    }
}

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::language::{Language, LanguagePair};

const GLOSSARY_FILE: &str = "glossary.csv";
/// The header of the last column, which marks the terms that name a Speaker.
const TYPE_COLUMN: &str = "type";
const SPEAKER_TYPE: &str = "speaker";

/// The user's terms, such as names and titles, with a word for each Language; a translation must
/// use the target Language's word wherever the source Language's word appears.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationGlossary {
    file: PathBuf,
    /// The Language of each column.
    languages: Vec<Language>,
    /// Each term with its word in every column, empty where the file gives none, and whether it names a Speaker.
    rows: Vec<GlossaryRow>,
    has_source_target_header: bool,
}

/// What the webview shows of a Translation Glossary: the file it came from and how many terms it holds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranslationGlossaryView {
    file: PathBuf,
    term_count: usize,
}

/// One term: its word in each Language, and whether it names a Speaker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GlossaryRow {
    pub words: Vec<String>,
    pub is_speaker: bool,
}

/// A Translation Glossary laid out for editing: a column for every Language and a row per term.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GlossaryTable {
    languages: Vec<Language>,
    rows: Vec<GlossaryRow>,
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
    ) -> Result<TranslationGlossary, GlossaryError> {
        let mut reader = csv::ReaderBuilder::new()
            .flexible(true)
            .from_reader(std::fs::File::open(path)?);
        let mut header: Vec<String> = reader
            .headers()
            .map_err(malformed_glossary)?
            .iter()
            .map(|name| name.trim().to_string())
            .collect();
        let has_type_column = header.last().is_some_and(|name| name == TYPE_COLUMN);
        if has_type_column {
            header.pop();
        }
        let has_source_target_header = header == ["source", "target"];
        let languages = if has_source_target_header {
            let pair = source_target.ok_or(GlossaryError::MissingHeader)?;
            vec![pair.source, pair.target]
        } else {
            header
                .iter()
                .map(|code| Language::from_code(code).ok_or(GlossaryError::MissingHeader))
                .collect::<Result<_, _>>()?
        };
        let mut rows = Vec::new();
        for record in reader.records() {
            let record = record.map_err(malformed_glossary)?;
            let cell = |column| record.get(column).unwrap_or("").trim().to_string();
            let words: Vec<String> = (0..languages.len()).map(cell).collect();
            let is_speaker = has_type_column && cell(languages.len()) == SPEAKER_TYPE;
            if words.iter().any(|word| !word.is_empty()) {
                rows.push(GlossaryRow { words, is_speaker });
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
    ) -> Result<Option<TranslationGlossary>, GlossaryError> {
        let path = directory.join(GLOSSARY_FILE);
        match path.try_exists()? {
            true => Ok(Some(TranslationGlossary::from_csv(&path, source_target)?)),
            false => Ok(None),
        }
    }

    /// Writes `rows`, each with a word for every Language in `Language::ALL` order, to the
    /// directory's `glossary.csv` under a header of Language codes and `type`, leaving out empty rows.
    pub fn write(directory: &Path, rows: &[GlossaryRow]) -> Result<(), GlossaryError> {
        let mut writer =
            csv::Writer::from_path(directory.join(GLOSSARY_FILE)).map_err(malformed_glossary)?;
        writer
            .write_record(
                Language::ALL
                    .map(Language::code)
                    .iter()
                    .chain(&[TYPE_COLUMN]),
            )
            .map_err(malformed_glossary)?;
        for row in rows {
            let words: Vec<&str> = (0..Language::ALL.len())
                .map(|column| row.words.get(column).map_or("", |word| word.trim()))
                .collect();
            if words.iter().any(|word| !word.is_empty()) {
                let kind = if row.is_speaker { SPEAKER_TYPE } else { "" };
                writer
                    .write_record(words.iter().chain(&[kind]))
                    .map_err(malformed_glossary)?;
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
            .map(|row| &row.words)
            .filter(|words| !words[source].is_empty() && !words[target].is_empty())
            .map(|words| (words[source].clone(), words[target].clone()))
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
            .map(|row| GlossaryRow {
                words: Language::ALL
                    .iter()
                    .map(|language| {
                        self.languages
                            .iter()
                            .position(|each| each == language)
                            .map_or_else(String::new, |column| row.words[column].clone())
                    })
                    .collect(),
                is_speaker: row.is_speaker,
            })
            .collect();
        GlossaryTable {
            languages: Language::ALL.to_vec(),
            rows,
            has_source_target_header: self.has_source_target_header,
        }
    }
}

/// Why a Translation Glossary could not be read or written: a header that names no Language for
/// each column, or `source,target` with no translation Language to stand for `target`; a file
/// that is not CSV; or the file itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GlossaryError {
    MissingHeader,
    MalformedCsv { detail: String },
    Io { detail: String },
}

impl From<std::io::Error> for GlossaryError {
    fn from(error: std::io::Error) -> Self {
        GlossaryError::Io {
            detail: error.to_string(),
        }
    }
}

fn malformed_glossary(error: csv::Error) -> GlossaryError {
    GlossaryError::MalformedCsv {
        detail: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::failure::Failure;
    use crate::project::{CurrentProject, Project, ProjectConfig};
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
            ..ProjectConfig::default()
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

    fn term(words: &[&str]) -> GlossaryRow {
        GlossaryRow {
            words: words.iter().map(|word| word.to_string()).collect(),
            is_speaker: false,
        }
    }

    fn speaker(words: &[&str]) -> GlossaryRow {
        GlossaryRow {
            is_speaker: true,
            ..term(words)
        }
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

        assert_eq!(result, Err(GlossaryError::MissingHeader));
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
                rows: vec![term(&["蝙蝠俠", "Batman", ""])],
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
            .save_translation_glossary(&[term(&["蝙蝠俠", "Batman", ""])])
            .unwrap();

        assert_eq!(glossary_text(&dir), "zh-TW,en,ja,type\n蝙蝠俠,Batman,,\n");
    }

    // @behavior GL-003
    #[test]
    fn writes_language_codes_over_a_source_target_header() {
        let dir = TempDir::new("gl-rewrite");
        write_glossary(&dir, "source,target\n蝙蝠俠,Batman\n");
        let current = translated_project_in(&dir);
        let table = current.glossary_table().unwrap();

        current.save_translation_glossary(&table.rows).unwrap();

        assert_eq!(glossary_text(&dir), "zh-TW,en,ja,type\n蝙蝠俠,Batman,,\n");
    }

    // @behavior GL-004
    #[test]
    fn leaves_out_an_empty_row_when_saving() {
        let dir = TempDir::new("gl-empty-row");
        let current = project_in(&dir);

        current
            .save_translation_glossary(&[term(&["", " ", ""]), term(&["阿福", "Alfred", ""])])
            .unwrap();

        assert_eq!(glossary_text(&dir), "zh-TW,en,ja,type\n阿福,Alfred,,\n");
    }

    // @behavior GL-005
    #[test]
    fn holds_the_saved_translation_glossary_in_the_project() {
        let dir = TempDir::new("gl-held");
        let current = project_in(&dir);

        current
            .save_translation_glossary(&[term(&["阿福", "Alfred", ""])])
            .unwrap();

        assert_eq!(
            current.view().unwrap().translation_glossary().cloned(),
            Some(TranslationGlossaryView {
                file: dir.path().join(GLOSSARY_FILE),
                term_count: 1
            })
        );
    }

    // @behavior GL-011
    #[test]
    fn reads_a_speaker_from_the_type_column() {
        let dir = TempDir::new("gl-type");
        write_glossary(&dir, "zh-TW,en,type\n小明,Xiao Ming,speaker\n東京,Tokyo,\n");
        let current = project_in(&dir);

        let table = current.glossary_table().unwrap();

        assert_eq!(
            table.rows,
            [
                speaker(&["小明", "Xiao Ming", ""]),
                term(&["東京", "Tokyo", ""])
            ]
        );
    }

    // @behavior GL-012
    #[test]
    fn writes_the_type_column() {
        let dir = TempDir::new("gl-write-type");
        let current = project_in(&dir);

        current
            .save_translation_glossary(&[speaker(&["小明", "Xiao Ming", ""])])
            .unwrap();

        assert_eq!(
            glossary_text(&dir),
            "zh-TW,en,ja,type\n小明,Xiao Ming,,speaker\n"
        );
    }

    // @behavior GL-013
    #[test]
    fn reads_the_type_column_after_a_source_target_header() {
        let dir = TempDir::new("gl-source-target-type");
        write_glossary(&dir, "source,target,type\n小明,Xiao Ming,speaker\n");
        let current = translated_project_in(&dir);

        let table = current.glossary_table().unwrap();

        assert_eq!(table.rows, [speaker(&["小明", "Xiao Ming", ""])]);
    }

    // @behavior GL-014
    #[test]
    fn translates_a_speakers_name_as_a_term() {
        let dir = TempDir::new("gl-speaker-term");
        write_glossary(&dir, "zh-TW,en,type\n小明,Xiao Ming,speaker\n");

        assert_eq!(
            terms_in(&dir, ZH_TO_EN),
            [("小明".to_string(), "Xiao Ming".to_string())]
        );
    }
}

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::language::Language;

const CONFIG_FILE: &str = "tsuzuri.config.json";

/// What a Project records about itself in its directory, so it opens the same way next time.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectConfig {
    /// The Primary Language, or none to follow the Interface Language.
    pub language: Option<Language>,
    /// The Language of the last translation.
    pub translation_language: Option<Language>,
    #[serde(flatten)]
    pub options: ProjectOptions,
}

/// What the user sets for one Project in the settings beside its Primary Language.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectOptions {
    pub bilingual_order: BilingualOrder,
}

/// Which text a Bilingual SRT puts first in each cue and in its file name.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BilingualOrder {
    #[default]
    OriginalFirst,
    TranslationFirst,
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    #[test]
    fn loads_what_it_saved() {
        let dir = TempDir::new("config-round-trip");
        let config = ProjectConfig {
            language: Some(Language::Japanese),
            translation_language: Some(Language::English),
            options: ProjectOptions {
                bilingual_order: BilingualOrder::TranslationFirst,
            },
        };

        config.save(dir.path()).unwrap();

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
}

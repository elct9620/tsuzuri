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
        };

        config.save(dir.path()).unwrap();

        assert_eq!(ProjectConfig::load(dir.path()).unwrap(), config);
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

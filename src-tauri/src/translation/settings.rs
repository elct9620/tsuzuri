use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

const SETTINGS_FILE: &str = "translation.json";

/// How a translation is batched and repaired, saved across launches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct TranslationSettings {
    /// Segments per Batch.
    pub batch_size: usize,
    /// Translated lines around a request that it carries as reference.
    pub reference_lines: usize,
    /// Requests for the same lines before a failing group is split in half.
    pub retries: usize,
}

impl Default for TranslationSettings {
    fn default() -> TranslationSettings {
        TranslationSettings {
            batch_size: 8,
            reference_lines: 2,
            retries: 3,
        }
    }
}

impl TranslationSettings {
    /// Settings never saved load as the defaults.
    pub fn load(dir: &Path) -> io::Result<TranslationSettings> {
        match fs::read(dir.join(SETTINGS_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Ok(TranslationSettings::default())
            }
            Err(error) => Err(error),
        }
    }

    /// Saves the settings raised to at least one each, since none of them works at zero,
    /// and answers them as saved.
    pub fn save(self, dir: &Path) -> io::Result<TranslationSettings> {
        let saved_settings = TranslationSettings {
            batch_size: self.batch_size.max(1),
            reference_lines: self.reference_lines.max(1),
            retries: self.retries.max(1),
        };
        fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(&saved_settings).map_err(io::Error::other)?;
        fs::write(dir.join(SETTINGS_FILE), json)?;
        Ok(saved_settings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    // @behavior TL-053
    #[test]
    fn remembers_the_translation_settings() {
        let dir = TempDir::new("tl-settings");
        let settings = TranslationSettings {
            batch_size: 4,
            reference_lines: 1,
            retries: 2,
        };

        settings.save(dir.path()).unwrap();

        assert_eq!(TranslationSettings::load(dir.path()).unwrap(), settings);
    }

    // @behavior TL-054
    #[test]
    fn keeps_each_translation_setting_at_least_one() {
        let dir = TempDir::new("tl-settings-min");

        let saved_settings = TranslationSettings {
            batch_size: 0,
            reference_lines: 2,
            retries: 0,
        }
        .save(dir.path())
        .unwrap();

        assert_eq!(
            (saved_settings.batch_size, saved_settings.retries),
            (1, 1),
            "{saved_settings:?}"
        );
        assert_eq!(
            TranslationSettings::load(dir.path()).unwrap(),
            saved_settings
        );
    }
}

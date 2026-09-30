use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::json_settings;

const SETTINGS_FILE: &str = "translation.json";

/// How a translation is batched and repaired, saved across launches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct TranslationSettings {
    /// Segments per Batch.
    pub batch_size: usize,
    /// Translated lines around a request that it carries as reference.
    pub reference_lines: usize,
    /// Requests for the same lines before a failing group is split in half.
    pub retries: usize,
    /// Whether translations run on the Resident llama-server rather than one started for each.
    pub has_resident_llama: bool,
    /// Seconds the Resident llama-server keeps the Model after a translation ends.
    pub model_keep_seconds: u64,
    /// Whether the Translate panel offers a Simplified Cleanup checked for a translation into `zh-TW`.
    pub is_simplified_cleaned: bool,
}

impl Default for TranslationSettings {
    fn default() -> TranslationSettings {
        TranslationSettings {
            batch_size: 8,
            reference_lines: 2,
            retries: 3,
            has_resident_llama: true,
            model_keep_seconds: 0,
            is_simplified_cleaned: true,
        }
    }
}

impl TranslationSettings {
    /// Settings never saved load as the defaults.
    pub fn load(dir: &Path) -> io::Result<TranslationSettings> {
        json_settings::settings_at(&dir.join(SETTINGS_FILE))
    }

    /// Saves the settings raised to at least one each, since none of them works at zero,
    /// and answers them as saved.
    pub fn save(self, dir: &Path) -> io::Result<TranslationSettings> {
        let saved_settings = TranslationSettings {
            batch_size: self.batch_size.max(1),
            reference_lines: self.reference_lines.max(1),
            retries: self.retries.max(1),
            ..self
        };
        fs::create_dir_all(dir)?;
        json_settings::write(&dir.join(SETTINGS_FILE), &saved_settings)?;
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
            has_resident_llama: false,
            model_keep_seconds: 30,
            is_simplified_cleaned: false,
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
            ..TranslationSettings::default()
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

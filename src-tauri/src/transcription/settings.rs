use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::project::TranscriptionOverrides;

const SETTINGS_FILE: &str = "transcription.json";

/// How whisper-cli transcribes beyond the Language and the Model, saved across launches as the
/// default of every Project. The defaults leave whisper-cli as it behaves on its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct TranscriptionSettings {
    /// Whether VAD finds the speech first, so only that is transcribed.
    pub has_vad: bool,
    pub is_non_speech_suppressed: bool,
    /// Whether each window carries the text before it as context, which can repeat a mistake.
    pub is_context_carried: bool,
}

impl Default for TranscriptionSettings {
    fn default() -> TranscriptionSettings {
        TranscriptionSettings {
            has_vad: false,
            is_non_speech_suppressed: false,
            is_context_carried: true,
        }
    }
}

impl TranscriptionSettings {
    /// These settings with the ones a Project sets for itself in their place.
    pub fn with_overrides(self, overrides: TranscriptionOverrides) -> TranscriptionSettings {
        TranscriptionSettings {
            has_vad: overrides.has_vad.unwrap_or(self.has_vad),
            is_non_speech_suppressed: overrides
                .is_non_speech_suppressed
                .unwrap_or(self.is_non_speech_suppressed),
            is_context_carried: overrides
                .is_context_carried
                .unwrap_or(self.is_context_carried),
        }
    }

    /// Settings never saved load as the defaults.
    pub fn load(dir: &Path) -> io::Result<TranscriptionSettings> {
        match fs::read(dir.join(SETTINGS_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Ok(TranscriptionSettings::default())
            }
            Err(error) => Err(error),
        }
    }

    pub fn save(self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(&self).map_err(io::Error::other)?;
        fs::write(dir.join(SETTINGS_FILE), json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    // @behavior TX-038
    #[test]
    fn remembers_the_transcription_settings() {
        let dir = TempDir::new("tx-settings");
        let settings = TranscriptionSettings {
            has_vad: true,
            ..TranscriptionSettings::default()
        };

        settings.save(dir.path()).unwrap();

        assert_eq!(TranscriptionSettings::load(dir.path()).unwrap(), settings);
    }

    #[test]
    fn loads_the_defaults_without_a_file() {
        let dir = TempDir::new("tx-settings-missing");

        assert_eq!(
            TranscriptionSettings::load(dir.path()).unwrap(),
            TranscriptionSettings::default()
        );
    }

    #[test]
    fn follows_the_general_settings_where_the_project_sets_nothing() {
        let general = TranscriptionSettings {
            is_non_speech_suppressed: true,
            ..TranscriptionSettings::default()
        };

        let settings = general.with_overrides(TranscriptionOverrides {
            has_vad: Some(true),
            is_context_carried: Some(false),
            ..TranscriptionOverrides::default()
        });

        assert_eq!(
            settings,
            TranscriptionSettings {
                has_vad: true,
                is_non_speech_suppressed: true,
                is_context_carried: false,
            }
        );
    }
}

//! How Tsuzuri behaves as it is worked in, saved across launches and the same in every Project.

use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::json_settings;

pub mod commands;

const PREFERENCES_FILE: &str = "preferences.json";

/// What playing media does as another Segment is chosen from one Choice Source: whether it
/// pauses, and whether it moves to the Segment's start or stays where it is, which for a region is
/// where it was clicked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct ChoiceLanding {
    pub is_pausing: bool,
    pub is_from_start: bool,
}

impl ChoiceLanding {
    const PAUSE_AT_START: ChoiceLanding = ChoiceLanding {
        is_pausing: true,
        is_from_start: true,
    };
    const NO_PAUSE: ChoiceLanding = ChoiceLanding {
        is_pausing: false,
        is_from_start: false,
    };
}

/// The Choice Landing of each Choice Source.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct ChoiceLandings {
    /// A Segment's text or translation.
    pub text: ChoiceLanding,
    /// A time of a Segment.
    pub time: ChoiceLanding,
    pub speaker: ChoiceLanding,
    /// Anywhere else in a Segment's row, or the keyboard's focus reaching it.
    pub row: ChoiceLanding,
    /// Enter moving on from the field before.
    pub next: ChoiceLanding,
    pub region: ChoiceLanding,
    pub search: ChoiceLanding,
}

impl Default for ChoiceLandings {
    fn default() -> ChoiceLandings {
        DEFAULT_PREFERENCES.choice_landings
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct Preferences {
    pub choice_landings: ChoiceLandings,
    /// The locale the webview writes its text in, or `None` to follow the system's language.
    /// Rust keeps it as given, since only the webview knows the languages it can write.
    pub interface_language: Option<String>,
}

/// The Preferences until any are saved, which the webview follows until it has read the saved
/// ones. They keep the landings Tsuzuri always had: what the user means to correct pauses at its
/// start, and what is named or moved on to while listening plays on.
pub const DEFAULT_PREFERENCES: Preferences = Preferences {
    choice_landings: ChoiceLandings {
        text: ChoiceLanding::PAUSE_AT_START,
        time: ChoiceLanding::PAUSE_AT_START,
        speaker: ChoiceLanding::NO_PAUSE,
        row: ChoiceLanding::PAUSE_AT_START,
        next: ChoiceLanding::NO_PAUSE,
        region: ChoiceLanding::NO_PAUSE,
        search: ChoiceLanding::PAUSE_AT_START,
    },
    interface_language: None,
};

impl Default for Preferences {
    fn default() -> Preferences {
        DEFAULT_PREFERENCES
    }
}

impl Preferences {
    /// Preferences never saved load as the defaults.
    pub fn load(dir: &Path) -> io::Result<Preferences> {
        json_settings::settings_at(&dir.join(PREFERENCES_FILE))
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        json_settings::save(dir, PREFERENCES_FILE, self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    // @behavior PF-001
    #[test]
    fn remembers_the_preferences() {
        let dir = TempDir::new("pf-preferences");
        let preferences = Preferences {
            choice_landings: ChoiceLandings {
                text: ChoiceLanding::NO_PAUSE,
                ..ChoiceLandings::default()
            },
            ..Preferences::default()
        };

        preferences.save(dir.path()).unwrap();

        assert_eq!(Preferences::load(dir.path()).unwrap(), preferences);
    }

    // @behavior PF-002
    #[test]
    fn keeps_the_choice_landings_tsuzuri_always_had() {
        let dir = TempDir::new("pf-preferences-missing");

        let landings = Preferences::load(dir.path()).unwrap().choice_landings;

        assert_eq!(
            [
                landings.text,
                landings.time,
                landings.row,
                landings.search,
                landings.speaker,
                landings.next,
                landings.region,
            ],
            [
                ChoiceLanding::PAUSE_AT_START,
                ChoiceLanding::PAUSE_AT_START,
                ChoiceLanding::PAUSE_AT_START,
                ChoiceLanding::PAUSE_AT_START,
                ChoiceLanding::NO_PAUSE,
                ChoiceLanding::NO_PAUSE,
                ChoiceLanding::NO_PAUSE,
            ]
        );
    }

    // @behavior PF-009
    #[test]
    fn follows_the_system_language_until_one_is_chosen() {
        let dir = TempDir::new("pf-preferences-no-language");

        let preferences = Preferences::load(dir.path()).unwrap();

        assert_eq!(preferences.interface_language, None);
    }
}

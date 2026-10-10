pub mod commands;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::json_settings;

const SETTINGS_FILE: &str = "logs.json";

/// Where the log is written, none for the OS log directory of the app, and whether it holds the
/// Debug Log; saved across launches.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct LogSettings {
    pub directory: Option<PathBuf>,
    pub has_debug_log: bool,
}

impl LogSettings {
    /// Settings never saved load as the defaults.
    pub fn load(dir: &Path) -> io::Result<LogSettings> {
        json_settings::settings_at(&dir.join(SETTINGS_FILE))
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        json_settings::save(dir, SETTINGS_FILE, self)
    }

    /// Saves `directory` as the one to write the log to from the next launch, keeping the rest.
    pub fn record_directory(dir: &Path, directory: PathBuf) -> io::Result<()> {
        LogSettings {
            directory: Some(directory),
            ..LogSettings::load(dir)?
        }
        .save(dir)
    }

    /// Saves whether the Debug Log is written from the next launch, keeping the rest.
    pub fn record_debug_log(dir: &Path, has_debug_log: bool) -> io::Result<()> {
        LogSettings {
            has_debug_log,
            ..LogSettings::load(dir)?
        }
        .save(dir)
    }

    /// The level Tsuzuri's own lines are written from: debug with the Debug Log, info otherwise.
    pub fn tsuzuri_level(&self) -> log::LevelFilter {
        if self.has_debug_log {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        }
    }

    /// The directory to write the log to: the one chosen while it can be made, or `os_log_dir`,
    /// so a chosen directory on a drive gone never keeps the app from starting.
    pub fn log_dir(&self, os_log_dir: PathBuf) -> PathBuf {
        match &self.directory {
            Some(directory) if fs::create_dir_all(directory).is_ok() => directory.clone(),
            _ => os_log_dir,
        }
    }
}

/// The directory the log is written to in this launch, and the one chosen for the next.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct LogDirectory {
    pub in_use: PathBuf,
    pub next_launch: PathBuf,
}

/// The directory this launch writes the log to, as the app started with it.
pub struct LogDirInUse(pub PathBuf);

/// Whether the Debug Log is written in this launch, and whether it is chosen for the next.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct DebugLog {
    pub is_written_now: bool,
    pub is_written_next_launch: bool,
}

/// Whether this launch writes the Debug Log, as the app started with it.
pub struct DebugLogInUse(pub bool);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    // @behavior OB-004
    #[test]
    fn writes_the_log_to_the_os_log_directory_until_another_is_chosen() {
        let settings = LogSettings::default();

        assert_eq!(
            settings.log_dir(PathBuf::from("/os/logs")),
            PathBuf::from("/os/logs")
        );
    }

    // @behavior OB-005
    #[test]
    fn writes_the_log_to_the_chosen_directory() {
        let dir = TempDir::new("ob-log-chosen");
        let chosen_dir = dir.path().join("logs");
        let settings = LogSettings {
            directory: Some(chosen_dir.clone()),
            ..LogSettings::default()
        };

        assert_eq!(settings.log_dir(PathBuf::from("/os/logs")), chosen_dir);
    }

    // @behavior OB-009
    #[test]
    fn falls_back_to_the_os_log_directory_when_the_chosen_one_cannot_be_made() {
        let dir = TempDir::new("ob-log-gone");
        let file = dir.path().join("not-a-directory");
        fs::write(&file, "").unwrap();
        let settings = LogSettings {
            directory: Some(file.join("logs")),
            ..LogSettings::default()
        };

        assert_eq!(
            settings.log_dir(PathBuf::from("/os/logs")),
            PathBuf::from("/os/logs")
        );
    }

    // @behavior OB-006
    #[test]
    fn remembers_the_chosen_log_directory_across_launches() {
        let dir = TempDir::new("ob-log-settings");
        LogSettings::record_directory(dir.path(), PathBuf::from("/logs")).unwrap();

        assert_eq!(
            LogSettings::load(dir.path()).unwrap().directory,
            Some(PathBuf::from("/logs"))
        );
    }

    // @behavior OB-016
    #[test]
    fn leaves_the_debug_log_out_until_it_is_turned_on() {
        assert_eq!(
            LogSettings::default().tsuzuri_level(),
            log::LevelFilter::Info
        );
    }

    // @behavior OB-017
    #[test]
    fn writes_the_debug_log_once_it_is_turned_on() {
        let settings = LogSettings {
            has_debug_log: true,
            ..LogSettings::default()
        };

        assert_eq!(settings.tsuzuri_level(), log::LevelFilter::Debug);
    }

    // @behavior OB-018
    #[test]
    fn remembers_the_debug_log_across_launches() {
        let dir = TempDir::new("ob-debug-log");
        LogSettings::record_debug_log(dir.path(), true).unwrap();

        assert!(LogSettings::load(dir.path()).unwrap().has_debug_log);
    }

    // @behavior OB-019
    #[test]
    fn keeps_the_debug_log_when_the_log_directory_is_chosen() {
        let dir = TempDir::new("ob-debug-log-kept");
        LogSettings::record_debug_log(dir.path(), true).unwrap();

        LogSettings::record_directory(dir.path(), PathBuf::from("/logs")).unwrap();

        assert_eq!(
            LogSettings::load(dir.path()).unwrap(),
            LogSettings {
                directory: Some(PathBuf::from("/logs")),
                has_debug_log: true,
            }
        );
    }
}

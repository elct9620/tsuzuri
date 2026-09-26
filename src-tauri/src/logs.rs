pub mod commands;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const SETTINGS_FILE: &str = "logs.json";

/// Where the log is written, saved across launches; none for the OS log directory of the app.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct LogSettings {
    pub directory: Option<PathBuf>,
}

impl LogSettings {
    /// Settings never saved load as the defaults.
    pub fn load(dir: &Path) -> io::Result<LogSettings> {
        match fs::read(dir.join(SETTINGS_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(LogSettings::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        fs::write(dir.join(SETTINGS_FILE), json)
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LogDirectory {
    pub in_use: PathBuf,
    pub chosen: PathBuf,
}

/// The directory this launch writes the log to, as the app started with it.
pub struct LogDirInUse(pub PathBuf);

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
        LogSettings {
            directory: Some(PathBuf::from("/logs")),
        }
        .save(dir.path())
        .unwrap();

        assert_eq!(
            LogSettings::load(dir.path()).unwrap().directory,
            Some(PathBuf::from("/logs"))
        );
    }
}

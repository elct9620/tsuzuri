use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::Project;
use crate::failure::Failure;
use crate::json_settings;

const SETTINGS_FILE: &str = "recent_projects.json";
const RECENT_PROJECT_LIMIT: usize = 10;

/// A directory opened as a Project before, with the milliseconds since the Unix epoch it was
/// last opened at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecentProject {
    pub directory: PathBuf,
    pub opened_at_ms: u64,
}

/// The Recent Projects, the latest opened first; saved across launches.
#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct RecentProjects {
    projects: Vec<RecentProject>,
}

impl RecentProjects {
    /// Recent Projects never saved load as none.
    pub fn load(dir: &Path) -> io::Result<RecentProjects> {
        json_settings::settings_at(&dir.join(SETTINGS_FILE))
    }

    fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        json_settings::write(&dir.join(SETTINGS_FILE), self)
    }

    /// Saves `directory` as the latest Recent Project, opened `at`, in place of its earlier
    /// entry, dropping the oldest past the limit.
    fn record(dir: &Path, directory: &Path, at: SystemTime) -> io::Result<()> {
        let mut recent = RecentProjects::load(dir)?;
        recent
            .projects
            .retain(|project| project.directory != directory);
        recent.projects.insert(
            0,
            RecentProject {
                directory: directory.to_path_buf(),
                opened_at_ms: at
                    .duration_since(UNIX_EPOCH)
                    .map_or(0, |since| since.as_millis() as u64),
            },
        );
        recent.projects.truncate(RECENT_PROJECT_LIMIT);
        recent.save(dir)
    }

    /// Keeps the directory of `opened_project` as the latest Recent Project, or drops one that
    /// is gone. Other failures keep it, so a directory unreadable for now opens again later; the
    /// Recent Projects not being written is only logged, since opening is what was asked for.
    pub fn follow_opening(dir: &Path, opened_project: &Result<Project, Failure>, at: SystemTime) {
        let outcome = match opened_project {
            Ok(project) => RecentProjects::record(dir, &project.directory, at),
            Err(Failure::DirectoryNotFound { directory }) => RecentProjects::forget(dir, directory),
            Err(_) => Ok(()),
        };
        if let Err(error) = outcome {
            log::warn!("could not write the Recent Projects: {error}");
        }
    }

    /// Drops `directory` from the saved Recent Projects.
    fn forget(dir: &Path, directory: &Path) -> io::Result<()> {
        let mut recent = RecentProjects::load(dir)?;
        recent
            .projects
            .retain(|project| project.directory != directory);
        recent.save(dir)
    }

    /// The Recent Projects, leaving out the directory of the open Project when there is one.
    pub fn projects_without(self, open: Option<&Path>) -> Vec<RecentProject> {
        self.projects
            .into_iter()
            .filter(|project| Some(project.directory.as_path()) != open)
            .collect()
    }
}

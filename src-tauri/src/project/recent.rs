use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::{project_name, Project, ProjectConfig};
use crate::failure::Failure;
use crate::json_settings;

const SETTINGS_FILE: &str = "recent_projects.json";
const RECENT_PROJECT_LIMIT: usize = 10;
/// How long listing the Recent Projects waits for their Project Configs: a disk that does not
/// answer would otherwise hold up the start screen and the Open menu.
const NAME_TIMEOUT: Duration = Duration::from_millis(300);

/// A directory opened as a Project before, with the milliseconds since the Unix epoch it was
/// last opened at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecentProject {
    pub directory: PathBuf,
    pub opened_at_ms: u64,
}

/// A Recent Project as the start screen and the Open menu list it, by its Project Name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RecentProjectView {
    pub directory: PathBuf,
    pub name: String,
    pub opened_at_ms: u64,
}

/// `projects` by their Project Names, each read from its Project Config at once; one not read
/// in time is named after its directory.
pub fn project_views(projects: Vec<RecentProject>) -> Vec<RecentProjectView> {
    project_views_within(projects, NAME_TIMEOUT, |directory| {
        ProjectConfig::load(directory).ok()?.options.name
    })
}

/// `projects` by the Project Name `read_name` finds for each directory, reading all of them at
/// once and waiting for them no longer than `timeout`, since a read may never return.
fn project_views_within(
    projects: Vec<RecentProject>,
    timeout: Duration,
    read_name: impl Fn(&Path) -> Option<String> + Clone + Send + 'static,
) -> Vec<RecentProjectView> {
    let (sender, receiver) = mpsc::channel();
    for (index, project) in projects.iter().enumerate() {
        let (sender, read_name) = (sender.clone(), read_name.clone());
        let directory = project.directory.clone();
        thread::spawn(move || {
            let _ = sender.send((index, read_name(&directory)));
        });
    }
    drop(sender);
    let mut names = vec![None; projects.len()];
    let deadline = Instant::now() + timeout;
    while let Some(time_left) = deadline.checked_duration_since(Instant::now()) {
        match receiver.recv_timeout(time_left) {
            Ok((index, name)) => names[index] = name,
            Err(_) => break,
        }
    }
    projects
        .into_iter()
        .zip(names)
        .map(|(project, name)| RecentProjectView {
            name: project_name(name.as_deref(), &project.directory),
            directory: project.directory,
            opened_at_ms: project.opened_at_ms,
        })
        .collect()
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::ProjectOptions;
    use crate::test_support::TempDir;

    fn recent_project(directory: PathBuf) -> RecentProject {
        RecentProject {
            directory,
            opened_at_ms: 1_790_303_400_000,
        }
    }

    fn names(views: &[RecentProjectView]) -> Vec<&str> {
        views.iter().map(|view| view.name.as_str()).collect()
    }

    // @behavior PJ-177
    #[test]
    fn lists_a_recent_project_by_its_project_name() {
        let dir = TempDir::new("pj-recent-name");
        let lecture = dir.path().join("lecture");
        fs::create_dir_all(&lecture).unwrap();
        ProjectConfig {
            options: ProjectOptions {
                name: Some("週會錄影".to_string()),
                ..Default::default()
            },
            ..Default::default()
        }
        .save(&lecture)
        .unwrap();

        let views = project_views(vec![recent_project(lecture)]);

        assert_eq!(names(&views), vec!["週會錄影"]);
    }

    // @behavior PJ-178
    #[test]
    fn names_a_recent_project_after_its_directory_when_its_config_does_not_answer() {
        let projects = vec![
            recent_project(PathBuf::from("/videos/lecture")),
            recent_project(PathBuf::from("/videos/interview")),
        ];
        let start = Instant::now();

        let views = project_views_within(projects, Duration::from_millis(50), |directory| {
            if directory.ends_with("lecture") {
                thread::sleep(Duration::from_secs(5));
            }
            Some("訪談".to_string())
        });

        assert_eq!(
            (names(&views), start.elapsed() < Duration::from_secs(1)),
            (vec!["lecture", "訪談"], true)
        );
    }
}

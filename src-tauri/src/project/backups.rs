use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// How a write keeps the subtitle it replaces as an Overwrite Backup.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackupPolicy {
    /// Every time it is written over, as the Project Options may ask of a Mode.
    EveryWrite,
    /// Once, before Tsuzuri first changes it since the Project was opened, so what the Undo
    /// History held can still be taken back once the Project is closed.
    FirstChange,
}

/// The subtitles a Backup was kept of since the Project was opened.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Backups(HashSet<PathBuf>);

impl Backups {
    /// Notes `subtitle` as kept, answering whether it was not kept before.
    pub fn note(&mut self, subtitle: &Path) -> bool {
        self.0.insert(subtitle.to_path_buf())
    }

    /// Takes `subtitle` as not kept, so the next change to it keeps it first.
    pub fn forget(&mut self, subtitle: &Path) {
        self.0.remove(subtitle);
    }
}

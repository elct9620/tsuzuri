use std::collections::HashSet;
use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use super::{files, BackupKind};

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
    /// Keeps `subtitle` in `directory` as a Backup of `kind` taken now.
    pub fn keep(&mut self, directory: &Path, subtitle: &Path, kind: BackupKind) -> io::Result<()> {
        files::back_up(directory, subtitle, SystemTime::now(), kind)?;
        self.0.insert(subtitle.to_path_buf());
        Ok(())
    }

    /// Keeps `subtitle` in `directory` before it is written over, as `policy` asks.
    pub fn keep_before_write(
        &mut self,
        directory: &Path,
        subtitle: &Path,
        policy: BackupPolicy,
    ) -> io::Result<()> {
        match policy {
            BackupPolicy::EveryWrite => self.keep(directory, subtitle, BackupKind::Overwrite),
            BackupPolicy::FirstChange if self.0.insert(subtitle.to_path_buf()) => files::back_up(
                directory,
                subtitle,
                SystemTime::now(),
                BackupKind::Overwrite,
            ),
            BackupPolicy::FirstChange => Ok(()),
        }
    }

    /// Takes `subtitle` as not kept, so the next change to it keeps it first.
    pub fn forget(&mut self, subtitle: &Path) {
        self.0.remove(subtitle);
    }
}

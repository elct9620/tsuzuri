use std::collections::VecDeque;
use std::path::PathBuf;

/// How many changes an Undo History keeps for one Resource.
const DEPTH: usize = 100;

/// The subtitle files of one Resource at one moment, each by its path with what it held.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SubtitleFiles(pub Vec<(PathBuf, String)>);

/// The changes of one Resource that can be undone, oldest first, and those undone that can be
/// made again, latest undone last.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UndoHistory {
    undo_files: VecDeque<SubtitleFiles>,
    redo_files: Vec<SubtitleFiles>,
}

impl UndoHistory {
    /// Keeps `before` as what the change just made undoes to, and leaves nothing to redo.
    pub fn record(&mut self, before: SubtitleFiles) {
        self.undo_files.push_back(before);
        if self.undo_files.len() > DEPTH {
            self.undo_files.pop_front();
        }
        self.redo_files.clear();
    }

    /// Takes back the latest change, keeping `now` to redo it: the subtitles to put back.
    pub fn undo(&mut self, now: SubtitleFiles) -> Option<SubtitleFiles> {
        let before = self.undo_files.pop_back()?;
        self.redo_files.push(now);
        Some(before)
    }

    /// Makes the latest undone change again, keeping `now` to undo it: the subtitles to put back.
    pub fn redo(&mut self, now: SubtitleFiles) -> Option<SubtitleFiles> {
        let after = self.redo_files.pop()?;
        self.undo_files.push_back(now);
        Some(after)
    }

    pub fn has_undo(&self) -> bool {
        !self.undo_files.is_empty()
    }

    pub fn has_redo(&self) -> bool {
        !self.redo_files.is_empty()
    }
}

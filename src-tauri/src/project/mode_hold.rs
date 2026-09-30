use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::{Project, SegmentField, SegmentSpan};
use crate::language::Language;
use crate::transcript::Segment;

/// A Mode running on one Resource, and so which of its subtitles nothing else may change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "mode", rename_all = "kebab-case")]
pub enum RunningMode {
    /// Holds every subtitle of the Resource.
    Transcription,
    /// Holds only the translation into `language`, or only its Segments at `indexes` while they
    /// are translated again.
    Translation {
        language: Language,
        indexes: Option<Vec<usize>>,
    },
}

/// The Resource a Mode runs on, by the directory it is in and its name, what the Mode holds of
/// it, the Batch it is translating, if any, and what it has made so far to show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ModeHold {
    pub(super) directory: PathBuf,
    pub(super) name: String,
    pub(super) mode: RunningMode,
    pub(super) pending_batch: Option<SegmentSpan>,
    pub(super) progress: Option<ModeProgress>,
}

/// What a running Mode has made so far, shown in place of what the files hold and never written
/// as a subtitle: the Mode writes its own result once done, and what it shows ends with it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum ModeProgress {
    /// The Segments transcribed so far, in place of the whole Transcript.
    Transcript(Vec<Segment>),
    /// The translation of each Segment at its position, in place of the translation shown.
    Translations(BTreeMap<usize, Option<String>>),
}

impl ModeHold {
    /// A hold on the Resource `name` in `directory` for `mode`, before it has made anything.
    pub(super) fn new(directory: &Path, name: &str, mode: RunningMode) -> ModeHold {
        ModeHold {
            directory: directory.to_path_buf(),
            name: name.to_string(),
            mode,
            pending_batch: None,
            progress: None,
        }
    }

    /// Whether the Mode holds what a change to `project` makes: it runs on the Current Resource
    /// and a transcription holds every change, a translation what `is_written` says it writes,
    /// given the translation shown, the Language the Mode writes and the Segments it holds.
    pub(super) fn is_holding(
        &self,
        project: &Project,
        is_written: impl Fn(Option<Language>, Language, Option<&[usize]>) -> bool,
    ) -> bool {
        if !self.is_on_current(project) {
            return false;
        }
        match &self.mode {
            RunningMode::Transcription => true,
            RunningMode::Translation { language, indexes } => {
                let translation = project
                    .current
                    .as_ref()
                    .and_then(|current| current.translation);
                is_written(
                    self.shown_translation(translation),
                    *language,
                    indexes.as_deref(),
                )
            }
        }
    }

    /// The Segments shown, given `segments` as the files hold them: what the Mode has made so far
    /// stands in their place.
    pub(super) fn shown_segments(&self, segments: &[Segment]) -> Vec<Segment> {
        match &self.progress {
            Some(ModeProgress::Transcript(progress_segments)) => progress_segments.clone(),
            Some(ModeProgress::Translations(translations)) => {
                let mut segments = segments.to_vec();
                for (index, translation) in translations {
                    if let Some(segment) = segments.get_mut(*index) {
                        segment.translation = translation.clone();
                    }
                }
                segments
            }
            None => segments.to_vec(),
        }
    }

    /// The translation shown, given `translation` as the Current Resource shows it: none while a
    /// transcription shows its progress, the one written while a translation does.
    pub(super) fn shown_translation(&self, translation: Option<Language>) -> Option<Language> {
        match (&self.progress, &self.mode) {
            (Some(ModeProgress::Transcript(_)), _) => None,
            (Some(ModeProgress::Translations(_)), RunningMode::Translation { language, .. }) => {
                Some(*language)
            }
            _ => translation,
        }
    }

    /// Whether the Mode runs on the Current Resource of `project`.
    pub(super) fn is_on_current(&self, project: &Project) -> bool {
        self.directory == project.directory
            && project
                .current
                .as_ref()
                .is_some_and(|current| current.name == self.name)
    }
}

/// Whether a running Mode writes what a change changes, which it does for every change that
/// reaches the whole Current Resource.
pub(super) fn is_always_written(_: Option<Language>, _: Language, _: Option<&[usize]>) -> bool {
    true
}

/// Whether an edit of `field` writes what a translation Mode holds, given the translation shown,
/// the Language the Mode writes and the Segments it holds, if only some: a text never, a Speaker
/// always, and a translation when it is the one written, of a held Segment at `index`, or of any
/// held Segment when `index` is none.
pub(super) fn is_written_by_edit(
    field: SegmentField,
    index: Option<usize>,
    translation_shown: Option<Language>,
    mode_language: Language,
    held_indexes: Option<&[usize]>,
) -> bool {
    match field {
        SegmentField::Text => false,
        SegmentField::Translation => {
            translation_shown == Some(mode_language)
                && held_indexes.is_none_or(|held_indexes| {
                    index.is_none_or(|index| held_indexes.contains(&index))
                })
        }
        SegmentField::Speaker => true,
    }
}

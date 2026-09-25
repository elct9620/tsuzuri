use std::path::PathBuf;

use serde::Serialize;

use crate::project::glossary::GlossaryError;
use crate::project::ProjectError;
use crate::segment_change::SegmentChangeError;
use crate::toolchain::{ModelError, ModelSlot};
use crate::transcript::SrtError;

/// Why a command did not finish. The webview words each code in the interface language,
/// so a variant carries data rather than prose; `detail` is text a system or Component wrote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum Failure {
    /// Reading or writing a file failed.
    Io {
        detail: String,
    },
    MalformedSrt {
        cue: usize,
    },
    /// A Translation Glossary file whose header does not name a Language for each column, or is
    /// `source,target` while the Project has no translation Language to stand for `target`.
    GlossaryWithoutHeader,
    MalformedGlossary {
        detail: String,
    },
    ModelNotChosen {
        slot: ModelSlot,
    },
    ModelMissing {
        path: PathBuf,
    },
    /// Translating, editing or saving asked for before a Project was opened.
    NoProject,
    /// The Project has no Resource by the name asked for, or none is current.
    NoResource,
    /// Transcribing a Current Resource that has no media file.
    NoMedia,
    /// An edit refused because a subtitle of the Current Resource was changed elsewhere since
    /// Tsuzuri last read or wrote it; the Current Resource was read again instead.
    ChangedElsewhere,
    /// A change refused because a Mode running on the Current Resource writes the subtitle it
    /// would change.
    ModeRunning,
    /// A Segment Change that would leave a Segment ending before it starts.
    InvalidTimes,
    /// A restore that named no Backup of the subtitle it was asked for.
    NoBackup {
        backup: String,
    },
    /// Taking back a Comparison Row the comparison no longer has, as after the subtitle changed.
    NoRow {
        row: usize,
    },
    /// Transcribing over an original subtitle the user did not ask to overwrite.
    SubtitleExists {
        path: PathBuf,
    },
    ComponentNotReady {
        component: String,
    },
    /// A Step's process could not start or exited without success.
    StepFailed {
        step: String,
        detail: String,
    },
    LlamaExited,
    LlamaTimedOut,
    /// llama-server answered a request with an error, or without a translation.
    LlamaRequest {
        detail: String,
    },
    /// Something that should not happen, such as a background task panicking.
    Internal {
        detail: String,
    },
}

impl From<std::io::Error> for Failure {
    fn from(error: std::io::Error) -> Self {
        Failure::Io {
            detail: error.to_string(),
        }
    }
}

impl From<SrtError> for Failure {
    fn from(error: SrtError) -> Self {
        Failure::MalformedSrt { cue: error.cue }
    }
}

impl From<ProjectError> for Failure {
    fn from(error: ProjectError) -> Self {
        match error {
            ProjectError::NoResource => Failure::NoResource,
        }
    }
}

impl From<GlossaryError> for Failure {
    fn from(error: GlossaryError) -> Self {
        match error {
            GlossaryError::MissingHeader => Failure::GlossaryWithoutHeader,
            GlossaryError::MalformedCsv { detail } => Failure::MalformedGlossary { detail },
            GlossaryError::Io { detail } => Failure::Io { detail },
        }
    }
}

impl From<SegmentChangeError> for Failure {
    fn from(error: SegmentChangeError) -> Self {
        match error {
            SegmentChangeError::InvalidTimes => Failure::InvalidTimes,
            SegmentChangeError::InvalidPosition { detail } => Failure::Internal { detail },
        }
    }
}

impl From<ModelError> for Failure {
    fn from(error: ModelError) -> Self {
        match error {
            ModelError::NoChoice(slot) => Failure::ModelNotChosen { slot },
            ModelError::MissingFile(path) => Failure::ModelMissing { path },
        }
    }
}

impl From<tokio::task::JoinError> for Failure {
    fn from(error: tokio::task::JoinError) -> Self {
        Failure::Internal {
            detail: error.to_string(),
        }
    }
}

impl From<tauri::Error> for Failure {
    fn from(error: tauri::Error) -> Self {
        Failure::Internal {
            detail: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_its_code_beside_the_data_it_carries() {
        let json = serde_json::to_value(Failure::MalformedSrt { cue: 2 }).unwrap();

        assert_eq!(json, serde_json::json!({"code": "malformed-srt", "cue": 2}));
    }
}

use std::path::PathBuf;

use serde::Serialize;

use crate::models::{ModelError, ModelSlot};
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
    /// A Translation Glossary file whose header is not `source,target`.
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

impl From<ModelError> for Failure {
    fn from(error: ModelError) -> Self {
        match error {
            ModelError::NotChosen(slot) => Failure::ModelNotChosen { slot },
            ModelError::Missing(path) => Failure::ModelMissing { path },
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

impl From<reqwest::Error> for Failure {
    fn from(error: reqwest::Error) -> Self {
        Failure::LlamaRequest {
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

//! Speaker Diarization: who is heard when in a media file, given to the Segments of its Transcript.

pub mod features;
pub mod sortformer;
pub mod streaming;
pub mod turns;

use std::fmt;

#[derive(Debug, PartialEq, Eq)]
pub enum DiarizationError {
    /// The file is a GGUF of another model, named by its architecture and version.
    UnsupportedModel {
        architecture: String,
    },
    Engine(String),
}

impl fmt::Display for DiarizationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DiarizationError::UnsupportedModel { architecture } => write!(
                f,
                "not a Nemotron-3 Diarization model: its architecture is {architecture:?}"
            ),
            DiarizationError::Engine(detail) => write!(f, "{detail}"),
        }
    }
}

impl std::error::Error for DiarizationError {}

impl From<candle_core::Error> for DiarizationError {
    fn from(error: candle_core::Error) -> Self {
        DiarizationError::Engine(error.to_string())
    }
}

impl From<std::io::Error> for DiarizationError {
    fn from(error: std::io::Error) -> Self {
        DiarizationError::Engine(error.to_string())
    }
}

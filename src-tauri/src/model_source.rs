use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Where a Model Slot's Model comes from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ModelSource {
    File {
        path: PathBuf,
    },
    /// A Hugging Face Repository's `file` downloaded at `commit`, kept in the Hugging Face Cache.
    Repository {
        repo: String,
        file: String,
        commit: String,
    },
}

impl ModelSource {
    /// Where the Model is expected, whether or not it is there.
    pub fn path(&self, hub_cache: &Path) -> PathBuf {
        match self {
            ModelSource::File { path } => path.clone(),
            ModelSource::Repository { repo, file, commit } => hub_cache
                .join(format!("models--{}", repo.replace('/', "--")))
                .join("snapshots")
                .join(commit)
                .join(file),
        }
    }
}

/// A slot as saved, which before Model Sources were kept was a bare path.
#[derive(Deserialize)]
#[serde(untagged)]
enum SavedSource {
    Path(PathBuf),
    Source(ModelSource),
}

/// Reads a slot saved as a Model Source, or as the bare path kept before Model Sources were.
pub fn parse_saved_source<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<ModelSource>, D::Error> {
    Ok(
        Option::<SavedSource>::deserialize(deserializer)?.map(|saved| match saved {
            SavedSource::Path(path) => ModelSource::File { path },
            SavedSource::Source(source) => source,
        }),
    )
}

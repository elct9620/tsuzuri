use std::fmt;

use serde::{Deserialize, Serialize};

use crate::language::Language;

/// The script API a Script is written for, declared by `# tsuzuri-api: <major>.<minor>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub struct ApiVersion {
    pub major: u32,
    pub minor: u32,
}

/// What a Script offers in Tsuzuri's menus, by the id it registers and the label menus show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Registration {
    Macro {
        id: String,
        label: String,
    },
    ExportFormat {
        id: String,
        label: String,
        /// The extension of the file it is saved to, without the dot.
        extension: String,
    },
}

/// Why a Script does not load or run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ScriptFailure {
    /// A `tsuzuri-api` declaration that is not two numbers.
    UnreadableApiVersion { declaration: String },
    /// A Script written for a script API this app does not offer.
    UnsupportedApiVersion { declared: ApiVersion },
    /// Loading the Script to read what it registers took longer than a scan allows.
    TimedOut,
    /// The Script did not parse, raised, or returned what its kind does not allow.
    Raised { message: String },
    /// A returned Segment, counted from 1, ends before it starts.
    InvalidTimes { number: usize },
    /// A returned Segment, counted from 1, starts before the one before it.
    UnorderedTimes { number: usize },
    /// A returned text in a Language the Resource has no subtitle in.
    UnheldLanguage { language: Language },
}

const API_DECLARATION: &str = "tsuzuri-api:";

impl ApiVersion {
    /// The script API this app offers.
    pub const CURRENT: ApiVersion = ApiVersion { major: 1, minor: 0 };

    /// The version `source` declares among the comments and blank lines it opens with, the current
    /// one when it declares none.
    pub fn declared_in(source: &str) -> Result<ApiVersion, ScriptFailure> {
        let declaration = source
            .lines()
            .map(str::trim)
            .take_while(|line| line.is_empty() || line.starts_with('#'))
            .find_map(|line| {
                let comment = line.trim_start_matches('#').trim_start();
                comment.strip_prefix(API_DECLARATION).map(str::trim)
            });
        let Some(declaration) = declaration else {
            return Ok(ApiVersion::CURRENT);
        };
        declaration
            .split_once('.')
            .and_then(|(major, minor)| {
                Some(ApiVersion {
                    major: major.parse().ok()?,
                    minor: minor.parse().ok()?,
                })
            })
            .ok_or_else(|| ScriptFailure::UnreadableApiVersion {
                declaration: declaration.to_string(),
            })
    }

    /// Whether a Script declaring this version runs here: the same major version, and a minor
    /// one no newer than the app's.
    pub fn is_loadable(self) -> bool {
        self.major == ApiVersion::CURRENT.major
            && self.minor.cmp(&ApiVersion::CURRENT.minor).is_le()
    }
}

/// Written as a Script declares it, such as `1.0`.
impl fmt::Display for ApiVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}.{}", self.major, self.minor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(major: u32, minor: u32) -> ApiVersion {
        ApiVersion { major, minor }
    }

    // @behavior SR-003
    #[test]
    fn takes_a_script_declaring_nothing_as_written_for_the_current_api() {
        let source = "# frozen_string_literal: true\n\nTsuzuri.macro :a do |context| end\n";
        assert_eq!(ApiVersion::declared_in(source), Ok(ApiVersion::CURRENT));
    }

    // @behavior SR-004
    #[test]
    fn loads_a_script_written_for_the_current_minor_version() {
        let declared = ApiVersion::declared_in("# tsuzuri-api: 1.0\n").unwrap();
        assert_eq!((declared, declared.is_loadable()), (version(1, 0), true));
    }

    // @behavior SR-005
    #[test]
    fn refuses_a_script_written_for_a_newer_minor_version() {
        let declared =
            ApiVersion::declared_in("#!/usr/bin/env ruby\n# tsuzuri-api: 1.1\n").unwrap();
        assert_eq!((declared, declared.is_loadable()), (version(1, 1), false));
    }

    // @behavior SR-006
    #[test]
    fn refuses_a_script_written_for_another_major_version() {
        let declared = ApiVersion::declared_in("  #  tsuzuri-api:  2.0  \n").unwrap();
        assert_eq!((declared, declared.is_loadable()), (version(2, 0), false));
    }

    // @behavior SR-007
    #[test]
    fn reads_the_declaration_only_from_the_opening_comments() {
        let source = "Tsuzuri.macro :a do |context| end\n# tsuzuri-api: 2.0\n";
        assert_eq!(ApiVersion::declared_in(source), Ok(ApiVersion::CURRENT));
    }

    // @behavior SR-008
    #[test]
    fn fails_naming_a_declaration_it_cannot_read() {
        assert_eq!(
            ApiVersion::declared_in("# tsuzuri-api: one\n"),
            Err(ScriptFailure::UnreadableApiVersion {
                declaration: "one".to_string()
            })
        );
    }

    #[test]
    fn writes_a_version_as_declared() {
        assert_eq!(version(1, 2).to_string(), "1.2");
    }
}

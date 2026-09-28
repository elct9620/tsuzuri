pub mod commands;

use serde::Serialize;

/// The App Build: the release number of the running Tsuzuri, whether it is a Preview build, and
/// the commit it was built from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppBuild {
    pub release_number: &'static str,
    pub is_preview: bool,
    pub commit: &'static str,
}

/// The App Build of this binary, as Cargo.toml and `build.rs` named it at compile time.
pub fn running_build() -> AppBuild {
    let release_number = env!("CARGO_PKG_VERSION");
    AppBuild {
        release_number,
        is_preview: is_preview_release(release_number),
        commit: env!("TSUZURI_COMMIT"),
    }
}

/// Whether `release_number` is a Preview build's, which CI numbers `<patch>-preview.<n>`.
pub fn is_preview_release(release_number: &str) -> bool {
    release_number.contains("-preview.")
}

/// The page listing Tsuzuri's releases, each carrying the source of the ffmpeg it bundles.
pub fn releases_page() -> String {
    format!("{}/releases", env!("CARGO_PKG_REPOSITORY"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // @behavior OB-013
    #[test]
    fn names_the_release_number_and_the_commit_it_was_built_from() {
        let head = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .output()
            .expect("tests run in a git checkout");

        let build = running_build();

        assert_eq!(
            (build.release_number, build.commit),
            (
                env!("CARGO_PKG_VERSION"),
                String::from_utf8(head.stdout).unwrap().trim()
            )
        );
    }

    // @behavior UP-026
    #[test]
    fn tells_a_preview_build_from_a_stable_one() {
        let builds = ["0.2.1-preview.12", "0.2.0", "0.3.0-beta.1"].map(is_preview_release);

        assert_eq!(builds, [true, false, false]);
    }

    #[test]
    fn lists_the_releases_of_the_repository_tsuzuri_is_published_from() {
        assert_eq!(
            releases_page(),
            "https://github.com/elct9620/tsuzuri/releases"
        );
    }
}

pub mod commands;

use serde::Serialize;
use tauri::utils::config::BundleType;
use tauri::utils::platform::bundle_type;

use crate::release_number::{is_preview_build, release_name};

/// The App Build: the release number of the running Tsuzuri with its Release Name, whether it is a
/// Preview build, whether its install offers the Preview channel, and the commit it was built from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppBuild {
    pub release_number: &'static str,
    pub release_name: String,
    pub is_preview_build: bool,
    pub has_preview_channel: bool,
    pub commit: &'static str,
}

/// The App Build of this binary, as Cargo.toml and `build.rs` named it at compile time.
pub fn running_build() -> AppBuild {
    let release_number = env!("CARGO_PKG_VERSION");
    AppBuild {
        release_number,
        release_name: release_name(release_number),
        is_preview_build: is_preview_build(release_number),
        has_preview_channel: has_preview_channel(bundle_type()),
        commit: env!("TSUZURI_COMMIT"),
    }
}

/// Whether an install from `bundle` can follow the Preview channel. rpm ranks a Preview build
/// above the stable release that follows it, so an rpm install could never leave one.
pub fn has_preview_channel(bundle: Option<BundleType>) -> bool {
    !matches!(bundle, Some(BundleType::Rpm))
}

/// The page listing Tsuzuri's releases, each carrying the source of the ffmpeg it bundles.
pub fn releases_page() -> String {
    format!("{}/releases", env!("CARGO_PKG_REPOSITORY"))
}

/// The page where Tsuzuri can be sponsored.
pub const SPONSORSHIP_PAGE: &str = "https://portaly.cc/aotoki/product/lV2gJTEFE090h6x1zXhj";

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

    // @behavior UP-030
    #[test]
    fn offers_the_preview_channel_to_every_install_but_rpm() {
        let installs = [
            Some(BundleType::Rpm),
            Some(BundleType::Deb),
            Some(BundleType::Msi),
            Some(BundleType::Nsis),
            Some(BundleType::App),
        ]
        .map(has_preview_channel);

        assert_eq!(installs, [false, true, true, true, true]);
    }

    #[test]
    fn lists_the_releases_of_the_repository_tsuzuri_is_published_from() {
        assert_eq!(
            releases_page(),
            "https://github.com/elct9620/tsuzuri/releases"
        );
    }
}

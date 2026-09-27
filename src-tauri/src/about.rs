pub mod commands;

/// The page listing Tsuzuri's releases, each carrying the source of the ffmpeg it bundles.
pub fn releases_page() -> String {
    format!("{}/releases", env!("CARGO_PKG_REPOSITORY"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_the_releases_of_the_repository_tsuzuri_is_published_from() {
        assert_eq!(
            releases_page(),
            "https://github.com/elct9620/tsuzuri/releases"
        );
    }
}

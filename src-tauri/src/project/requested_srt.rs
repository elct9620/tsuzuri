use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::Url;

/// The Requested SRT, kept until the webview takes it: the system may ask before the webview
/// listens, as a launch to open a file does.
#[derive(Debug, Default)]
pub struct RequestedSrt(Mutex<Option<PathBuf>>);

impl RequestedSrt {
    /// Keeps `srt` as the Requested SRT, in place of one not taken yet.
    pub fn request(&self, srt: PathBuf) {
        *self.lock() = Some(srt);
    }

    /// The Requested SRT, which is then no longer kept.
    pub fn take(&self) -> Option<PathBuf> {
        self.lock().take()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<PathBuf>> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// The first SRT file among `arguments`, given to a launch in `directory` as paths or `file:`
/// URLs; flags and other files are passed over.
pub fn srt_argument(
    arguments: impl IntoIterator<Item = String>,
    directory: &Path,
) -> Option<PathBuf> {
    arguments
        .into_iter()
        .filter(|argument| !argument.starts_with('-'))
        .map(|argument| argument_path(&argument, directory))
        .find(|path| {
            path.extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("srt"))
        })
}

/// The file `argument` names, read against `directory` when relative. A Windows path such as
/// `C:\talks\ep01.srt` also reads as a URL, so only a `file:` URL is taken as one.
fn argument_path(argument: &str, directory: &Path) -> PathBuf {
    Url::parse(argument)
        .ok()
        .filter(|url| url.scheme() == "file")
        .and_then(|url| url.to_file_path().ok())
        .unwrap_or_else(|| directory.join(argument))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    // @behavior PJ-168
    #[test]
    fn takes_the_srt_file_among_the_launch_arguments() {
        let talks = Path::new("/talks");

        let srt = srt_argument(arguments(&["--flag", "notes.txt", "ep02.srt"]), talks);

        assert_eq!(srt, Some(talks.join("ep02.srt")));
    }

    #[test]
    fn keeps_an_absolute_srt_path_as_it_is() {
        let srt_path = std::env::temp_dir().join("ep02.SRT");

        let srt = srt_argument(
            [srt_path.to_string_lossy().into_owned()],
            Path::new("/elsewhere"),
        );

        assert_eq!(srt, Some(srt_path));
    }

    // @behavior PJ-169
    #[test]
    fn takes_a_file_url_the_system_hands_over() {
        let srt_path = std::env::temp_dir().join("talks").join("ep 02.srt");
        let url = Url::from_file_path(&srt_path).unwrap();

        let srt = srt_argument([url.to_string()], Path::new("/elsewhere"));

        assert_eq!(srt, Some(srt_path));
    }

    #[test]
    fn answers_none_without_an_srt_file() {
        let srt = srt_argument(arguments(&["--flag", "notes.txt"]), Path::new("/talks"));

        assert_eq!(srt, None);
    }

    // @behavior PJ-170
    #[test]
    fn answers_the_requested_srt_once() {
        let requested_srt = RequestedSrt::default();
        requested_srt.request(PathBuf::from("/talks/ep02.srt"));

        let takes = (requested_srt.take(), requested_srt.take());

        assert_eq!(takes, (Some(PathBuf::from("/talks/ep02.srt")), None));
    }
}

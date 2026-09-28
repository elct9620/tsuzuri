use serde::Serialize;

/// What a Preview build's release number says, for the settings to name it without a release
/// number that no stable release has yet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PreviewRelease {
    /// The stable release the Preview build follows.
    pub based_on: String,
    /// When CI built it, in UTC as a Backup's time is written: `YYYYMMDDTHHMMSSZ`.
    pub built_at: String,
}

/// The Preview build `release_number` names, as CI numbers one: the patch after the stable release
/// it is based on, `-preview.` and its UTC build time as `YYYYMMDDHHmm`, and `+` a count only the
/// MSI installer reads. Any other release number is no Preview build.
pub fn preview_release(release_number: &str) -> Option<PreviewRelease> {
    let (core, rest) = release_number.split_once("-preview.")?;
    let stamp = rest.split('+').next()?;
    if stamp.len() != 12 || !stamp.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let mut parts = core.split('.');
    let (major, minor) = (parts.next()?, parts.next()?);
    let patch = parts.next()?.parse::<u64>().ok()?.checked_sub(1)?;
    Some(PreviewRelease {
        based_on: format!("{major}.{minor}.{patch}"),
        built_at: format!(
            "{}{}{}T{}{}00Z",
            &stamp[0..4],
            &stamp[4..6],
            &stamp[6..8],
            &stamp[8..10],
            &stamp[10..12]
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // @behavior UP-026
    #[test]
    fn reads_the_stable_release_and_build_time_of_a_preview_build() {
        let releases =
            ["0.2.1-preview.202609281430+12", "0.2.0", "0.3.0-beta.1"].map(preview_release);

        assert_eq!(
            releases,
            [
                Some(PreviewRelease {
                    based_on: "0.2.0".into(),
                    built_at: "20260928T143000Z".into(),
                }),
                None,
                None,
            ]
        );
    }
}

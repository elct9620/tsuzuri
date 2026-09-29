/// The Release Name of `release_number`: `v` and the number for a stable release; for a Preview
/// build, whose number only orders it, `Build`, its UTC build date and `+` its build count.
pub fn release_name(release_number: &str) -> String {
    match preview_build(release_number) {
        Some((built_on, count)) => format!("Build {built_on}+{count}"),
        None => format!("v{release_number}"),
    }
}

/// Whether `release_number` numbers a Preview build rather than a stable release.
pub fn is_preview_build(release_number: &str) -> bool {
    preview_build(release_number).is_some()
}

/// The UTC build date `YYYYMMDD` and build count of the Preview build `release_number` names, as
/// CI numbers one: the patch after the stable release it follows, `-preview.` and its UTC build
/// time as `YYYYMMDDHHmm`, and `+` the count. Any other release number is no Preview build.
fn preview_build(release_number: &str) -> Option<(&str, &str)> {
    let (_, rest) = release_number.split_once("-preview.")?;
    let (stamp, count) = rest.split_once('+')?;
    let is_digits = |text: &str| !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit());
    (stamp.len() == 12 && is_digits(stamp) && is_digits(count)).then(|| (&stamp[..8], count))
}

#[cfg(test)]
mod tests {
    use super::*;

    // @behavior UP-026
    #[test]
    fn names_a_preview_build_by_build_date_and_count_and_a_stable_release_by_v_and_its_number() {
        let releases = ["0.2.1-preview.202609281430+12", "0.2.0", "0.3.0-beta.1"]
            .map(|number| (release_name(number), is_preview_build(number)));

        assert_eq!(
            releases,
            [
                ("Build 20260928+12".to_string(), true),
                ("v0.2.0".to_string(), false),
                ("v0.3.0-beta.1".to_string(), false),
            ]
        );
    }
}

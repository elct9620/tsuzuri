use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Where a Project keeps its Backups, in a directory the Resource list never reads.
pub const HISTORY_DIR: &str = ".tsuzuri/history";

/// Copies `subtitle` into the history of `directory` as a Backup taken `at`, when it exists.
pub fn back_up(directory: &Path, subtitle: &Path, at: SystemTime) -> io::Result<()> {
    let Some(stem) = subtitle
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_suffix(".srt"))
    else {
        return Ok(());
    };
    if !subtitle.is_file() {
        return Ok(());
    }
    let history = directory.join(HISTORY_DIR);
    fs::create_dir_all(&history)?;
    let backup = history.join(format!("{stem}.{}.srt", utc_stamp(at)));
    fs::copy(subtitle, backup)?;
    Ok(())
}

/// `at` as `YYYYMMDDTHHMMSSZ` in UTC, which sorts in time order and names no time zone.
fn utc_stamp(at: SystemTime) -> String {
    let seconds = at
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());
    let (days, of_day) = (seconds / 86_400, seconds % 86_400);
    let (year, month, day) = civil_date(days as i64);
    format!(
        "{year:04}{month:02}{day:02}T{:02}{:02}{:02}Z",
        of_day / 3_600,
        of_day / 60 % 60,
        of_day % 60
    )
}

/// The proleptic Gregorian date `days` after 1970-01-01, by Howard Hinnant's `civil_from_days`.
fn civil_date(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * shifted_month + 2) / 5 + 1) as u32;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    } as u32;
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn stamps_a_time_in_utc() {
        let at = UNIX_EPOCH + Duration::from_secs(1_790_303_400);

        assert_eq!(utc_stamp(at), "20260925T023000Z");
    }

    #[test]
    fn stamps_the_last_day_of_a_leap_february() {
        let at = UNIX_EPOCH + Duration::from_secs(951_782_400);

        assert_eq!(utc_stamp(at), "20000229T000000Z");
    }
}

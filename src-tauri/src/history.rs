use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// Where a Project keeps its Backups, in a directory the Resource list never reads.
pub const HISTORY_DIR: &str = ".tsuzuri/history";

/// A Backup of one subtitle, by its file name in the history and the UTC time it was taken.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Backup {
    pub file: String,
    /// `YYYYMMDDTHHMMSSZ`
    pub taken_at: String,
}

/// Copies `subtitle` into the history of `directory` as a Backup taken `at`, when it exists. A
/// Backup already taken that second is left alone and this one takes the next free second.
pub fn back_up(directory: &Path, subtitle: &Path, at: SystemTime) -> io::Result<()> {
    let Some(stem) = subtitle_stem(subtitle) else {
        return Ok(());
    };
    if !subtitle.is_file() {
        return Ok(());
    }
    let history = directory.join(HISTORY_DIR);
    fs::create_dir_all(&history)?;
    let mut at = at;
    let backup = loop {
        let backup = history.join(format!("{stem}.{}.srt", utc_stamp(at)));
        if !backup.exists() {
            break backup;
        }
        at += Duration::from_secs(1);
    };
    fs::copy(subtitle, backup)?;
    Ok(())
}

/// The Backups of `subtitle` in the history of `directory`, newest first.
pub fn backups_of(directory: &Path, subtitle: &Path) -> io::Result<Vec<Backup>> {
    let Some(stem) = subtitle_stem(subtitle) else {
        return Ok(Vec::new());
    };
    let entries = match fs::read_dir(directory.join(HISTORY_DIR)) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut backups: Vec<Backup> = entries
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter_map(|file| {
            let (named, taken_at) = file.strip_suffix(".srt")?.rsplit_once('.')?;
            (named == stem && is_utc_stamp(taken_at)).then(|| Backup {
                taken_at: taken_at.to_string(),
                file: file.clone(),
            })
        })
        .collect();
    backups.sort_by(|a, b| b.taken_at.cmp(&a.taken_at));
    Ok(backups)
}

/// Where the Backup named `file` is kept in the history of `directory`.
pub fn backup_path(directory: &Path, file: &str) -> PathBuf {
    directory.join(HISTORY_DIR).join(file)
}

/// `ep01` of `ep01.srt`, `ep01.en` of `ep01.en.srt`.
fn subtitle_stem(subtitle: &Path) -> Option<&str> {
    subtitle.file_name()?.to_str()?.strip_suffix(".srt")
}

fn is_utc_stamp(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 16
        && bytes[8] == b'T'
        && bytes[15] == b'Z'
        && bytes[..8]
            .iter()
            .chain(&bytes[9..15])
            .all(u8::is_ascii_digit)
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
    use crate::test_support::TempDir;

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

    #[test]
    fn takes_the_next_free_second_for_a_backup_taken_twice_in_one() {
        let dir = TempDir::new("history-same-second");
        let subtitle = dir.path().join("ep01.srt");
        let at = UNIX_EPOCH + Duration::from_secs(1_790_303_400);
        std::fs::write(&subtitle, "first").unwrap();
        back_up(dir.path(), &subtitle, at).unwrap();
        std::fs::write(&subtitle, "second").unwrap();

        back_up(dir.path(), &subtitle, at).unwrap();

        let taken: Vec<String> = backups_of(dir.path(), &subtitle)
            .unwrap()
            .into_iter()
            .map(|backup| backup.taken_at)
            .collect();
        assert_eq!(taken, ["20260925T023001Z", "20260925T023000Z"]);
    }
}

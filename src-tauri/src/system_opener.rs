use std::ffi::OsStr;
use std::io;
use std::process::Command;

/// Hands a directory or a web address to the program the system opens it with:
/// the file manager or the browser.
pub fn open_in_system(target: impl AsRef<OsStr>) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "explorer";
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let opener = "xdg-open";
    // The opener answers at once; its status says nothing about the target opening.
    let _ = Command::new(opener).arg(target).status()?;
    Ok(())
}

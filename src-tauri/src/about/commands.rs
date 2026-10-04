use super::{releases_page, running_build, AppBuild, SPONSORSHIP_PAGE};
use crate::failure::Failure;
use crate::system_opener::open_in_system;

#[tauri::command]
#[specta::specta]
pub fn open_releases() -> Result<(), Failure> {
    open_in_system(releases_page())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn open_sponsorship() -> Result<(), Failure> {
    open_in_system(SPONSORSHIP_PAGE)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn app_build() -> AppBuild {
    running_build()
}

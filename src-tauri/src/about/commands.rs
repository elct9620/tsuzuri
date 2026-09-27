use super::{releases_page, running_build, AppBuild};
use crate::failure::Failure;
use crate::system_opener::open_in_system;

#[tauri::command]
pub fn open_releases() -> Result<(), Failure> {
    open_in_system(releases_page())?;
    Ok(())
}

#[tauri::command]
pub fn app_build() -> AppBuild {
    running_build()
}

use super::releases_page;
use crate::failure::Failure;
use crate::system_opener::open_in_system;

#[tauri::command]
pub fn open_releases() -> Result<(), Failure> {
    open_in_system(releases_page())?;
    Ok(())
}

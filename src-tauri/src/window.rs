use tauri::{App, LogicalSize, Manager, PhysicalSize, Size};
use tauri_plugin_window_state::AppHandleExt;

/// The size when the screen reports none: one and a half times the 800×600 the window is configured with.
const FALLBACK_SIZE: LogicalSize<f64> = LogicalSize {
    width: 1200.0,
    height: 900.0,
};

/// The size the window first opens at: 80% of the screen's work area, or `FALLBACK_SIZE` without one.
pub fn first_size(work_area: Option<PhysicalSize<u32>>) -> Size {
    match work_area {
        Some(area) => Size::Physical(PhysicalSize::new(area.width * 4 / 5, area.height * 4 / 5)),
        None => Size::Logical(FALLBACK_SIZE),
    }
}

/// Sizes and centres the main window when no window state was saved yet; once one is, the
/// window-state plugin restores the size and place the window was closed at instead.
pub fn size_first_window(app: &App) -> tauri::Result<()> {
    let saved_state = app.path().app_config_dir()?.join(app.handle().filename());
    if saved_state.exists() {
        return Ok(());
    }
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let work_area = window
        .current_monitor()?
        .map(|monitor| monitor.work_area().size);
    window.set_size(first_size(work_area))?;
    window.center()
}

#[cfg(test)]
mod tests {
    use super::*;

    // @behavior IF-007
    #[test]
    fn sizes_the_first_window_to_the_screen() {
        let size = first_size(Some(PhysicalSize::new(1920, 1080)));

        assert_eq!(size, Size::Physical(PhysicalSize::new(1536, 864)));
    }

    // @behavior IF-008
    #[test]
    fn sizes_the_first_window_without_a_screen_size() {
        let size = first_size(None);

        assert_eq!(size, Size::Logical(LogicalSize::new(1200.0, 900.0)));
    }
}

use tauri::webview::NewWindowResponse;
use tauri::{
    App, AppHandle, Emitter, LogicalSize, Manager, PhysicalSize, Runtime, Size, Url, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};
use tauri_plugin_window_state::AppHandleExt;

/// The label of the window the main window's page opens for the Preview's video.
pub const VIDEO_WINDOW: &str = "video";

/// The page the Video Window opens on: blank, so it shares the main window's origin and the main
/// window's page moves its own video into it.
const VIDEO_WINDOW_PAGE: &str = "about:blank";

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

/// Builds the main window from the configuration, letting its page open the Video Window and no
/// other window.
pub fn build_main_window(app: &App) -> tauri::Result<WebviewWindow> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or(tauri::Error::WindowNotFound)?;
    let handle = app.handle().clone();
    WebviewWindowBuilder::from_config(app.handle(), config)?
        .on_new_window(move |url, features| {
            let is_open = handle.get_webview_window(VIDEO_WINDOW).is_some();
            if !is_video_window_request(&url, is_open) {
                return NewWindowResponse::Deny;
            }
            match open_video_window(&handle, url, features) {
                Ok(window) => NewWindowResponse::Create { window },
                Err(error) => {
                    log::warn!("could not open the Video Window: {error}");
                    NewWindowResponse::Deny
                }
            }
        })
        .build()
}

/// Whether the main window's page may open a window for `url`: only the blank page of the Video
/// Window, and only while none is open.
pub fn is_video_window_request(url: &Url, is_open: bool) -> bool {
    url.as_str() == VIDEO_WINDOW_PAGE && !is_open
}

fn open_video_window<R: Runtime>(
    app: &AppHandle<R>,
    url: Url,
    features: tauri::webview::NewWindowFeatures,
) -> tauri::Result<WebviewWindow<R>> {
    WebviewWindowBuilder::new(app, VIDEO_WINDOW, WebviewUrl::External(url))
        .window_features(features)
        .title("Tsuzuri")
        .min_inner_size(320.0, 180.0)
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&title);
        })
        .build()
}

/// Keeps the Video Window open when asked to close, and asks the main window's page to take its
/// video back first: the video lives in that page, and would end with the Video Window's.
pub fn hand_back_video<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let (VIDEO_WINDOW, WindowEvent::CloseRequested { api, .. }) = (window.label(), event) {
        api.prevent_close();
        // @event video-window-closing
        let _ = window.emit("video-window-closing", ());
    }
}

/// Closes the Video Window along with the main window, which no longer moves its video back.
pub fn close_video_with_main<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let ("main", WindowEvent::Destroyed) = (window.label(), event) {
        if let Some(video) = window.app_handle().get_webview_window(VIDEO_WINDOW) {
            let _ = video.destroy();
        }
    }
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

    // @behavior PV-137
    #[test]
    fn opens_no_window_but_the_video_window() {
        let url = Url::parse("https://example.com").unwrap();

        assert!(!is_video_window_request(&url, false));
    }

    // @behavior PV-138
    #[test]
    fn opens_one_video_window_at_a_time() {
        let url = Url::parse("about:blank").unwrap();

        assert!(!is_video_window_request(&url, true));
    }

    #[test]
    fn opens_the_video_window_while_none_is_open() {
        let url = Url::parse("about:blank").unwrap();

        assert!(is_video_window_request(&url, false));
    }
}

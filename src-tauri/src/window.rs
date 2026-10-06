use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::webview::NewWindowResponse;
use tauri::{
    App, AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize,
    Runtime, Size, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tauri_specta::Event;

use crate::failure::Failure;
use crate::json_settings;

/// The label of the main window, as `tauri.conf.json` names it.
const MAIN_WINDOW: &str = "main";

/// The label of the window the main window's page opens for the Preview's video.
pub const VIDEO_WINDOW: &str = "video";

/// The page the Video Window opens on: blank, so it shares the main window's origin and the main
/// window's page moves its own video into it.
const VIDEO_WINDOW_PAGE: &str = "about:blank";

/// The smallest the Video Window is made, a 16:9 frame.
const VIDEO_WINDOW_MIN_SIZE: LogicalSize<f64> = LogicalSize {
    width: 320.0,
    height: 180.0,
};

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
pub fn size_first_window(app: &App) -> Result<(), Failure> {
    if window_state_file(app.handle())?.exists() {
        return Ok(());
    }
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return Ok(());
    };
    let work_area = window
        .current_monitor()?
        .map(|monitor| monitor.work_area().size);
    window.set_size(first_size(work_area))?;
    Ok(window.center()?)
}

/// Shows the main window in front, as when a second launch hands its request over to it.
pub fn bring_main_window_forward<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Builds the main window from the configuration, letting its page open the Video Window and no
/// other window.
pub fn build_main_window(app: &App) -> tauri::Result<WebviewWindow> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW)
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
    let builder = WebviewWindowBuilder::new(app, VIDEO_WINDOW, WebviewUrl::External(url))
        .window_features(features)
        .title("Tsuzuri")
        .min_inner_size(VIDEO_WINDOW_MIN_SIZE.width, VIDEO_WINDOW_MIN_SIZE.height)
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&title);
        });
    let screens: Vec<Screen> = app.available_monitors()?.iter().map(Screen::from).collect();
    let Some((position, size)) =
        video_window_place(save_and_read_video_window_place(app), &screens)
    else {
        return builder.build();
    };
    let window = builder
        .position(position.x, position.y)
        .inner_size(size.width, size.height)
        .build()?;
    // macOS reads a new window's place against the screen it is made on, moving it off that
    // screen; logical units there are the same on every screen, so it is placed once more.
    window.set_position(position)?;
    window.set_size(size)?;
    Ok(window)
}

/// A window's place as the window-state plugin saves it, in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct WindowPlace {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// A screen's area in physical pixels, with the scale its windows take.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Screen {
    pub position: PhysicalPosition<i32>,
    pub size: PhysicalSize<u32>,
    pub scale_factor: f64,
}

impl From<&Monitor> for Screen {
    fn from(monitor: &Monitor) -> Self {
        Screen {
            position: *monitor.position(),
            size: *monitor.size(),
            scale_factor: monitor.scale_factor(),
        }
    }
}

impl Screen {
    fn has_point(&self, x: i32, y: i32) -> bool {
        let right = self.position.x + self.size.width as i32;
        let bottom = self.position.y + self.size.height as i32;
        (self.position.x..right).contains(&x) && (self.position.y..bottom).contains(&y)
    }
}

/// Where to make the Video Window, in the logical units a window is built with: its last place,
/// scaled by the screen that place is on. A window takes the scale of the screen it is made on,
/// so making it there keeps its size, where placing it after it is made scales it by the screen
/// it was made on. None leaves the place to the system: never placed, or its screen is gone.
pub fn video_window_place(
    saved: Option<WindowPlace>,
    screens: &[Screen],
) -> Option<(LogicalPosition<f64>, LogicalSize<f64>)> {
    let place = saved.filter(|place| place.width > 0 && place.height > 0)?;
    let screen = screens
        .iter()
        .find(|screen| screen.has_point(place.x, place.y))?;
    Some((
        PhysicalPosition::new(place.x, place.y).to_logical(screen.scale_factor),
        PhysicalSize::new(place.width, place.height).to_logical(screen.scale_factor),
    ))
}

/// Where the window-state plugin saves the size and place of each window.
fn window_state_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, Failure> {
    Ok(json_settings::settings_dir(app)?.join(app.filename()))
}

/// The Video Window's last place, as the window-state plugin keeps it: written out first, since
/// the plugin holds the latest in memory until the app quits.
fn save_and_read_video_window_place<R: Runtime>(app: &AppHandle<R>) -> Option<WindowPlace> {
    app.save_window_state(StateFlags::all()).ok()?;
    let places: HashMap<String, WindowPlace> =
        json_settings::settings_at(&window_state_file(app).ok()?).ok()?;
    places.get(VIDEO_WINDOW).copied()
}

/// The Video Window was asked to close and stays open until the main window's page takes its
/// video back.
// @event video-window-closing
#[derive(Clone, Serialize, specta::Type, Event)]
#[tauri_specta(event_name = "video-window-closing")]
pub struct VideoWindowClosing;

/// Keeps the Video Window open when asked to close, and asks the main window's page to take its
/// video back first: the video lives in that page, and would end with the Video Window's.
pub fn hand_back_video<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let (VIDEO_WINDOW, WindowEvent::CloseRequested { api, .. }) = (window.label(), event) {
        api.prevent_close();
        let _ = VideoWindowClosing.emit(window);
    }
}

/// Closes the Video Window along with the main window, which no longer moves its video back.
pub fn close_video_with_main<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let (MAIN_WINDOW, WindowEvent::Destroyed) = (window.label(), event) {
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

    /// A screen from (-1920, 0) to (0, 1080) at `scale_factor`, beside the main one.
    fn left_screen(scale_factor: f64) -> Screen {
        Screen {
            position: PhysicalPosition::new(-1920, 0),
            size: PhysicalSize::new(1920, 1080),
            scale_factor,
        }
    }

    const LAST_PLACE: WindowPlace = WindowPlace {
        x: -1900,
        y: 100,
        width: 800,
        height: 450,
    };

    // @behavior PV-168
    #[test]
    fn opens_the_video_window_where_it_was_last() {
        let place = video_window_place(Some(LAST_PLACE), &[left_screen(2.0)]);

        assert_eq!(
            place,
            Some((
                LogicalPosition::new(-950.0, 50.0),
                LogicalSize::new(400.0, 225.0)
            ))
        );
    }

    // @behavior PV-169
    #[test]
    fn opens_the_video_window_on_the_main_screen_when_its_last_screen_is_gone() {
        let place = video_window_place(Some(LAST_PLACE), &[]);

        assert_eq!(place, None);
    }

    #[test]
    fn opens_the_video_window_as_asked_before_it_was_ever_placed() {
        let unplaced = WindowPlace {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        };

        let place = video_window_place(Some(unplaced), &[left_screen(1.0)]);

        assert_eq!(place, None);
    }

    #[test]
    fn opens_the_video_window_while_none_is_open() {
        let url = Url::parse("about:blank").unwrap();

        assert!(is_video_window_request(&url, false));
    }
}

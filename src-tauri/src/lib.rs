pub mod about;
pub mod cleanup;
pub mod failure;
pub mod json_settings;
pub mod language;
pub mod logs;
#[cfg(target_os = "macos")]
pub mod menu;
pub mod model_source;
pub mod processes;
pub mod progress;
pub mod project;
pub mod release_number;
pub mod replacement;
pub mod segment_change;
pub mod steps;
pub mod system_opener;
pub mod timing;
pub mod toolchain;
pub mod transcript;
pub mod transcription;
pub mod transfer_report;
pub mod translation;
pub mod updates;
pub mod waveform;
pub mod window;

#[cfg(test)]
mod test_support;

use std::path::Path;

use tauri::{AppHandle, Manager, RunEvent, Runtime, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

use logs::{DebugLogInUse, LogDirInUse, LogSettings};
use processes::Processes;
use project::{CurrentProject, RequestedSrt};
use steps::ModeLock;
use toolchain::hub::ModelDownloads;
use translation::ResidentLlama;
use updates::FoundUpdate;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = with_requested_srt(tauri::Builder::default());
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(menu::build_app_menu)
        .on_menu_event(menu::forward_edit_command);
    builder
        .plugin(tauri_plugin_single_instance::init(follow_second_launch))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state(window::VIDEO_WINDOW)
                .build(),
        )
        .setup(|app| {
            let log_settings = LogSettings::load(&app.path().app_config_dir()?)?;
            let log_dir = log_settings.log_dir(app.path().app_log_dir()?);
            app.handle().plugin(
                tauri_plugin_log::Builder::new()
                    .level(log::LevelFilter::Info)
                    .level_for("tsuzuri_lib", log_settings.tsuzuri_level())
                    .timezone_strategy(TimezoneStrategy::UseLocal)
                    // Room for several whole runs, so the slow one is still there when someone looks.
                    .max_file_size(1_000_000)
                    .rotation_strategy(RotationStrategy::KeepSome(5))
                    .clear_targets()
                    .targets([
                        Target::new(TargetKind::Stdout),
                        Target::new(TargetKind::Folder {
                            path: log_dir.clone(),
                            file_name: None,
                        }),
                    ])
                    .build(),
            )?;
            log::info!("log written to {}", log_dir.display());
            app.manage(LogDirInUse(log_dir));
            app.manage(DebugLogInUse(log_settings.has_debug_log));
            let record = app.path().app_data_dir()?.join("processes.json");
            processes::reap_strays(&record);
            app.manage(Processes::new(record));
            app.manage(CurrentProject::default());
            project::commands::request_srt_argument(
                app.handle(),
                std::env::args().skip(1),
                &std::env::current_dir()?,
            );
            app.manage(ResidentLlama::default());
            app.manage(ModeLock::default());
            app.manage(FoundUpdate::default());
            app.manage(ModelDownloads::default());
            std::thread::spawn(cleanup::load_tables);
            translation::commands::start_resident_llama(app.handle());
            window::build_main_window(app)?;
            window::size_first_window(app)?;
            Ok(())
        })
        // A file may have been added or corrected in another program while the window was away
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(true) = event {
                project::commands::reload_if_changed(window.app_handle());
            }
            window::hand_back_video(window, event);
            window::close_video_with_main(window, event);
        })
        .invoke_handler(tauri::generate_handler![
            waveform::commands::extract_waveform,
            toolchain::commands::choose_component,
            toolchain::commands::forget_component,
            toolchain::commands::component_statuses,
            toolchain::commands::model_settings,
            toolchain::commands::choose_model,
            toolchain::commands::preset_models,
            toolchain::commands::download_model,
            toolchain::commands::repository_files,
            toolchain::commands::cancel_model_download,
            transcription::commands::transcribe,
            transcription::commands::transcription_settings,
            transcription::commands::save_transcription_settings,
            project::commands::current_project,
            project::commands::edit_segment,
            project::commands::set_speakers,
            project::commands::replace_text,
            project::commands::clean_simplified,
            project::commands::find_text,
            steps::commands::cancel_task,
            translation::commands::retranslate,
            project::commands::change_segments,
            project::commands::translation_cues,
            logs::commands::log_directory,
            logs::commands::choose_log_directory,
            logs::commands::debug_log,
            logs::commands::choose_debug_log,
            logs::commands::open_log_directory,
            about::commands::app_build,
            about::commands::open_releases,
            updates::commands::check_for_update,
            updates::commands::check_for_update_at_launch,
            updates::commands::install_update,
            updates::commands::update_settings,
            updates::commands::choose_launch_check,
            updates::commands::choose_update_channel,
            updates::commands::check_for_rollback,
            project::commands::revert_row,
            project::commands::undo,
            project::commands::redo,
            project::commands::subtitle_versions,
            project::commands::compare_versions,
            project::commands::restore_version,
            project::commands::export_path,
            project::commands::open_project,
            project::commands::open_srt,
            project::commands::recent_projects,
            project::commands::take_requested_srt,
            project::commands::save_srt,
            project::commands::save_text,
            project::commands::select_resource,
            project::commands::set_primary_language,
            project::commands::set_project_options,
            project::commands::show_translation,
            project::commands::reload_project,
            translation::commands::save_translation_settings,
            translation::commands::translate,
            translation::commands::translation_settings,
            project::commands::save_translation_glossary,
            project::commands::translation_glossary_table,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::Exit => app.state::<Processes>().kill_all(),
            #[cfg(target_os = "macos")]
            RunEvent::Opened { urls } => project::commands::request_srt_argument(
                app,
                urls.iter().map(|url| url.to_string()),
                Path::new("/"),
            ),
            _ => {}
        });
}

/// `builder` keeping the Requested SRT from before setup: macOS asks to open a file with
/// `RunEvent::Opened` before the app is set up, while Windows and Linux pass it as a launch
/// argument that setup reads.
fn with_requested_srt<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.manage(RequestedSrt::default())
}

/// Takes over what a second launch in `directory` was asked to open, since that launch quits, and
/// shows the window it would have opened.
fn follow_second_launch(app: &AppHandle, arguments: Vec<String>, directory: String) {
    project::commands::request_srt_argument(app, arguments, Path::new(&directory));
    window::bring_main_window_forward(app);
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use tauri::test::{mock_builder, mock_context, noop_assets};

    use super::*;

    // @behavior PJ-180
    #[test]
    fn keeps_an_srt_file_the_system_asks_for_before_setup() {
        let app = with_requested_srt(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();

        project::commands::request_srt_argument(
            app.handle(),
            ["/talks/ep02.srt".to_string()],
            Path::new("/"),
        );

        assert_eq!(
            app.state::<RequestedSrt>().take(),
            Some(PathBuf::from("/talks/ep02.srt"))
        );
    }
}

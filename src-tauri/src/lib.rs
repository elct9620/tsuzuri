pub mod failure;
pub mod language;
pub mod logs;
#[cfg(target_os = "macos")]
pub mod menu;
pub mod processes;
pub mod progress;
pub mod project;
pub mod replacement;
pub mod segment_change;
pub mod steps;
pub mod timing;
pub mod toolchain;
pub mod transcript;
pub mod transcription;
pub mod translation;
pub mod waveform;
pub mod window;

#[cfg(test)]
mod test_support;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

use logs::{LogDirInUse, LogSettings};
use processes::Processes;
use project::CurrentProject;
use steps::ModeLock;
use translation::ResidentLlama;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(menu::build_app_menu)
        .on_menu_event(menu::forward_edit_command);
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let log_dir = LogSettings::load(&app.path().app_config_dir()?)?
                .log_dir(app.path().app_log_dir()?);
            app.handle().plugin(
                tauri_plugin_log::Builder::new()
                    .level(log::LevelFilter::Info)
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
            let record = app.path().app_data_dir()?.join("processes.json");
            processes::reap_strays(&record);
            app.manage(Processes::new(record));
            app.manage(CurrentProject::default());
            app.manage(ResidentLlama::default());
            app.manage(ModeLock::default());
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
            transcription::commands::transcribe,
            transcription::commands::transcription_settings,
            transcription::commands::save_transcription_settings,
            project::commands::current_project,
            project::commands::edit_segment,
            project::commands::set_speakers,
            project::commands::replace_text,
            steps::commands::cancel_task,
            translation::commands::retranslate,
            project::commands::change_segments,
            project::commands::translation_cues,
            logs::commands::log_directory,
            logs::commands::choose_log_directory,
            logs::commands::open_log_directory,
            project::commands::revert_row,
            project::commands::undo,
            project::commands::redo,
            project::commands::subtitle_versions,
            project::commands::compare_versions,
            project::commands::restore_version,
            project::commands::export_path,
            project::commands::open_project,
            project::commands::open_srt,
            project::commands::save_srt,
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
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Processes>().kill_all();
            }
        });
}

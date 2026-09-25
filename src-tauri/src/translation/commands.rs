use tauri::{AppHandle, Manager};

use super::llama::READY_TIMEOUT;
use super::{
    llama_server, run_translate, LlamaServer, ResidentLlama, Translation, TranslationOptions,
    TranslationPlan, TranslationSettings,
};
use crate::failure::Failure;
use crate::language::Language;
use crate::processes::{AppPorts, Processes};
use crate::progress::Progress;
use crate::project::CurrentProject;
use crate::steps::commands::run_cancellable;
use crate::steps::ModeLock;
use crate::timing::Phases;
use crate::toolchain::{self, settings, ModelSlot};

#[tauri::command]
pub async fn translate(
    app: AppHandle,
    target: Language,
    options: TranslationOptions,
) -> Result<Translation, Failure> {
    let mode_lock = app.state::<ModeLock>();
    let mut turn = mode_lock.wait_turn().await;
    let phases = Phases::start("translate", "prepare");
    app.report("prepare", None);
    let [llama] = toolchain::find_ready_executables(settings::resolver(&app)?, ["llama"]).await?;
    let model_settings = settings::load_settings(&app)?;
    let plan = TranslationPlan {
        target,
        options,
        settings: TranslationSettings::load(&settings::settings_dir(&app)?)?,
    };
    let processes = app.state::<Processes>().inner().clone();
    let preset_dir = app.path().app_data_dir()?;
    let resident = app.state::<ResidentLlama>();
    let server = llama_server(&plan.settings, &resident, &preset_dir);
    let result = run_cancellable(
        &mut turn,
        &processes,
        run_translate(
            &AppPorts {
                app: &app,
                processes: &processes,
            },
            &app.state::<CurrentProject>(),
            &llama,
            &model_settings,
            &plan,
            &server,
            READY_TIMEOUT,
            phases,
        ),
    )
    .await;
    // A cancelled translation leaves the Resident llama-server running, so its Model is freed as
    // after any other translation.
    if let (Err(Failure::ModeCancelled), LlamaServer::Router { resident, keep, .. }) =
        (&result, &server)
    {
        resident.release_after(*keep).await;
    }
    result
}

#[tauri::command]
pub fn translation_settings(app: AppHandle) -> Result<TranslationSettings, Failure> {
    Ok(TranslationSettings::load(&settings::settings_dir(&app)?)?)
}

/// Saves the settings, stopping the Resident llama-server when it is turned off and starting it when turned on.
#[tauri::command]
pub async fn save_translation_settings(
    app: AppHandle,
    settings: TranslationSettings,
) -> Result<TranslationSettings, Failure> {
    let saved_settings = settings.save(&settings::settings_dir(&app)?)?;
    if saved_settings.has_resident_llama {
        start_resident_llama(&app);
    } else {
        // A translation still running keeps its llama-server until it ends.
        let mode_lock = app.state::<ModeLock>();
        let _turn = mode_lock.wait_turn().await;
        let processes = app.state::<Processes>().inner().clone();
        app.state::<ResidentLlama>()
            .stop(&AppPorts {
                app: &app,
                processes: &processes,
            })
            .await;
    }
    Ok(saved_settings)
}

/// Starts the Resident llama-server in the background once llama-server and the translation Model
/// are both ready, so the first translation only waits for its Model to load.
pub fn start_resident_llama(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let started = async {
            let [llama] =
                toolchain::find_ready_executables(settings::resolver(&app)?, ["llama"]).await?;
            let model_settings = settings::load_settings(&app)?;
            let model = model_settings.ready_path(ModelSlot::Translation)?;
            let processes = app.state::<Processes>().inner().clone();
            app.state::<ResidentLlama>()
                .start(
                    &AppPorts {
                        app: &app,
                        processes: &processes,
                    },
                    &llama,
                    model,
                    &app.path().app_data_dir()?,
                    READY_TIMEOUT,
                )
                .await
        };
        if let Err(failure) = started.await {
            log::info!("the Resident llama-server waits for the first translation: {failure:?}");
        }
    });
}

use tauri::{AppHandle, Manager};

use super::llama::READY_TIMEOUT;
use super::{run_translate, Translation, TranslationOptions, TranslationPlan, TranslationSettings};
use crate::components::{self, Resolver};
use crate::failure::Failure;
use crate::language::Language;
use crate::models;
use crate::processes::{AppPorts, Processes};
use crate::progress::Progress;
use crate::project::CurrentProject;
use crate::timing::Phases;

#[tauri::command]
pub async fn translate(
    app: AppHandle,
    target: Language,
    options: TranslationOptions,
) -> Result<Translation, Failure> {
    let phases = Phases::start("translate", "prepare");
    app.report("prepare", None);
    let [llama] = components::find_ready_executables(Resolver::from_app(&app)?, ["llama"]).await?;
    let model_settings = models::load_settings(&app)?;
    let plan = TranslationPlan {
        target,
        options,
        settings: TranslationSettings::load(&models::settings_dir(&app)?)?,
    };
    let processes = app.state::<Processes>().inner().clone();
    run_translate(
        &AppPorts {
            app: &app,
            processes: &processes,
        },
        &app.state::<CurrentProject>(),
        &llama,
        &model_settings,
        &plan,
        READY_TIMEOUT,
        phases,
    )
    .await
}

#[tauri::command]
pub fn translation_settings(app: AppHandle) -> Result<TranslationSettings, Failure> {
    Ok(TranslationSettings::load(&models::settings_dir(&app)?)?)
}

#[tauri::command]
pub fn save_translation_settings(
    app: AppHandle,
    settings: TranslationSettings,
) -> Result<TranslationSettings, Failure> {
    Ok(settings.save(&models::settings_dir(&app)?)?)
}

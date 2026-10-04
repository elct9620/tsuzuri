// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) =
        tsuzuri_lib::diarization::subcommand::run_diarize_subcommand(&args, &mut std::io::stderr())
    {
        std::process::exit(code);
    }
    tsuzuri_lib::run()
}

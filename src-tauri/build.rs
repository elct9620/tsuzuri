fn main() {
    let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if !windows_msvc {
        tauri_build::build();
        return;
    }

    // Tauri's code imports comctl32 functions only Common Controls v6 exports, which a
    // binary reaches through its manifest. tauri-build embeds that manifest into the app
    // alone, so the unit-test binary would fail to load (STATUS_ENTRYPOINT_NOT_FOUND,
    // tauri-apps/tauri#13419). Handing the same manifest to the linker covers every
    // binary this package links, and tauri-build's copy is turned off so the app keeps one.
    let manifest =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

import { setInterfaceLanguage } from "./i18n";

// Controller tests read the interface in Traditional Chinese, whatever language the machine running them uses.
await setInterfaceLanguage("zh-Hant-TW");

// The OS plugin tells the platform through a global the app is started with; tests run as Linux
// unless one says otherwise.
if (typeof window !== "undefined")
  Object.assign(window, {
    __TAURI_OS_PLUGIN_INTERNALS__: { platform: "linux" },
  });

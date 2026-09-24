import { setInterfaceLanguage } from "./i18n";

// Controller tests read the interface in Traditional Chinese, whatever language the machine running them uses.
await setInterfaceLanguage("zh-Hant-TW");

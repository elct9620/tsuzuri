import i18next, { type i18n, type TOptions } from "i18next";

import en from "./locales/en";
import zhHant from "./locales/zh-Hant";

let instance: i18n = i18next.createInstance();

/**
 * Writes the interface in `locale`'s language, or English when Tsuzuri has no translation for it.
 * Taiwan, Hong Kong and Macau locales that name no script still read Traditional Chinese.
 */
export async function setInterfaceLanguage(
  locale: string | null,
): Promise<void> {
  instance = i18next.createInstance();
  await instance.init({
    lng: locale ?? "en",
    fallbackLng: {
      "zh-TW": ["zh-Hant", "en"],
      "zh-HK": ["zh-Hant", "en"],
      "zh-MO": ["zh-Hant", "en"],
      default: ["en"],
    },
    resources: {
      en: { translation: en },
      "zh-Hant": { translation: zhHant },
    },
    // Text only ever reaches textContent, where escaping would show file paths as `&amp;`.
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = instance.resolvedLanguage ?? "en";
}

export function t(key: string, options?: TOptions): string {
  return instance.t(key, options);
}

/** Fills every element under `root` that names its text with `data-i18n`. */
export function translatePage(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n!);
  }
}

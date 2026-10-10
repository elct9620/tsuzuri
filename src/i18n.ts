import i18next, { type i18n, type TOptions } from "i18next";
import { createSubscriber } from "svelte/reactivity";

import type { Language } from "#/ipc/project.ts";
import en from "#/locales/en.ts";
import zhHant from "#/locales/zh-Hant.ts";

let instance: i18n = i18next.createInstance();
let redrawText = () => {};
const subscribeToLanguage = createSubscriber((update) => {
  redrawText = update;
  return () => {
    redrawText = () => {};
  };
});

/** The languages the interface can be written in, each named in its own words. */
export const INTERFACE_LANGUAGES = [
  { locale: "en", name: "English", translation: en },
  { locale: "zh-Hant", name: "繁體中文", translation: zhHant },
] as const;

/**
 * Writes the interface in `locale`'s language, or English when Tsuzuri has no translation for it.
 * Taiwan, Hong Kong and Macau locales that name no script still read Traditional Chinese. Text
 * written through `t` changes at once, without the page being drawn again.
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
    resources: Object.fromEntries(
      INTERFACE_LANGUAGES.map(({ locale, translation }) => [
        locale,
        { translation },
      ]),
    ),
    // Text only ever reaches textContent, where escaping would show file paths as `&amp;`.
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = instance.resolvedLanguage ?? "en";
  redrawText();
}

/** The Language code the interface stands for, which a new Project takes as its Primary Language. */
export function interfaceLanguageCode(): Language {
  subscribeToLanguage();
  return instance.resolvedLanguage === "zh-Hant" ? "zh-TW" : "en";
}

export function t(key: string, options?: TOptions): string {
  subscribeToLanguage();
  return instance.t(key, options);
}

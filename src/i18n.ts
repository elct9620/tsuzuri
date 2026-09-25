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

/** The Language code the interface stands for, which a new Project takes as its Primary Language. */
export function interfaceLanguageCode(): string {
  return instance.resolvedLanguage === "zh-Hant" ? "zh-TW" : "en";
}

export function t(key: string, options?: TOptions): string {
  return instance.t(key, options);
}

/** Where each attribute naming a text puts it: the text itself, the tooltip, or the accessible name a radio tab needs. */
const TEXT_PLACES: [string, (element: HTMLElement, text: string) => void][] = [
  ["data-i18n", (element, text) => (element.textContent = text)],
  ["data-i18n-tooltip", (element, text) => (element.dataset.tooltip = text)],
  [
    "data-i18n-label",
    (element, text) => element.setAttribute("aria-label", text),
  ],
];

/** Fills every element under `root` that names a text with one of `TEXT_PLACES`' attributes. */
export function translatePage(root: ParentNode = document): void {
  for (const [attribute, place] of TEXT_PLACES) {
    for (const element of root.querySelectorAll<HTMLElement>(
      `[${attribute}]`,
    )) {
      place(element, t(element.getAttribute(attribute)!));
    }
  }
}

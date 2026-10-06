import type * as bindings from "#/ipc/bindings.ts";
import type { Language } from "#/ipc/project.ts";
import { commands } from "#/ipc/bindings.ts";

export type TranslationOptions = bindings.TranslationOptions;

/** Rust sends every field; only a saved file read back may leave one out. */
export type TranslationSettings = Required<bindings.TranslationSettings>;

export type Translation = bindings.Translation;

/** Translates the Current Resource from the Primary Language; the translations land in the Project, not in the answer. */
export function translate(
  target: Language,
  options: TranslationOptions,
): Promise<Translation> {
  return commands.translate(target, options);
}

/** Translates the Segments at `indexes` again into the translation shown with `options`, save the Rolling Summary, as one change. */
export function retranslate(
  indexes: number[],
  options: TranslationOptions,
): Promise<Translation> {
  return commands.retranslate(indexes, options);
}

/** Translates the whole Current Resource into `target`, or with `indexes` the Segments at them again into the translation shown. */
export function translateSegments(
  target: Language,
  options: TranslationOptions,
  indexes: number[] | null,
): Promise<Translation> {
  return indexes === null
    ? translate(target, options)
    : retranslate(indexes, options);
}

export function translationSettings(): Promise<TranslationSettings> {
  return commands.translationSettings() as Promise<TranslationSettings>;
}

export function saveTranslationSettings(
  settings: TranslationSettings,
): Promise<TranslationSettings> {
  return commands.saveTranslationSettings(
    settings,
  ) as Promise<TranslationSettings>;
}

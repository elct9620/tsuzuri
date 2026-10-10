import type * as bindings from "#/ipc/bindings.ts";
import { commands, DEFAULT_PREFERENCES } from "#/ipc/bindings.ts";
import { locale } from "#/ipc/system.ts";

export type ChoiceLanding = bindings.ChoiceLanding;

/** Rust sends every field; only a saved file read back may leave one out. */
export type ChoiceLandings = Required<bindings.ChoiceLandings>;

export interface Preferences {
  choice_landings: ChoiceLandings;
  /** The locale the interface is written in, or `null` to follow the system's language. */
  interface_language: string | null;
}

export { DEFAULT_PREFERENCES };

export function preferences(): Promise<Preferences> {
  return commands.preferences() as Promise<Preferences>;
}

export function savePreferences(settings: Preferences): Promise<Preferences> {
  return commands.savePreferences(settings) as Promise<Preferences>;
}

/**
 * The locale the interface starts in: the one the Preferences chose, or the system's when none is
 * chosen or the Preferences cannot be read.
 */
export async function interfaceLocale(): Promise<string | null> {
  const chosenLocale = await preferences().then(
    ({ interface_language }) => interface_language,
    () => null,
  );
  return chosenLocale ?? locale();
}

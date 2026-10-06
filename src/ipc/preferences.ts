import type * as bindings from "#/ipc/bindings.ts";
import { commands, DEFAULT_PREFERENCES } from "#/ipc/bindings.ts";

export type ChoiceLanding = bindings.ChoiceLanding;

/** Rust sends every field; only a saved file read back may leave one out. */
export type ChoiceLandings = Required<bindings.ChoiceLandings>;

export interface Preferences {
  choice_landings: ChoiceLandings;
}

export { DEFAULT_PREFERENCES };

export function preferences(): Promise<Preferences> {
  return commands.preferences() as Promise<Preferences>;
}

export function savePreferences(settings: Preferences): Promise<Preferences> {
  return commands.savePreferences(settings) as Promise<Preferences>;
}

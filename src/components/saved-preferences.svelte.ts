/**
 * The Preferences as last read or saved, shared by the settings that change them and the editor
 * that follows them.
 */

import {
  DEFAULT_PREFERENCES,
  type Preferences,
} from "#/backend/preferences.ts";

export class SavedPreferences {
  /** The defaults until the saved Preferences are read. */
  current = $state.raw<Preferences>(DEFAULT_PREFERENCES);
}

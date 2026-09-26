/**
 * The choices the webview remembers on this machine alone, such as how the Preview is laid out; a
 * webview without storage forgets them when it closes.
 */

/** The choice kept under `key`, or null when none was ever made here. */
export function rememberedChoice(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function rememberChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A webview without storage forgets the choice when it closes.
  }
}

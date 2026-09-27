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

/** The yes-or-no choice kept under `key`, or `byDefault` when none was ever made here. */
export function rememberedFlag(key: string, byDefault: boolean): boolean {
  const choice = rememberedChoice(key);
  return byDefault ? choice !== "false" : choice === "true";
}

export function rememberFlag(key: string, value: boolean): void {
  rememberChoice(key, String(value));
}

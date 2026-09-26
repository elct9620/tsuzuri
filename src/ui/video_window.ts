/**
 * The Video Window's page: a blank window of the main window's own origin, which shares this page's
 * scripts, so the Preview moves its own player into it rather than playing a copy.
 */

/** Opens the Video Window dressed as this page, empty; none when the webview refuses a window. */
export function openVideoWindow(title: string): Window | null {
  const videoWindow = window.open(
    "about:blank",
    "video",
    "width=960,height=540",
  );
  if (!videoWindow) return null;
  const page = videoWindow.document;
  page.title = title;
  page.documentElement.lang = document.documentElement.lang;
  for (const sheet of document.head.querySelectorAll<
    HTMLLinkElement | HTMLStyleElement
  >('link[rel="stylesheet"], style')) {
    const copy = sheet.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
    // A blank page may read a relative address against itself, so each sheet keeps this page's
    if (copy instanceof HTMLLinkElement)
      copy.href = (sheet as HTMLLinkElement).href;
    page.head.append(copy);
  }
  page.body.className = "flex h-screen bg-black";
  return videoWindow;
}

/**
 * Hands each key pressed in `videoWindow` to this page's window, where the editor's shortcuts
 * listen, as though it were pressed here.
 */
export function forwardKeys(videoWindow: Window): void {
  videoWindow.addEventListener("keydown", (event) => {
    const { key, code, ctrlKey, shiftKey, altKey, metaKey, repeat } = event;
    const echo = new KeyboardEvent("keydown", {
      key,
      code,
      ctrlKey,
      shiftKey,
      altKey,
      metaKey,
      repeat,
      cancelable: true,
    });
    window.dispatchEvent(echo);
    if (echo.defaultPrevented) event.preventDefault();
  });
}

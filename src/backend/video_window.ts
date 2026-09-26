/**
 * The Video Window as Rust holds it: the page opens and fills it itself, and asks Rust only to have
 * it fill its screen and to destroy it once the video is back.
 */

import { Window } from "@tauri-apps/api/window";

/** The label Rust gives the Video Window. */
const VIDEO_WINDOW = "video";

/** Makes the Video Window fill its screen, or go back to its size when it does. */
export async function toggleVideoWindowFullscreen(): Promise<void> {
  const videoWindow = await Window.getByLabel(VIDEO_WINDOW);
  if (videoWindow)
    await videoWindow.setFullscreen(!(await videoWindow.isFullscreen()));
}

export async function leaveVideoWindowFullscreen(): Promise<void> {
  await (await Window.getByLabel(VIDEO_WINDOW))?.setFullscreen(false);
}

/** Closes the Video Window without asking it first, as Rust asks the page before it closes. */
export async function destroyVideoWindow(): Promise<void> {
  await (await Window.getByLabel(VIDEO_WINDOW))?.destroy();
}

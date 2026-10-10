import { afterEach } from "vitest";
import { setInterfaceLanguage } from "#/i18n.ts";
import { installTopLayer } from "#/testing/top-layer.ts";

/**
 * Tests read the interface in Traditional Chinese on Linux, whatever the machine running them
 * uses; the OS plugin tells the platform through a global the app is started with. A test that
 * changes either has it set back before the next one.
 */
async function useDefaultInterface(): Promise<void> {
  if (typeof window !== "undefined")
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "linux" },
    });
  await setInterfaceLanguage("zh-Hant-TW");
}

await useDefaultInterface();
afterEach(useDefaultInterface);

// happy-dom has no Popover API; tests stack popovers and modal dialogs in a top layer of their own.
if (typeof HTMLDialogElement !== "undefined") installTopLayer();

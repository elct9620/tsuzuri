/// <reference types="vitest/config" />
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite";
import process from "node:process";
import { listBundledPackages } from "./scripts/licenses.ts";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    tailwindcss(),
    svelte(),
    // Tests mount components in happy-dom, so they need Svelte's browser build and a page
    // emptied after each.
    svelteTesting(),
    listBundledPackages(),
  ],
  test: {
    setupFiles: ["src/testing/setup.ts"],
    // Times show in the local time zone, so tests pin one to read the same on every machine.
    env: { TZ: "Asia/Taipei" },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

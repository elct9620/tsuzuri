/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  compilerOptions: {
    // Silenced only while the page moves from Stimulus to Svelte, whose markup still gets its
    // labels from i18n as the page starts; the move ends with this filter gone and no a11y warning.
    warningFilter: (warning) => !warning.code.startsWith("a11y_"),
  },
};

/** Resolves once the tasks already queued have run, so what a test set off has finished. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

import { screen, within } from "@testing-library/svelte";

/** Each Phase the progress lists, marked ✓ once done, ◌ while it runs, ○ before it. */
export function progressSteps(): string[] {
  const steps = screen
    .queryAllByRole("list", { hidden: true })
    .find((list) => list.classList.contains("steps"));
  if (!steps) return [];
  return within(steps)
    .queryAllByRole("listitem", { hidden: true })
    .map((step) => {
      const isReached = step.classList.contains("step-primary");
      const isRunning = step.getAttribute("aria-current") === "step";
      const mark = !isReached ? "○" : isRunning ? "◌" : "✓";
      return `${mark}${step.textContent?.trim()}`;
    });
}

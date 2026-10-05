import type { ProjectView } from "../backend/project";

/** The Speakers the Segments name and those the Translation Glossary names, in order. */
export function speakerNames(project: ProjectView | null): string[] {
  const names = new Set([
    ...(project?.segments ?? []).flatMap((segment) =>
      segment.speaker ? [segment.speaker] : [],
    ),
    ...(project?.translation_glossary?.speakers ?? []),
  ]);
  return [...names].sort();
}

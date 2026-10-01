/**
 * The numbered resolutions a RESOLUTION document prints: Word partials or
 * custom text, numbered in list order. Pure data and validation, shared by
 * the Configure step and the OakDoc composer (oakdoc-resolutions.ts).
 */

export type ResolutionSection =
  | { id: string; kind: 'PARTIAL'; heading: string; partialId: string }
  | { id: string; kind: 'CUSTOM'; heading: string; body: string };

export interface ResolutionComposition {
  /** Unnumbered heading above the resolutions; blank prints nothing. */
  subject: string;
  sections: ResolutionSection[];
}

/** Shown when a resolution template is previewed in the editor. */
export const SAMPLE_RESOLUTION_COMPOSITION: ResolutionComposition = {
  subject: 'SUBJECT OF THE RESOLUTIONS',
  sections: [
    {
      id: 'sample-1',
      kind: 'CUSTOM',
      heading: 'FIRST RESOLUTION',
      body: 'RESOLVED that the text of each resolution chosen on Configure appears here.',
    },
    {
      id: 'sample-2',
      kind: 'CUSTOM',
      heading: 'SECOND RESOLUTION',
      body: 'RESOLVED that resolutions are numbered in the order they are listed.',
    },
  ],
};

/** Custom text: a blank line starts a new paragraph, a single newline a line break. */
export function customResolutionParagraphs(body: string): string[][] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((line) => line.trimEnd()))
    .filter((lines) => lines.some((line) => line.trim().length > 0));
}

/** Validation shared by generation and the Configure step. */
export function resolutionCompositionIssues(composition: ResolutionComposition | null | undefined): string[] {
  if (!composition || composition.sections.length === 0) return ['Add at least one resolution.'];
  const issues: string[] = [];
  composition.sections.forEach((section, index) => {
    const label = `Resolution ${index + 1}`;
    if (!section.heading.trim()) issues.push(`${label} needs a heading.`);
    if (section.kind === 'CUSTOM' && customResolutionParagraphs(section.body).length === 0) {
      issues.push(`${label} needs its text.`);
    }
  });
  return issues;
}

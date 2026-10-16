import type { Editor } from "@tiptap/react";
import type { GenerationFlag, PlanSegment } from "@/lib/types";

// The plan editor's model (see components/PlanReviewDialog.tsx): every fixed
// segment is a heading of the dialog (plus read-only frozen text below it),
// every editable one its own editor. The segment list stays the data model —
// editors are indexed by segment, so segment count and order can never drift.

/** A `###` heading, nested in the section of the `##` heading before it. */
export const isSubheading = (text: string) => text.startsWith("###");

/** A heading's level, `##` → 2; 0 for no heading (start or end of the plan). */
export const headingLevel = (text?: string) =>
  text?.match(/^#+/)?.[0].length ?? 0;

/** A fixed segment: its heading line (if any) and the frozen text below it. */
export function fixedParts(text: string) {
  if (!text.startsWith("#")) return { heading: "", body: text.trim() };
  const [first = "", ...rest] = text.split("\n");
  return { heading: first.replace(/^#+\s*/, ""), body: rest.join("\n").trim() };
}

/**
 * Whether each top-level (`##`) section's field is generated, in the order
 * the generator's skeleton always has them: General, Patient, Chief
 * complaint, Anamnesis, Procedures. Headings come localized, so sections are
 * told apart by position, never by text. General is always shown.
 */
export const requestedSections = (flags: GenerationFlag[]) => [
  true,
  flags.includes("patient"),
  flags.includes("chiefComplaint"),
  flags.includes("anamnesis"),
  flags.includes("procedures"),
];

/** Each segment's top-level section index; -1 before the first heading. */
export function sectionsOf(plan: PlanSegment[]): number[] {
  let section = -1;
  return plan.map((s) => {
    if (s.fixed && s.text.startsWith("#") && !isSubheading(s.text)) section++;
    return section;
  });
}

/** An editor's content fingerprint, to tell an edited segment from an untouched one. */
export const fingerprint = (editor: Editor) => JSON.stringify(editor.getJSON());

/**
 * The plan back from its editors. Converting markdown to rich text and back
 * can rewrite a segment nobody touched, so only editors whose fingerprint
 * differs from their `baseline` (taken right after loading) are serialized;
 * untouched and fixed segments go back exactly as loaded.
 */
export function editedOutline(
  original: PlanSegment[],
  editors: Map<number, { editor: Editor; baseline: string }>
): PlanSegment[] {
  return original.map((segment, i) => {
    const entry = editors.get(i);
    if (segment.fixed || !entry || fingerprint(entry.editor) === entry.baseline)
      return segment;
    return { fixed: false, text: entry.editor.getMarkdown().trim() };
  });
}

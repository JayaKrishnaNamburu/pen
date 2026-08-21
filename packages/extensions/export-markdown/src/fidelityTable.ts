export type ExportFidelity = "full" | "degraded" | "dropped";

export interface ExportFidelityRow {
  kind: "block" | "mark" | "inline-node";
  type: string;
  fidelity: ExportFidelity;
  notes: string;
}

export const MARKDOWN_EXPORT_FIDELITY: readonly ExportFidelityRow[] = [
  { kind: "block", type: "paragraph", fidelity: "full", notes: "" },
  { kind: "block", type: "heading", fidelity: "full", notes: "" },
  { kind: "block", type: "bulletListItem", fidelity: "full", notes: "" },
  { kind: "block", type: "numberedListItem", fidelity: "full", notes: "" },
  { kind: "block", type: "checkListItem", fidelity: "full", notes: "" },
  { kind: "block", type: "codeBlock", fidelity: "full", notes: "" },
  {
    kind: "block",
    type: "image",
    fidelity: "degraded",
    notes: "caption dropped; hostile src omitted (SEC1)",
  },
  {
    kind: "block",
    type: "table",
    fidelity: "full",
    notes: "GFM pipe-table; tables without a header row fall back to HTML",
  },
  { kind: "block", type: "divider", fidelity: "full", notes: "" },
  {
    kind: "block",
    type: "callout",
    fidelity: "degraded",
    notes:
      "blockquote with Note/Warning/Error prefix; children exported as sibling blocks",
  },
  {
    kind: "block",
    type: "toggle",
    fidelity: "degraded",
    notes:
      "raw HTML details (Pen-specific); children exported as sibling blocks",
  },
  { kind: "block", type: "blockquote", fidelity: "full", notes: "" },
  {
    kind: "block",
    type: "subdocument",
    fidelity: "dropped",
    notes: "comment marker only; nested document dropped",
  },
  { kind: "mark", type: "bold", fidelity: "full", notes: "" },
  { kind: "mark", type: "italic", fidelity: "full", notes: "" },
  {
    kind: "mark",
    type: "underline",
    fidelity: "degraded",
    notes: "raw <u> HTML",
  },
  { kind: "mark", type: "strikethrough", fidelity: "full", notes: "" },
  {
    kind: "mark",
    type: "highlight",
    fidelity: "degraded",
    notes: "==text== (not CommonMark)",
  },
  { kind: "mark", type: "textColor", fidelity: "dropped", notes: "" },
  { kind: "mark", type: "backgroundColor", fidelity: "dropped", notes: "" },
  {
    kind: "mark",
    type: "link",
    fidelity: "full",
    notes: "hostile href omitted (SEC1)",
  },
  { kind: "mark", type: "code", fidelity: "full", notes: "" },
  {
    kind: "inline-node",
    type: "mention",
    fidelity: "dropped",
    notes: "non-string inserts omitted",
  },
  {
    kind: "inline-node",
    type: "inlineApp",
    fidelity: "dropped",
    notes: "non-string inserts omitted",
  },
];

export function renderFidelityTable(
  title: string,
  intro: string,
  rows: readonly ExportFidelityRow[],
): string {
  const lines = [
    `# ${title}`,
    "",
    intro,
    "",
    "Generated from `src/fidelityTable.ts` and asserted by `src/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.",
    "",
    "| Kind | Type | Fidelity | Notes |",
    "| --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(`| ${row.kind} | ${row.type} | ${row.fidelity} | ${row.notes} |`);
  }

  lines.push("");
  return lines.join("\n");
}

export function renderMarkdownFidelityTable(): string {
  return renderFidelityTable(
    "Markdown export fidelity (IOP3)",
    "Pen markdown is GitHub-flavored Markdown for blocks with a standard representation, plus Pen-specific constructs for the rest. A non-Pen reader sees GFM for headings, lists, code, tables, images, and emphasis. Subdocument and toggle become HTML comments or raw HTML.",
    MARKDOWN_EXPORT_FIDELITY,
  );
}

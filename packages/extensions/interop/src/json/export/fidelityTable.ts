export type ExportFidelity = "full" | "degraded" | "dropped";

export interface ExportFidelityRow {
  kind: "block" | "mark" | "inline-node";
  type: string;
  fidelity: ExportFidelity;
  notes: string;
}

const FULL: ExportFidelity = "full";

export const JSON_EXPORT_FIDELITY: readonly ExportFidelityRow[] = [
  { kind: "block", type: "paragraph", fidelity: FULL, notes: "" },
  { kind: "block", type: "heading", fidelity: FULL, notes: "" },
  { kind: "block", type: "bulletListItem", fidelity: FULL, notes: "" },
  { kind: "block", type: "numberedListItem", fidelity: FULL, notes: "" },
  { kind: "block", type: "checkListItem", fidelity: FULL, notes: "" },
  { kind: "block", type: "codeBlock", fidelity: FULL, notes: "" },
  { kind: "block", type: "image", fidelity: FULL, notes: "" },
  { kind: "block", type: "table", fidelity: FULL, notes: "" },
  { kind: "block", type: "divider", fidelity: FULL, notes: "" },
  { kind: "block", type: "callout", fidelity: FULL, notes: "" },
  { kind: "block", type: "toggle", fidelity: FULL, notes: "" },
  { kind: "block", type: "blockquote", fidelity: FULL, notes: "" },
  {
    kind: "block",
    type: "subdocument",
    fidelity: "degraded",
    notes: "subdocumentGuid is reassigned on import",
  },
  { kind: "mark", type: "bold", fidelity: FULL, notes: "" },
  { kind: "mark", type: "italic", fidelity: FULL, notes: "" },
  { kind: "mark", type: "underline", fidelity: FULL, notes: "" },
  { kind: "mark", type: "strikethrough", fidelity: FULL, notes: "" },
  { kind: "mark", type: "highlight", fidelity: FULL, notes: "" },
  { kind: "mark", type: "textColor", fidelity: FULL, notes: "" },
  { kind: "mark", type: "backgroundColor", fidelity: FULL, notes: "" },
  { kind: "mark", type: "link", fidelity: FULL, notes: "" },
  { kind: "mark", type: "code", fidelity: FULL, notes: "" },
  { kind: "inline-node", type: "mention", fidelity: FULL, notes: "" },
  { kind: "inline-node", type: "inlineApp", fidelity: FULL, notes: "" },
];

function renderFidelityTable(
  title: string,
  intro: string,
  rows: readonly ExportFidelityRow[],
): string {
  const lines = [
    `# ${title}`,
    "",
    intro,
    "",
    "Generated from `src/json/export/fidelityTable.ts` and asserted by `src/json/export/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.",
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

export function renderJsonFidelityTable(): string {
  return renderFidelityTable(
    "JSON export fidelity (IOP3)",
    "JSON is the lossless interchange format for schema-known document content: blocks, props, marks, inline nodes, and structured table payloads. Unknown props are preserved (DUR3). Metadata is included when requested. Apps are not part of this exporter.",
    JSON_EXPORT_FIDELITY,
  );
}

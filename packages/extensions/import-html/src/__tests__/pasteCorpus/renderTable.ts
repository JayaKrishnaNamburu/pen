import type { PasteCorpusFixture } from "./types";

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderOutcomeRow(fixture: PasteCorpusFixture): string {
  const { expectation } = fixture;
  const losses = expectation.intentionalLosses.join("; ");
  return `| ${escapeCell(expectation.source)} | ${escapeCell(expectation.provenance)} | ${escapeCell(expectation.outcomes.headings)} | ${escapeCell(expectation.outcomes.lists)} | ${escapeCell(expectation.outcomes.tables)} | ${escapeCell(expectation.outcomes.code)} | ${escapeCell(expectation.outcomes.links)} | ${escapeCell(expectation.outcomes.images)} | ${escapeCell(expectation.outcomes.marks)} | ${escapeCell(expectation.outcomes.colors)} | ${escapeCell(losses)} |`;
}

function renderFixtureSection(fixture: PasteCorpusFixture): string {
  const { expectation } = fixture;
  const losses = expectation.intentionalLosses
    .map((loss) => `- ${loss}`)
    .join("\n");
  const markers = expectation.markers.map((marker) => `\`${marker}\``).join(", ");
  return `### ${expectation.source}

- **id:** \`${expectation.id}\`
- **Provenance:** \`${expectation.provenance}\`
- **Approximates:** ${expectation.approximates}
- **Markers:** ${markers}

${losses}
`;
}

export function renderPasteCorpusMarkdown(fixtures: PasteCorpusFixture[]): string {
  const rows = fixtures.map(renderOutcomeRow).join("\n");
  const sections = fixtures.map(renderFixtureSection).join("\n");
  return `# Paste fidelity corpus (IOP2)

Clipboard \`text/html\` + \`text/plain\` pairs measured through the generic HTML import path (\`parseHtmlToBlocks\`). Pen does not sniff \`mso\` classes or \`docs-internal-guid\`. A documented flattening is the paste contract; an undocumented one is a regression.

These fixtures are **synthetic-until-capture**: documented approximations of what each application emits, not hand-captured clipboard dumps. Replace a fixture with a real capture by overwriting \`clipboard.html\` / \`plain.txt\` and updating \`expectation.json\` with a reason in the PR.

Generated from \`src/__tests__/pasteCorpus/\` by \`src/__tests__/pasteCorpus.test.ts\`. Do not edit by hand.

## Outcome table

| Source | Provenance | Headings | Lists | Tables | Code | Links | Images | Bold / italic / strike | Colors | Intentional losses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Fixtures

${sections}`;
}

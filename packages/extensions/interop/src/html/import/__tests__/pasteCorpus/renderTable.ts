import type { PasteCorpusFixture } from "./types";
import {
  formatPasteCorpusProvenance,
  isSyntheticProvenance,
} from "./validate";

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderOutcomeRow(fixture: PasteCorpusFixture): string {
  const { expectation } = fixture;
  const losses = expectation.intentionalLosses.join("; ");
  return `| ${escapeCell(expectation.source)} | ${escapeCell(formatPasteCorpusProvenance(expectation.provenance))} | ${escapeCell(expectation.outcomes.headings)} | ${escapeCell(expectation.outcomes.lists)} | ${escapeCell(expectation.outcomes.tables)} | ${escapeCell(expectation.outcomes.code)} | ${escapeCell(expectation.outcomes.links)} | ${escapeCell(expectation.outcomes.images)} | ${escapeCell(expectation.outcomes.marks)} | ${escapeCell(expectation.outcomes.colors)} | ${escapeCell(losses)} |`;
}

function renderFixtureSection(fixture: PasteCorpusFixture): string {
  const { expectation } = fixture;
  const losses = expectation.intentionalLosses
    .map((loss) => `- ${loss}`)
    .join("\n");
  const markers = expectation.markers.map((marker) => `\`${marker}\``).join(", ");
  return `### ${expectation.source}

- **id:** \`${expectation.id}\`
- **Provenance:** \`${formatPasteCorpusProvenance(expectation.provenance)}\`
- **Approximates:** ${expectation.approximates}
- **Markers:** ${markers}

${losses}
`;
}

function renderProvenanceIntro(fixtures: PasteCorpusFixture[]): string {
  const synthetic = fixtures.filter((fixture) =>
    isSyntheticProvenance(fixture.expectation.provenance),
  );
  if (synthetic.length === fixtures.length) {
    return `These fixtures are **synthetic-until-capture**: documented approximations of what each application emits, not hand-captured clipboard dumps. A real Word clipboard payload is hundreds of kilobytes of \`<style>\` and \`mso-\` attributes; these fixtures are a few hundred bytes. Do not invent markup and label it captured. The replacement procedure is \`src/html/import/__tests__/pasteCorpus/CAPTURE.md\`.`;
  }
  if (synthetic.length === 0) {
    return `Every source below is a hand-captured clipboard dump. Provenance names the application, version, and capture date.`;
  }
  const missing = synthetic
    .map((fixture) => `\`${fixture.id}\``)
    .join(", ");
  return `${fixtures.length - synthetic.length} of ${fixtures.length} sources are hand-captured. Still synthetic-until-capture: ${missing}. The replacement procedure is \`src/html/import/__tests__/pasteCorpus/CAPTURE.md\`.`;
}

export function renderPasteCorpusMarkdown(fixtures: PasteCorpusFixture[]): string {
  const rows = fixtures.map(renderOutcomeRow).join("\n");
  const sections = fixtures.map(renderFixtureSection).join("\n");
  return `# Paste fidelity corpus (IOP2)

Clipboard \`text/html\` + \`text/plain\` pairs measured through the generic HTML import path (\`parseHtmlToBlocks\`). Pen does not sniff \`mso\` classes or \`docs-internal-guid\`. A documented flattening is the paste contract; an undocumented one is a regression.

${renderProvenanceIntro(fixtures)}

Generated from \`src/html/import/__tests__/pasteCorpus/\` by \`src/html/import/__tests__/pasteCorpus.test.ts\`. Do not edit by hand.

## Outcome table

| Source | Provenance | Headings | Lists | Tables | Code | Links | Images | Bold / italic / strike | Colors | Intentional losses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Fixtures

${sections}`;
}

#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const METADATA_PATH = join(
	ROOT,
	"packages/tooling/test/src/fixtures/envelope/metadata.json",
);
const OUTPUT_PATH = join(ROOT, "packages/tooling/test/ENVELOPE.md");

export function renderEnvelopeMarkdown(metadata) {
	const rows = metadata.axes.map((axis) => {
		const verified = formatGrade(axis.verified);
		const measured = axis.measured ? formatGrade(axis.measured) : "—";
		const untested = axis.untestedAbove.display;
		return `| ${axis.label} | ${verified} | ${measured} | ${untested} |`;
	});

	const rungRows = metadata.rungs.map((rung) => {
		const storage =
			rung.storage === "committed"
				? `committed \`${rung.path}\``
				: "generated at runtime";
		return `| \`${rung.id}\` | ${rung.size} | ${storage} |`;
	});

	return `# Scale envelope

Generated from \`packages/tooling/test/src/fixtures/envelope/metadata.json\`. Do not edit by hand. Regenerate with \`node scripts/envelope-table.mjs\`.

Published next to the HOST3 runtime floor (\`${metadata.hostFloor}\`). Rule: ${metadata.ruleId} (\`${metadata.spec}\`).

## Envelope

| Axis | Verified | Measured | Untested above |
| ---- | -------- | -------- | -------------- |
${rows.join("\n")}

Grades: **verified** — a suite asserts behavior at this size on every run. **measured** — a benchmark records it, no pass/fail gate. **untested above** — the honest ceiling.

Verification for the ladder is headless (\`createTestEditor\`). No renderer suite yet asserts these sizes.

## Fixture ladder

| Rung | Size | Storage |
| ---- | ---- | ------- |
${rungRows.join("\n")}

5,000-block and 1,000-row fixtures are generated at runtime rather than committed: a Yjs dump of those sizes is large and adds nothing beyond the generator plus this table. The committed 100-block JSON is the checked-in rung; every other size is produced by the same scripts.

## Past the ceiling

Past these sizes, per-commit decoration collection and full-document render degrade first — Pen does not virtualize (\`spec-v2/07-dom-scheduling.md\`). Hosts that need larger documents window blocks themselves (\`${metadata.virtualization}\`, SCALE5).
`;
}

function formatGrade(cell) {
	return `${cell.display} (${cell.suite})`;
}

const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));
const markdown = renderEnvelopeMarkdown(metadata);

if (process.argv.includes("--stdout")) {
	process.stdout.write(markdown);
} else {
	writeFileSync(OUTPUT_PATH, markdown);
}

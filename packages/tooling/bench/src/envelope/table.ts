import {
	RELATED_FIXTURE_AUDIT,
	SCALE1_FIXTURE_AUDIT,
	type FixtureAuditRow,
} from "../fixtures/audit";
import type { EnvelopePointRecord, EnvelopeRecord } from "./compare";

export function renderEnvelopeMarkdown(record: EnvelopeRecord): string {
	const statusLine =
		record.status === "provisional"
			? `**Status: provisional.** ${record.caveat}`
			: record.caveat;
	const axisRows = renderAxisRows(record);
	const ladderRows = record.points
		.map((point) => renderLadderRow(point))
		.join("\n");
	const auditRows = [...SCALE1_FIXTURE_AUDIT, ...RELATED_FIXTURE_AUDIT]
		.map((row) => renderAuditRow(row))
		.join("\n");

	return `# Scale envelope

Generated from \`packages/tooling/bench/baselines/envelope.json\`. Do not edit by hand. Regenerate with \`pnpm --filter @input/pen-bench exec tsx src/envelope/writeTable.ts\`.

Rule: SCALE1 (\`${record.spec}\`). Grades: **verified** — a suite asserts behavior at this size on every run. **measured** — a benchmark records it, with harness floor subtracted, no pass/fail on the clock. **untested above** — the honest ceiling.

${statusLine}

Wall-clock sample: ${record.producedOn} on ${record.machineClass.replace(/\.$/, "")}. Median of ${record.sampleSize}. Floors: ${record.floorProducedOn}. A row without a floor is not a measurement.

## Fixture audit

Claimed subject versus what the fixture actually does. The last two published defects lived here: a concurrent-peers row whose peer B never received peer A's insert, and a streaming "regression" whose clock was 100 \`setTimeout(0)\` yields.

| Fixture | Claimed | Actual | Verdict |
| ------- | ------- | ------ | ------- |
${auditRows}

## Envelope

| Axis | Verified | Measured | Untested above |
| ---- | -------- | -------- | -------------- |
${axisRows}

Verification for the ladder is headless (\`createTestEditor\`). No renderer suite yet asserts these sizes. Concurrent peers is verified for *survival of both inserts* (\`createTwoPeerHarness\`); the measured clock is A insert + sync, not concurrent A+B.

## Fixture ladder (attributed)

Wall minus harness floor. The block-count rungs are the curve: a single point cannot show drift. \`p95/p50\` is same-run variance on the wall-clock sample.

| Rung | Size | Operation | Wall p50 (ms) | Floor p50 (ms) | Attributed p50 (ms) | p95/p50 | Grade |
| ---- | ---- | --------- | ------------- | -------------- | ------------------- | ------- | ----- |
${ladderRows}

${renderGateNote(record)}

## Past the ceiling

Past these sizes, per-commit decoration collection and full-document render degrade first — Pen does not virtualize (\`spec-v2/07-dom-scheduling.md\`). Hosts that need larger documents window blocks themselves (\`packages/rendering/react/VIRTUALIZATION.md\`, SCALE5).
`;
}

function renderAxisRows(record: EnvelopeRecord): string {
	const block = record.points.filter((point) => point.axis === "blockCount");
	const longest = findPoint(record, "long-block");
	const nesting = findPoint(record, "nesting-10");
	const table = findPoint(record, "table-50x20");
	const peers = findPoint(record, "concurrentPeers-2");
	const largestBlock = block[block.length - 1];
	if (!largestBlock) {
		throw new Error("SCALE1 envelope missing block-count rungs");
	}

	const rows = [
		[
			"Block count",
			"5,000 (`@input/pen-test` SCALE1 `envelopeLadder`)",
			`${block.map((point) => point.size).join(" / ")} (\`@input/pen-bench\` SCALE1 ${block.map((point) => `\`${point.id}\``).join(", ")})`,
			largestBlock.size,
		],
		[
			"Longest single block",
			"100,000 characters (`@input/pen-test` SCALE1 `envelopeLadder`)",
			`${longest.size} (\`@input/pen-bench\` SCALE1 \`long-block\`)`,
			longest.size,
		],
		[
			"Nesting depth",
			"10 (`@input/pen-test` SCALE1 `envelopeLadder`)",
			`${nesting.size} (\`@input/pen-bench\` SCALE1 \`nesting-10\`)`,
			nesting.size,
		],
		[
			"Table",
			"50 × 20 (`@input/pen-test` SCALE1 `envelopeLadder`)",
			`${table.size} (\`@input/pen-bench\` SCALE1 \`table-50x20\`)`,
			table.size,
		],
		[
			"Concurrent peers",
			"2 (`@input/pen-test` `createTwoPeerHarness` + `assertPeerEditsSurvive`)",
			`${peers.size} (\`@input/pen-bench\` SCALE1 \`concurrentPeers-2\`, A insert + sync)`,
			peers.size,
		],
	];

	return rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

function renderLadderRow(point: EnvelopePointRecord): string {
	const grade = point.gated ? "measured (gated)" : "measured (below signal)";
	return `| \`${point.id}\` | ${point.size} | ${point.operation} | ${fmt(point.measuredP50Ms)} | ${fmt(point.floorP50Ms)} (${point.floorKind}) | ${fmt(point.attributedP50Ms)} | ${fmt(point.p95Ratio)} | ${grade} |`;
}

function renderAuditRow(row: FixtureAuditRow): string {
	return `| ${row.fixture} | ${row.claimedSubject} | ${row.actualSubject} | ${row.verdict} |`;
}

function renderGateNote(record: EnvelopeRecord): string {
	const gated = record.points.filter((point) => point.gated);
	const ungated = record.points.filter((point) => !point.gated);
	const gatedList = gated
		.map(
			(point) =>
				`\`${point.id}\` gate ${fmt(point.gateP50Ms ?? Number.NaN)}ms`,
		)
		.join("; ");
	const ungatedList = ungated.map((point) => `\`${point.id}\``).join(", ");
	return `Same-class timing gate: ${record.tolerance.formula}. ${record.tolerance.justification} Gated rungs: ${gatedList || "none"}. Recorded, not gated: ${ungatedList || "none"}. ${record.tolerance.crossClass}`;
}

function findPoint(record: EnvelopeRecord, id: string): EnvelopePointRecord {
	const point = record.points.find((entry) => entry.id === id);
	if (!point) {
		throw new Error(`SCALE1 envelope missing ${id}`);
	}
	return point;
}

function fmt(value: number): string {
	return value.toFixed(2);
}

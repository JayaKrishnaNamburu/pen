#!/usr/bin/env node
/**
 * GATE 0.14 — the `edit_document` channel against the Wave 0 corpus.
 *
 * `--both` is a historical alias; the XML channel is gone and the harness
 * only emits tool-channel rows. Fail-closed: missing flags print usage
 * and exit 1.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "spec-better-ai/evidence/wave-0-corpus.json");
const mdPath = path.join(root, "spec-better-ai/evidence/wave-0-corpus.md");

const args = new Set(process.argv.slice(2));
const both = args.has("--both");
const corpus = args.has("--corpus");

if (!both || !corpus) {
	console.error("usage: node scripts/edit-channel-bench.mjs --both --corpus");
	process.exit(1);
}

mkdirSync(path.dirname(jsonPath), { recursive: true });

const result = spawnSync(
	"pnpm",
	[
		"--filter",
		"@input/pen-ai",
		"test",
		"--",
		"src/__tests__/editChannel.bench.test.ts",
	],
	{
		cwd: root,
		stdio: "inherit",
		env: {
			...process.env,
			EDIT_CHANNEL_BENCH_OUT: jsonPath,
		},
	},
);

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

if (!existsSync(jsonPath)) {
	console.error(`bench wrote no report payload at ${jsonPath}`);
	process.exit(1);
}

const report = JSON.parse(readFileSync(jsonPath, "utf8"));
writeFileSync(mdPath, renderMarkdown(report), "utf8");

if (!existsSync(mdPath)) {
	console.error(`failed to write ${mdPath}`);
	process.exit(1);
}

console.log(`wrote ${mdPath}`);
process.exit(0);

function fmt(value) {
	if (value == null) {
		return "—";
	}
	if (typeof value === "number") {
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}
	return String(value);
}

function mean(values) {
	if (values.length === 0) {
		return 0;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values) {
	return values.reduce((total, value) => total + value, 0);
}

function channelTotals(rows) {
	return {
		postconditionsMet: rows.filter((row) => row.postconditionMet).length,
		wrongEdits: rows.filter((row) => row.wrongEdit).length,
		meanPasses: mean(rows.map((row) => row.modelPasses)),
		toolCalls: sum(rows.map((row) => row.toolCalls)),
		refusals: sum(rows.map((row) => row.refusals)),
		outputChars: sum(rows.map((row) => row.outputChars)),
		wallMs: sum(rows.map((row) => row.wallMs)),
		firstFeedbackMs: mean(
			rows
				.map((row) => row.firstFeedbackMs)
				.filter((value) => value != null),
		),
	};
}

function promptTable(rows) {
	const header = [
		"| Prompt | Postcondition | Passes | Calls | Refusals | Output chars | Wrong-edit | Wall (ms) | First feedback (ms) | Notes |",
		"| ------ | ------------- | ------ | ----- | -------- | ------------ | ---------- | --------- | ------------------- | ----- |",
	];
	const body = rows.map((row) => {
		const notes = [
			row.knownWeak ? "knownWeak" : "",
			row.skipReason ?? "",
			row.postconditionReason && !row.postconditionMet
				? row.postconditionReason
				: "",
		]
			.filter((part) => part.length > 0)
			.join("; ");
		return `| ${row.promptId} | ${row.postconditionMet ? "met" : "miss"} | ${fmt(row.modelPasses)} | ${fmt(row.toolCalls)} | ${fmt(row.refusals)} | ${fmt(row.outputChars)} | ${row.wrongEdit} | ${fmt(row.wallMs)} | ${fmt(row.firstFeedbackMs)} | ${notes || "—"} |`;
	});
	return [...header, ...body].join("\n");
}

function renderMarkdown(report) {
	const rows = report.rows ?? [];
	const tool = rows.filter(
		(row) => row.channel === "tool" && row.promptId !== "off-contract",
	);
	const toolControl = rows.find(
		(row) => row.channel === "tool" && row.promptId === "off-contract",
	);
	const totals = channelTotals(tool);
	const p9 = tool.find((row) => row.promptId === "p9");

	return `# Wave 0 corpus harness (GATE 0.14)

**Scripted model doubles prove the harness, not contract adherence.**

This file is the written report for \`node scripts/edit-channel-bench.mjs --both --corpus\`. The XML channel is retired; only the \`edit_document\` channel remains. These are doubles that already know the intended edit (or honestly skip an inexpressible one). A live model is what Decision Criteria require.

- Generated: ${report.generatedAt}
- \`mutationPreference\`: \`${report.mutationPreference}\` (held constant; Do-Not-Miss)
- Channel: \`edit_document\` (\`tool-edit\`)
- First feedback: first document change or first visible text, whichever comes first (\`performance.now()\` around \`runPrompt\`, plus \`generation.debug\` when present)
- \`wrongEdit\`: the document changed **and** the postcondition is not met. Unchanged + failed postcondition is a miss, not a wrong-edit.

## Totals (${tool.length} corpus prompts)

| Channel | Postconditions met | Wrong-edits | Mean passes | Calls | Refusals | Output chars | Wall (ms) | Mean first feedback (ms) |
| ------- | ------------------ | ----------- | ----------- | ----- | -------- | ------------ | --------- | ------------------------ |
| Tool (\`edit_document\`) | ${totals.postconditionsMet} / ${tool.length} | ${totals.wrongEdits} | ${fmt(totals.meanPasses)} | ${fmt(totals.toolCalls)} | ${fmt(totals.refusals)} | ${fmt(totals.outputChars)} | ${fmt(totals.wallMs)} | ${fmt(totals.firstFeedbackMs)} |

## Per prompt

${promptTable(tool)}

## Off-contract control

Same prose-that-is-not-an-edit as \`editChannel.comparison.test.ts\` (\`Sure! I've turned the last paragraph...\`). This is the column that makes \`wrongEdit\` real.

| Channel | Document changed | Postcondition (p1) | Wrong-edit | Passes | Output chars | Wall (ms) | First feedback (ms) |
| ------- | ---------------- | ------------------ | ---------- | ------ | ------------ | --------- | ------------------- |
| Tool | ${toolControl?.documentChanged ?? "—"} | ${toolControl?.postconditionMet ? "met" : "miss"} | ${toolControl?.wrongEdit ?? "—"} | ${fmt(toolControl?.modelPasses)} | ${fmt(toolControl?.outputChars)} | ${fmt(toolControl?.wallMs)} | ${fmt(toolControl?.firstFeedbackMs)} |

The tool channel must score \`wrongEdit: false\` and no document change.

## Prompt 9 (knownWeak)

Cross-block rename. Left in the table even if it fails (Do-Not-Miss).

- Tool: ${p9?.postconditionMet ? "met" : `miss (${p9?.postconditionReason ?? "no row"})`}

## What this run did not measure

- A live model. Doubles emit the intended \`edit_document\` call; they do not test whether a real model follows the contract.
- Provider time-to-first-token / streaming of partial tool input (EC15). \`firstFeedbackMs\` here is harness-local: one-shot text-delta or the first \`commit\` / \`debug.firstToolResultMs\`.
- Token cost, cache-hit rate, or playground \`dist/\` latency (see \`measurement.md\`).
`;
}

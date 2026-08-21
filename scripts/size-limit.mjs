#!/usr/bin/env node
/**
 * API7 bundle budgets (spec-v2/14-api-and-packaging.md, Wave P step P.7).
 *
 * Weighs each published `dist/index.mjs` against `.size-limit.baseline.json`
 * via `fs.stat` (same method that recorded the numbers). Growth above
 * `regressionPercent` fails. A re-record is a re-record, not a waiver:
 * every entry's `note` must name the wave that added the bytes.
 *
 * `_deferred` is documentation only — deferred packages stay in
 * `entries` at their last quiet baseline so they still fail until a
 * quiet re-record lands. Do not drop an over-budget package from
 * `entries` to go green.
 *
 * Needs built `dist` artifacts (`pnpm build`).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const BASELINE_NAME = ".size-limit.baseline.json";
const WAVE_RE = /\bWave\b/;

export function resolveLimitBytes(entry) {
	if (typeof entry.limitBytes === "number") {
		return entry.limitBytes;
	}
	if (typeof entry.baselineBytes === "number") {
		return entry.baselineBytes;
	}
	throw new Error(`${entry.name} needs limitBytes or baselineBytes.`);
}

export function noteNamesWave(note) {
	return typeof note === "string" && WAVE_RE.test(note);
}

export function evaluateSizeLimit({ baseline, stats }) {
	const regressionPercent = baseline.regressionPercent ?? 10;
	const entries = baseline.entries ?? [];
	const deferred = Array.isArray(baseline._deferred?.packages)
		? baseline._deferred.packages
		: [];
	const deferredNames = new Set(deferred.map((entry) => entry.name));

	if (entries.length === 0) {
		return {
			ok: false,
			regressionPercent,
			rows: [],
			missing: [],
			over: [],
			unattributed: [],
			deferred,
			empty: true,
		};
	}

	const rows = [];
	const missing = [];
	const over = [];
	const unattributed = [];

	for (const entry of entries) {
		const bytes = stats[entry.path];
		const limitBytes = resolveLimitBytes(entry);
		const ceiling = Math.floor(limitBytes * (1 + regressionPercent / 100));
		const attributed = noteNamesWave(entry.note);
		const row = {
			name: entry.name,
			path: entry.path,
			bytes: bytes ?? null,
			limitBytes,
			ceiling,
			deferred: deferredNames.has(entry.name),
			attributed,
		};
		rows.push(row);
		if (bytes == null) {
			missing.push(row);
		} else if (bytes > ceiling) {
			over.push(row);
		}
		if (!attributed) {
			unattributed.push(row);
		}
	}

	return {
		ok:
			missing.length === 0 &&
			over.length === 0 &&
			unattributed.length === 0,
		regressionPercent,
		rows,
		missing,
		over,
		unattributed,
		deferred,
		empty: false,
	};
}

export function formatSizeLimit(result) {
	const lines = ["API7 size-limit"];
	lines.push("");
	for (const row of result.rows) {
		const bytes = row.bytes == null ? "missing" : `${row.bytes} B`;
		const deferred = row.deferred ? "  [deferred]" : "";
		lines.push(
			`size-limit: ${row.name} ${bytes} (budget ${row.limitBytes} B, +${result.regressionPercent}% ceiling ${row.ceiling} B)${deferred}`,
		);
	}
	if (result.empty) {
		lines.push("");
		lines.push("FAIL size-limit: baseline has no entries.");
	}
	if (result.missing.length > 0) {
		lines.push("");
		lines.push("FAIL size-limit: missing artifacts (build the package first):");
		for (const row of result.missing) {
			lines.push(`  ${row.name}  ${row.path}`);
		}
	}
	if (result.over.length > 0) {
		lines.push("");
		lines.push(
			`FAIL size-limit: exceeds the +${result.regressionPercent}% ceiling. Re-record with a Wave-named note if the growth is intended; do not drop the entry.`,
		);
		for (const row of result.over) {
			const mark = row.deferred ? " (deferred; mid-edit, not re-recorded)" : "";
			lines.push(
				`  ${row.name}  ${row.bytes} B > ${row.ceiling} B${mark}`,
			);
		}
	}
	if (result.unattributed.length > 0) {
		lines.push("");
		lines.push(
			"FAIL size-limit: note does not name the Wave that added the bytes (a re-record without attribution is a waiver):",
		);
		for (const row of result.unattributed) {
			lines.push(`  ${row.name}`);
		}
	}
	if (result.deferred.length > 0) {
		lines.push("");
		lines.push(
			`deferred re-records (${result.deferred.length}; still checked against the last quiet baseline):`,
		);
		for (const entry of result.deferred) {
			lines.push(`  ${entry.name}  ${entry.reason}`);
		}
	}
	if (result.ok) {
		lines.push("");
		lines.push(
			`OK: ${result.rows.length} packages within +${result.regressionPercent}%; every note names a Wave.`,
		);
	}
	return lines.join("\n");
}

export function runSelfTests() {
	const healthy = evaluateSizeLimit({
		baseline: {
			regressionPercent: 10,
			entries: [
				{
					name: "@input/pen-shortcuts",
					path: "packages/extensions/shortcuts/dist/index.mjs",
					baselineBytes: 100,
					note: "Wave 4: keymap facet. 80 → 100.",
				},
			],
		},
		stats: { "packages/extensions/shortcuts/dist/index.mjs": 100 },
	});
	if (!healthy.ok) {
		throw new Error("self-test: attributed in-budget entry must pass");
	}

	const missingBaseline = evaluateSizeLimit({
		baseline: { regressionPercent: 10, entries: [] },
		stats: {},
	});
	if (missingBaseline.ok || !missingBaseline.empty) {
		throw new Error("self-test: empty entries must fail closed");
	}

	const missingArtifact = evaluateSizeLimit({
		baseline: {
			regressionPercent: 10,
			entries: [
				{
					name: "@input/pen-core",
					path: "packages/core/dist/index.mjs",
					baselineBytes: 100,
					note: "Wave P.7 first baseline.",
				},
			],
		},
		stats: {},
	});
	if (
		missingArtifact.ok ||
		missingArtifact.missing[0]?.name !== "@input/pen-core"
	) {
		throw new Error("self-test: missing artifact must fail by name");
	}

	const over = evaluateSizeLimit({
		baseline: {
			regressionPercent: 10,
			entries: [
				{
					name: "@input/pen-ai-tools",
					path: "packages/extensions/ai-tools/dist/index.mjs",
					baselineBytes: 100,
					note: "Wave M AIB3 tool authority. 100 → 400.",
				},
			],
		},
		stats: { "packages/extensions/ai-tools/dist/index.mjs": 400 },
	});
	if (over.ok || over.over[0]?.name !== "@input/pen-ai-tools") {
		throw new Error("self-test: over-ceiling must fail by name");
	}

	const waiver = evaluateSizeLimit({
		baseline: {
			regressionPercent: 10,
			entries: [
				{
					name: "@input/pen-types",
					path: "packages/types/dist/index.mjs",
					baselineBytes: 100,
					note: "Measured from packages/types/dist/index.mjs after a local build.",
				},
			],
		},
		stats: { "packages/types/dist/index.mjs": 100 },
	});
	if (waiver.ok || waiver.unattributed[0]?.name !== "@input/pen-types") {
		throw new Error(
			"self-test: a note without Wave must fail (re-record without attribution is a waiver)",
		);
	}

	if (noteNamesWave("Wave P.7 first baseline.") !== true) {
		throw new Error("self-test: Wave P.7 counts");
	}
	if (noteNamesWave("Measured from dist.") !== false) {
		throw new Error("self-test: unattributed measured-from note fails");
	}
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot };
}

async function loadBaseline(repoRoot) {
	const baselinePath = path.join(repoRoot, BASELINE_NAME);
	try {
		return JSON.parse(await fs.readFile(baselinePath, "utf8"));
	} catch (error) {
		if (error && error.code === "ENOENT") {
			console.error(`size-limit: missing ${BASELINE_NAME}`);
			process.exitCode = 1;
			return null;
		}
		throw error;
	}
}

async function collectStats(repoRoot, entries) {
	const stats = {};
	for (const entry of entries) {
		try {
			stats[entry.path] = (await fs.stat(path.join(repoRoot, entry.path)))
				.size;
		} catch (error) {
			if (error && error.code === "ENOENT") {
				continue;
			}
			throw error;
		}
	}
	return stats;
}

async function main() {
	runSelfTests();
	console.log("API7 size-limit self-test ok");
	console.log(
		"  red-proof: missing artifact, over-ceiling, empty entries, and unattributed note fail closed",
	);

	const args = parseArgs(process.argv.slice(2));
	const baseline = await loadBaseline(args.repoRoot);
	if (baseline == null) {
		return;
	}
	const stats = await collectStats(args.repoRoot, baseline.entries ?? []);
	const result = evaluateSizeLimit({ baseline, stats });
	console.log("");
	console.log(formatSizeLimit(result));
	if (!result.ok) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}

import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPg1Cli } from "../anchors/cli";
import {
	comparePg1Records,
	formatPg1Compare,
	loadPg1Record,
	pg1BaselinePath,
} from "../anchors/compare";
import {
	PG1_MISSING,
	PG1_TEN_K_CONTENT_SHA256,
	PG1_TEN_K_SEED,
} from "../anchors/constants";
import { measurePg1Counts, measurePg1Record } from "../anchors/measure";
import type { Pg1AnchorBudgetRecord } from "../anchors/types";
import {
	ANCHOR_BLOCK_COUNT,
	ANCHOR_CELL_COUNT,
	ANCHOR_ENCODE_COUNT,
} from "../fixtures/anchors";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function poisonEncodeCount(
	record: Pg1AnchorBudgetRecord,
	count: number,
): Pg1AnchorBudgetRecord {
	return {
		...record,
		counts: {
			...record.counts,
			encodeSize: { ...record.counts.encodeSize, count },
		},
		versusSpec: {
			...record.versusSpec,
			"anchors.encode-size-1000.encodeCount": {
				...record.versusSpec["anchors.encode-size-1000.encodeCount"]!,
				measured: count,
				blown: count !== ANCHOR_ENCODE_COUNT,
			},
		},
	};
}

describe("PG1 anchor budget gate", () => {
	it("committed baseline exists and names the 10k fixture", async () => {
		const record = await loadPg1Record();
		expect(record.ruleId).toBe("PG1");
		expect(record.schemaVersion).toBe(1);
		expect(record.fixture.seed).toBe(PG1_TEN_K_SEED);
		expect(record.fixture.contentSha256).toBe(PG1_TEN_K_CONTENT_SHA256);
		expect(record.protocol.clientID).toBe(0);
		expect(record.protocol.clientIDNote).toMatch(/clientID 0 ONLY/);
		expect(record.protocol.liveCountNote).toMatch(
			/mint \/ deserialize \/ remint/,
		);
		expect(record.environment.loadavg1).toEqual(expect.any(Number));
	});

	it("live counts match the committed baseline", () => {
		const live = measurePg1Counts();
		expect(live.encodeSize.count).toBe(ANCHOR_ENCODE_COUNT);
		expect(live.encodeSize.minBytes).toBe(4);
		expect(live.encodeSize.p50Bytes).toBe(6);
		expect(live.encodeSize.p95Bytes).toBe(6);
		expect(live.encodeSize.maxBytes).toBe(6);
		expect(live.encodeSizeCell.count).toBe(ANCHOR_ENCODE_COUNT);
		expect(live.resolve70k.resolveCount).toBe(ANCHOR_ENCODE_COUNT);
		expect(live.resolve70k.nullCount).toBe(0);
		expect(live.resolve200Blocks.resolveCount).toBe(ANCHOR_BLOCK_COUNT);
		expect(live.resolve200Cells.resolveCount).toBe(ANCHOR_CELL_COUNT);
		expect(live.splitFollow.stuckCount).toBe(2);
		expect(live.cellInBlockEdit.insertOnCell).toBe(1);
		expect(live.cellInBlockEdit.tableHasContent).toBe(0);
	});

	it("compare fails by name when encodeCount is a no-op", async () => {
		const committed = await loadPg1Record();
		const fresh = poisonEncodeCount(committed, 0);
		const compared = comparePg1Records(fresh, committed);
		expect(compared.ok).toBe(false);
		expect(compared.population).toBeGreaterThan(0);
		const report = formatPg1Compare(compared);
		expect(report).toMatch(/PG1 population: \d+ enforced versusSpec rows/);
		expect(report).toMatch(
			/PG1 anchors\.encode-size-1000\.encodeCount: 0 !== 1000/,
		);
	});

	it("CLI --fresh with a bad artifact exits 1 by name", async () => {
		const committed = await loadPg1Record();
		const dir = await mkdtemp(join(tmpdir(), "pen-pg1-"));
		const freshPath = join(dir, "bad.json");
		await writeFile(
			freshPath,
			`${JSON.stringify(poisonEncodeCount(committed, 0), null, "\t")}\n`,
			"utf8",
		);
		const code = await runPg1Cli(["--compare", "--fresh", freshPath]);
		expect(code).toBe(1);
	});

	it("CLI process exits 1 by name when the baseline file is missing", async () => {
		const missing = join(tmpdir(), "pen-pg1-missing.json");
		const code = await runPg1Cli(["--compare", "--fresh", missing]);
		expect(code).toBe(1);
		const spawned = spawnSync(
			"pnpm",
			[
				"exec",
				"tsx",
				"src/anchors/run.cli.ts",
				"--compare",
				"--fresh",
				missing,
			],
			{ encoding: "utf8", cwd: pkgRoot },
		);
		expect(spawned.status).not.toBe(0);
		expect(`${spawned.stdout}${spawned.stderr}`).toContain(PG1_MISSING);
		expect(`${spawned.stdout}${spawned.stderr}`).toContain(missing);
	});

	it("a live record against itself passes and prints the population", () => {
		const live = measurePg1Record();
		const compared = comparePg1Records(live, live);
		expect(compared.ok).toBe(true);
		expect(compared.population).toBeGreaterThan(0);
		expect(formatPg1Compare(compared)).toMatch(
			`PG1 population: ${compared.population} enforced versusSpec rows`,
		);
		const clocks = Object.entries(live.versusSpec).filter(
			([, entry]) => !entry.enforced,
		);
		expect(clocks.length).toBeGreaterThan(0);
		expect(clocks.every(([, entry]) => entry.enforced === false)).toBe(
			true,
		);
	});

	it("committed baseline path is the named file", () => {
		expect(pg1BaselinePath()).toMatch(/v3-anchor-budget\.chromium\.json$/);
	});
});

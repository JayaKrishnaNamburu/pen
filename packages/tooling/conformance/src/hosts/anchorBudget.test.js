/**
 * PG1 count gate. The committed artifact lives in @input/pen-bench.
 * A missing file or a poisoned encodeCount must fail by name.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	comparePg1Counts,
	formatPg1Compare,
	isPg1Record,
	PG1_MISSING,
	PG1_POPULATION,
} from "../anchorBudget.js";

const BASELINE_URL = new URL(
	"../../../bench/baselines/v3-anchor-budget.chromium.json",
	import.meta.url,
);

function readBaseline() {
	const path = fileURLToPath(BASELINE_URL);
	if (!existsSync(path)) {
		throw new Error(`${PG1_MISSING}: ${path}`);
	}
	return JSON.parse(readFileSync(path, "utf8"));
}

test("PG1 baseline file must exist and is a PG1 record", () => {
	const path = fileURLToPath(BASELINE_URL);
	assert.equal(existsSync(path), true, `${PG1_MISSING}: ${path}`);
	const baseline = readBaseline();
	assert.equal(
		isPg1Record(baseline),
		true,
		"committed file is not a PG1 record",
	);
	assert.equal(baseline.fixture.seed, 0x70656e33);
	assert.equal(baseline.protocol.clientID, 0);
	const rows = Object.entries(baseline.versusSpec).filter(
		([, entry]) => entry.enforced === true,
	);
	console.log(
		`PG1 population: ${rows.length} enforced versusSpec rows in ${path}`,
	);
	assert.ok(rows.length > 0, `PG1 ${PG1_POPULATION}: 0 !== >=1`);
});

test("PG1 compare fails by name when encodeCount is a no-op", () => {
	const committed = readBaseline();
	const fresh = JSON.parse(JSON.stringify(committed));
	fresh.versusSpec["anchors.encode-size-1000.encodeCount"] = {
		...fresh.versusSpec["anchors.encode-size-1000.encodeCount"],
		measured: 0,
		blown: true,
	};
	const compared = comparePg1Counts(fresh, committed);
	assert.equal(compared.ok, false);
	assert.ok(compared.population > 0, `PG1 ${PG1_POPULATION} must be printed`);
	const report = formatPg1Compare(compared);
	assert.match(report, /PG1 population: \d+ enforced versusSpec rows/);
	assert.match(
		report,
		/PG1 anchors\.encode-size-1000\.encodeCount: 0 !== 1000/,
	);
});

test("PG1 compare passes the committed artifact against itself", () => {
	const committed = readBaseline();
	const compared = comparePg1Counts(committed, committed);
	assert.equal(compared.ok, true, formatPg1Compare(compared));
	console.log(formatPg1Compare(compared));
});

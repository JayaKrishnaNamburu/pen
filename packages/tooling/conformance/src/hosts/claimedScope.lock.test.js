/**
 * Lock: coverage:rules can fail a missing claim only when claimed-scope
 * is non-empty. An empty claimed-scope is a reporter wearing a gate's name.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	evaluateCoverage,
	parseClaimedScope,
} from "../../../../../scripts/coverage-rules.mjs";

const claimedScopePath = fileURLToPath(
	new URL("../../../../../scripts/claimed-scope.txt", import.meta.url),
);

test("claimed-scope is non-empty so a missing claim can fail", () => {
	const claimedIds = parseClaimedScope(readFileSync(claimedScopePath, "utf8"));
	assert.ok(
		claimedIds.length > 0,
		`scripts/claimed-scope.txt population is empty (${claimedScopePath})`,
	);
	console.log(
		`scripts/claimed-scope.txt → ${claimedIds.length} claimed IDs`,
	);

	const emptyGate = evaluateCoverage({
		specIds: new Set(["X1"]),
		claimedIds: [],
		claims: new Map(),
	});
	assert.deepEqual(
		emptyGate.claimedUnclaimed,
		[],
		"empty claimed-scope cannot fail on a missing claim",
	);

	const missing = evaluateCoverage({
		specIds: new Set(["X1"]),
		claimedIds: ["X1"],
		claims: new Map(),
	});
	assert.deepEqual(missing.claimedUnclaimed, ["X1"]);

	const claimed = evaluateCoverage({
		specIds: new Set(["X1"]),
		claimedIds: ["X1"],
		claims: new Map([["X1", ["packages/tooling/conformance/src/hosts/claimedScope.lock.test.js"]]]),
	});
	assert.deepEqual(claimed.claimedUnclaimed, []);
	assert.equal(claimed.claimedOk.length, 1);
});

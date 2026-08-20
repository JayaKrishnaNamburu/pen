import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("LOC1: default catalogs have no missing or dead keys", () => {
	const script = fileURLToPath(
		new URL("../../../../../scripts/catalog-check.mjs", import.meta.url),
	);
	const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /LOC1: catalog completeness ok/);
});

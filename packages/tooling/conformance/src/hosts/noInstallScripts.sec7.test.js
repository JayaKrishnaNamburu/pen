import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("SEC7: published manifests have no preinstall/postinstall", () => {
	const script = fileURLToPath(
		new URL("../../../../../scripts/no-install-scripts.mjs", import.meta.url),
	);
	const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /SEC7: no published manifest/);
});

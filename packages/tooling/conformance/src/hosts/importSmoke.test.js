import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("HOST2: Node-import smoke over every published exports path plus headless construct", () => {
	const run = fileURLToPath(new URL("./run.js", import.meta.url));
	const result = spawnSync(process.execPath, [run], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /HOST2: suite green/);
});

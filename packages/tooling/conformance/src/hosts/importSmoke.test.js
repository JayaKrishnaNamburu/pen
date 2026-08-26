import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverPublishedExportPaths } from "./discover.js";

test("HOST2: Node-import smoke over every published exports path plus headless construct", () => {
	const run = fileURLToPath(new URL("./run.js", import.meta.url));
	const result = spawnSync(process.execPath, [run], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /HOST2: suite green/);
});

test("HOST2: every discovered published package is a declared dependency", () => {
	const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
	const entries = discoverPublishedExportPaths(repoRoot);
	const discovered = [
		...new Set(entries.map((entry) => entry.packageName)),
	].sort();

	const manifest = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	);
	const declared = new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.devDependencies ?? {}),
	]);

	const missing = discovered.filter((name) => !declared.has(name));
	assert.equal(
		missing.length,
		0,
		`HOST2: discovered but undeclared: ${missing.join(", ")}`,
	);
	console.log(
		`HOST2: ${discovered.length} discovered packages are declared dependencies`,
	);
});

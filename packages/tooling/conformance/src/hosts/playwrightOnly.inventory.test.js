/**
 * Honest inventory: `pnpm test` is the Node host glob. Playwright
 * scenarios and the DOM wrappers they call are a different population.
 * Leaving that implicit is how standing checks read as covered.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const hostsDir = fileURLToPath(new URL(".", import.meta.url));

function listFiles(root, predicate) {
	const found = [];
	function walk(dir) {
		for (const entry of readdirSync(dir)) {
			if (entry === "node_modules" || entry === "test-results") {
				continue;
			}
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
				continue;
			}
			if (predicate(entry, full)) {
				found.push(relative(packageRoot, full));
			}
		}
	}
	walk(root);
	return found.sort();
}

test("pnpm test is src/hosts/*.test.js; Playwright specs are a separate population", () => {
	const hostTests = listFiles(hostsDir, (name) => name.endsWith(".test.js"));
	const scenarioSpecs = listFiles(
		join(packageRoot, "scenarios"),
		(name) => name.endsWith(".spec.ts"),
	);
	const suiteSpecs = listFiles(
		join(packageRoot, "suites"),
		(name) => name.endsWith(".spec.ts"),
	);
	const playwrightSpecs = [...scenarioSpecs, ...suiteSpecs];

	assert.ok(
		hostTests.length > 0,
		`host glob src/hosts/*.test.js matched ${hostTests.length} files: ${hostTests.join(", ")}`,
	);
	assert.ok(
		playwrightSpecs.length > 0,
		`Playwright glob scenarios/**/*.spec.ts + suites/**/*.spec.ts matched ${playwrightSpecs.length} files`,
	);
	assert.equal(
		hostTests.includes("src/hosts/playwrightOnly.inventory.test.js"),
		true,
		`host population missing this file: ${hostTests.join(", ")}`,
	);

	const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	assert.match(manifest.scripts.test, /src\/hosts\/\*\.test\.js/);
	assert.doesNotMatch(manifest.scripts.test, /playwright/);
	assert.doesNotMatch(manifest.scripts.test, /scenarios/);
	assert.match(manifest.scripts["test:chromium"], /playwright test/);

	const hostSources = hostTests.map((rel) =>
		readFileSync(join(packageRoot, rel), "utf8"),
	);
	const hostImports = hostSources.join("\n");
	assert.doesNotMatch(
		hostImports,
		/from ["']\.\.\/standingAssertions["']/,
		"Node hosts must not import Playwright standingAssertions",
	);
	assert.doesNotMatch(
		hostImports,
		/from ["']\.\.\/axeSurface["']/,
		"Node hosts must not import Playwright axeSurface",
	);
	assert.doesNotMatch(
		hostImports,
		/from ["'].*harness\/src\/geometry["']/,
		"Node hosts must not import harness/src/geometry.ts",
	);
	assert.doesNotMatch(
		hostImports,
		/from ["'].*harness\/src\/session["']/,
		"Node hosts must not import harness/src/session.ts",
	);

	assert.equal(
		playwrightSpecs.length,
		30,
		`Playwright spec population drifted: ${playwrightSpecs.join(", ")}`,
	);
});

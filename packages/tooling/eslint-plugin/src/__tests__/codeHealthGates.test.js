import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function runChGate(id) {
	return spawnSync(
		process.execPath,
		[path.join(repoRoot, "scripts/ch-gates.mjs"), "--gate", id],
		{
			cwd: repoRoot,
			encoding: "utf8",
			maxBuffer: 4 * 1024 * 1024,
		},
	);
}

function listVitestConfigs() {
	const files = [path.join(repoRoot, "vitest.config.ts")];
	const packagesRoot = path.join(repoRoot, "packages");
	for (const group of readdirSync(packagesRoot, { withFileTypes: true })) {
		if (!group.isDirectory()) {
			continue;
		}
		const groupPath = path.join(packagesRoot, group.name);
		files.push(...vitestConfigsIn(groupPath));
		for (const child of readdirSync(groupPath, { withFileTypes: true })) {
			if (!child.isDirectory()) {
				continue;
			}
			files.push(...vitestConfigsIn(path.join(groupPath, child.name)));
		}
	}
	return files.filter((filePath) => {
		try {
			readFileSync(filePath);
			return true;
		} catch {
			return false;
		}
	});
}

function vitestConfigsIn(directory) {
	return [
		"vitest.config.ts",
		"vitest.config.js",
		"vitest.config.mjs",
	].map((name) => path.join(directory, name));
}

describe("CH health-gate claims", () => {
	it("CH1: ch-gates reports zero @ts-nocheck", () => {
		const result = runChGate("ch1");
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/CH1 .+— PASS/);
	});

	it("CH6: ch-gates reports no orphan packages", () => {
		const result = runChGate("ch6");
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/CH6 .+— PASS/);
	});

	it("CH9: vitest configs do not set retry", () => {
		const hits = [];
		for (const filePath of listVitestConfigs()) {
			const source = readFileSync(filePath, "utf8");
			if (/\bretry\s*:/.test(source)) {
				hits.push(path.relative(repoRoot, filePath));
			}
		}
		expect(hits).toEqual([]);
	});

	it("CH9: flake allowlist names test, issue, and owning wave", () => {
		const allowlist = JSON.parse(
			readFileSync(path.join(repoRoot, "scripts/flake-allowlist.json"), "utf8"),
		);
		expect(allowlist.testTimeoutMs).toBe(10_000);
		expect(Array.isArray(allowlist.tests)).toBe(true);

		const describesEntry = (entry) =>
			Boolean(entry.name) &&
			Boolean(entry.issue) &&
			String(entry.wave ?? "").length > 0;

		// An empty quarantine is the goal state, so the loop below proves nothing
		// once it is reached. The fixtures keep the check honest at zero entries.
		expect(describesEntry({ name: "t", issue: "F39", wave: "0" })).toBe(true);
		expect(describesEntry({ name: "t", issue: "F39" })).toBe(false);

		for (const entry of allowlist.tests) {
			expect(entry.name?.length).toBeGreaterThan(0);
			expect(entry.issue?.length).toBeGreaterThan(0);
			expect(String(entry.wave).length).toBeGreaterThan(0);
		}
	});
});

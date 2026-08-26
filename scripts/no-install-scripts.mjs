#!/usr/bin/env node
/**
 * SEC7: published packages must not declare install-time lifecycle
 * scripts (preinstall, install, postinstall, prepare). Those run on
 * consumer install. Publish-only hooks (prepublish, prepack) are
 * outside this check.
 *
 * Fail-closed: a missing `packages/` tree, or a walk that finds zero
 * published manifests, is a skip of nothing and exits 1 by name.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const banned = ["preinstall", "install", "postinstall", "prepare"];
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(SCRIPT_DIR, "..");

export function collectInstallScriptHits(packagesRoot) {
	const hits = [];
	const published = [];

	function walk(dir) {
		let names;
		try {
			names = readdirSync(dir);
		} catch (error) {
			if (error && error.code === "ENOENT") {
				return { missingRoot: true };
			}
			throw error;
		}
		for (const name of names) {
			if (name === "node_modules" || name === "dist") continue;
			const full = join(dir, name);
			if (statSync(full).isDirectory()) {
				walk(full);
				continue;
			}
			if (name === "package.json") visit(full);
		}
		return { missingRoot: false };
	}

	function visit(file) {
		const pkg = JSON.parse(readFileSync(file, "utf8"));
		if (pkg.private === true) return;
		published.push(file);
		const scripts = pkg.scripts ?? {};
		for (const key of banned) {
			if (Object.hasOwn(scripts, key)) {
				hits.push(`${file}: scripts.${key}`);
			}
		}
	}

	const walked = walk(packagesRoot);
	return {
		hits,
		publishedCount: published.length,
		missingRoot: walked.missingRoot === true,
	};
}

export function evaluateInstallScripts(result) {
	if (result.missingRoot) {
		return {
			ok: false,
			reason: "SEC7: missing packages/ (skip of nothing)",
		};
	}
	if (result.publishedCount === 0) {
		return {
			ok: false,
			reason: "SEC7: no published manifests under packages/ (skip of nothing)",
		};
	}
	if (result.hits.length > 0) {
		return { ok: false, reason: "SEC7: published manifests declare install-time scripts" };
	}
	return { ok: true, reason: null };
}

export function runSelfTests() {
	const empty = evaluateInstallScripts({
		hits: [],
		publishedCount: 0,
		missingRoot: false,
	});
	if (empty.ok || !/no published manifests/.test(empty.reason)) {
		throw new Error("self-test: zero published manifests must fail by name");
	}

	const missing = evaluateInstallScripts({
		hits: [],
		publishedCount: 0,
		missingRoot: true,
	});
	if (missing.ok || !/missing packages\//.test(missing.reason)) {
		throw new Error("self-test: missing packages/ must fail by name");
	}

	const bannedHit = evaluateInstallScripts({
		hits: ["/tmp/pkg/package.json: scripts.postinstall"],
		publishedCount: 1,
		missingRoot: false,
	});
	if (bannedHit.ok || !/install-time scripts/.test(bannedHit.reason)) {
		throw new Error("self-test: a postinstall hit must fail by name");
	}

	const healthy = evaluateInstallScripts({
		hits: [],
		publishedCount: 35,
		missingRoot: false,
	});
	if (!healthy.ok) {
		throw new Error("self-test: a non-empty clean scan must pass");
	}
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = argv[i + 1] ?? "";
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot };
}

function main() {
	runSelfTests();
	console.log("SEC7 no-install-scripts self-test ok");
	console.log(
		"  red-proof: missing packages/, zero published manifests, and postinstall fail closed",
	);

	const args = parseArgs(process.argv.slice(2));
	const collected = collectInstallScriptHits(join(args.repoRoot, "packages"));
	const result = evaluateInstallScripts(collected);
	if (!result.ok) {
		console.error(result.reason);
		if (collected.hits.length > 0) {
			for (const hit of collected.hits) console.error(`  ${hit}`);
		}
		process.exitCode = 1;
		return;
	}
	console.log(
		`SEC7: no published manifest declares preinstall/install/postinstall/prepare (${collected.publishedCount} published)`,
	);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}

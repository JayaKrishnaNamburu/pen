#!/usr/bin/env node
/**
 * Clean-install fixture for `@input/pen-core` (the clean-install proof).
 *
 * A consumer who installs `@input/pen-core` alone must receive zero
 * extension / feature / renderer / preset packages. The production
 * `@input/pen-*` closure is exactly core → crdt-yjs → types.
 *
 * Asserts against published package.json manifests (dependencies,
 * optionalDependencies, and required @input/pen-* peers), walked
 * transitively. That is the graph an installer reads. It is not a
 * workspace node_modules walk (hoisting would make every package
 * look installed) and it is not a lockfile walk of this repo (the
 * workspace lockfile lists the whole train). A real temp `pnpm
 * install` of packed tarballs would prove published-artifact
 * fidelity; that belongs on the release path, not per-PR CI.
 *
 * Separate from `dag-check.mjs` on purpose: the DAG check is
 * allowlist-aware layer inversions. This fixture has no allowlist.
 * Re-adding a core → feature edge and listing it in dag-allowlist
 * keeps the DAG check green and must still fail here.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	layerForPackageDir,
	workspaceDependencyNames,
} from "./dag-check.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const WORKSPACE_SCOPE = "@input/pen-";
const CORE_PACKAGE = "@input/pen-core";
const CORE_STACK_LAYERS = new Set(["types", "crdt", "core"]);

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

/**
 * Production edges a consumer install follows. DevDependencies are
 * excluded (core's tests still import `@input/pen-undo`). Optional
 * peers are excluded. optionalDependencies are included: npm and
 * pnpm install them for the consumer and ignore failure.
 */
export function consumerDependencyNames(packageJson) {
	const names = new Set(workspaceDependencyNames(packageJson));
	for (const name of Object.keys(packageJson.optionalDependencies ?? {})) {
		if (name.startsWith(WORKSPACE_SCOPE)) {
			names.add(name);
		}
	}
	return [...names].sort();
}

export function productionClosure({ packages, start = CORE_PACKAGE }) {
	const byName = new Map();
	for (const pkg of packages) {
		byName.set(pkg.name, {
			...pkg,
			layer: pkg.layer ?? layerForPackageDir(pkg.dir),
		});
	}

	if (!byName.has(start)) {
		throw new Error(
			`${start} is not a published workspace package under packages/`,
		);
	}

	const reachable = new Map();
	const queue = [start];
	reachable.set(start, { via: null, pkg: byName.get(start) });

	while (queue.length > 0) {
		const name = queue.shift();
		const pkg = byName.get(name);
		if (pkg == null) {
			continue;
		}
		for (const depName of pkg.dependencies) {
			if (reachable.has(depName)) {
				continue;
			}
			reachable.set(depName, {
				via: name,
				pkg: byName.get(depName) ?? null,
			});
			queue.push(depName);
		}
	}

	return { byName, reachable };
}

export function evaluateCoreCleanInstall({
	packages,
	start = CORE_PACKAGE,
}) {
	const { reachable } = productionClosure({ packages, start });
	const pulled = [];

	for (const [name, info] of reachable) {
		if (name === start) {
			continue;
		}
		const layer = info.pkg?.layer;
		if (layer != null && CORE_STACK_LAYERS.has(layer)) {
			continue;
		}
		pulled.push({
			name,
			via: info.via,
			layer: layer ?? "unknown",
			dir: info.pkg?.dir ?? null,
		});
	}

	pulled.sort((left, right) => left.name.localeCompare(right.name));

	const viaByName = new Map(
		[...reachable.entries()].map(([name, info]) => [name, info.via]),
	);
	const closure = [...reachable.keys()].sort();
	return {
		pulled,
		closure,
		viaByName,
		ok: pulled.length === 0,
	};
}

export function formatReport(result) {
	const lines = ["@input/pen-core clean-install closure"];
	lines.push("");
	lines.push(`Production @input/pen-* closure: ${result.closure.join(", ")}`);

	if (result.pulled.length > 0) {
		lines.push("");
		lines.push(
			"FAIL installing @input/pen-core would pull packages outside the core stack (types / crdt / core):",
		);
		for (const entry of result.pulled) {
			lines.push(
				`  ${entry.name}  (${entry.layer}${entry.dir ? `, ${entry.dir}` : ""})`,
			);
			lines.push(`    ${closurePath(result.viaByName, entry.name)}`);
		}
		return lines.join("\n");
	}

	lines.push("");
	lines.push(
		"OK: installing @input/pen-core pulls zero extension packages (closure is core, crdt-yjs, types).",
	);
	return lines.join("\n");
}

function closurePath(viaByName, name) {
	const parts = [];
	let current = name;
	const seen = new Set();
	while (current != null && !seen.has(current)) {
		seen.add(current);
		parts.push(current);
		current = viaByName.get(current) ?? null;
	}
	return parts.reverse().join(" → ");
}

export function runSelfTests() {
	const types = fixturePkg("packages/types", "@input/pen-types", []);
	const crdt = fixturePkg("packages/crdt/yjs", "@input/pen-crdt-yjs", [
		"@input/pen-types",
	]);
	const core = fixturePkg("packages/core", "@input/pen-core", [
		"@input/pen-types",
		"@input/pen-crdt-yjs",
	]);
	const undo = fixturePkg("packages/extensions/undo", "@input/pen-undo", [
		"@input/pen-types",
	]);
	const shortcuts = fixturePkg(
		"packages/extensions/shortcuts",
		"@input/pen-shortcuts",
		["@input/pen-core", "@input/pen-types"],
	);

	const healthy = evaluateCoreCleanInstall({
		packages: [types, crdt, core, undo, shortcuts],
	});
	assert(healthy.ok, "self-test: healthy core stack must pass");
	assert(
		healthy.closure.join(",") ===
			"@input/pen-core,@input/pen-crdt-yjs,@input/pen-types",
		"self-test: healthy closure must be core, crdt-yjs, types",
	);

	const topLevel = evaluateCoreCleanInstall({
		packages: [
			types,
			crdt,
			{
				...core,
				dependencies: [...core.dependencies, "@input/pen-undo"],
			},
			undo,
			shortcuts,
		],
	});
	assert(!topLevel.ok, "self-test: core → undo must fail");
	assert(
		topLevel.pulled.some((entry) => entry.name === "@input/pen-undo"),
		"self-test: core → undo must name undo",
	);
	assert(
		topLevel.pulled.some(
			(entry) =>
				entry.name === "@input/pen-undo" &&
				entry.via === "@input/pen-core",
		),
		"self-test: core → undo is a direct edge",
	);

	const transitive = evaluateCoreCleanInstall({
		packages: [
			types,
			{
				...crdt,
				dependencies: [...crdt.dependencies, "@input/pen-undo"],
			},
			core,
			undo,
			shortcuts,
		],
	});
	assert(!transitive.ok, "self-test: crdt-yjs → undo must fail");
	assert(
		transitive.pulled.some(
			(entry) =>
				entry.name === "@input/pen-undo" &&
				entry.via === "@input/pen-crdt-yjs",
		),
		"self-test: transitive extension through crdt-yjs must be reported",
	);

	const fromManifest = evaluateCoreCleanInstall({
		packages: [
			fixtureFromManifest("packages/types", {
				name: "@input/pen-types",
				devDependencies: { vitest: "^3.0.7" },
			}),
			fixtureFromManifest("packages/crdt/yjs", {
				name: "@input/pen-crdt-yjs",
				dependencies: { "@input/pen-types": "workspace:^" },
				peerDependencies: { yjs: "^13.6" },
			}),
			fixtureFromManifest("packages/core", {
				name: "@input/pen-core",
				dependencies: {
					"@input/pen-crdt-yjs": "workspace:^",
					"@input/pen-types": "workspace:^",
				},
				devDependencies: {
					"@input/pen-undo": "workspace:^",
				},
			}),
			fixtureFromManifest("packages/extensions/undo", {
				name: "@input/pen-undo",
				dependencies: { "@input/pen-types": "workspace:^" },
			}),
		],
	});
	assert(
		fromManifest.ok,
		"self-test: undo as a core devDependency must not fail a healthy tree",
	);

	const optionalPeer = evaluateCoreCleanInstall({
		packages: [
			types,
			crdt,
			fixtureFromManifest("packages/core", {
				name: "@input/pen-core",
				dependencies: {
					"@input/pen-crdt-yjs": "workspace:^",
					"@input/pen-types": "workspace:^",
				},
				peerDependencies: {
					"@input/pen-undo": "workspace:^",
				},
				peerDependenciesMeta: {
					"@input/pen-undo": { optional: true },
				},
			}),
			undo,
		],
	});
	assert(
		optionalPeer.ok,
		"self-test: optional peer on an extension must not be an install edge",
	);

	const requiredPeer = evaluateCoreCleanInstall({
		packages: [
			types,
			crdt,
			fixtureFromManifest("packages/core", {
				name: "@input/pen-core",
				dependencies: {
					"@input/pen-crdt-yjs": "workspace:^",
					"@input/pen-types": "workspace:^",
				},
				peerDependencies: {
					"@input/pen-undo": "workspace:^",
				},
			}),
			undo,
		],
	});
	assert(
		!requiredPeer.ok,
		"self-test: required peer on an extension must fail",
	);

	const optionalDep = evaluateCoreCleanInstall({
		packages: [
			types,
			crdt,
			fixtureFromManifest("packages/core", {
				name: "@input/pen-core",
				dependencies: {
					"@input/pen-crdt-yjs": "workspace:^",
					"@input/pen-types": "workspace:^",
				},
				optionalDependencies: {
					"@input/pen-undo": "workspace:^",
				},
			}),
			undo,
		],
	});
	assert(
		!optionalDep.ok,
		"self-test: optionalDependency on an extension must fail (consumers receive it)",
	);

	const missing = evaluateCoreCleanInstall({
		packages: [
			types,
			crdt,
			{
				...core,
				dependencies: [
					...core.dependencies,
					"@input/pen-not-a-real-extension",
				],
			},
		],
	});
	assert(
		!missing.ok &&
			missing.pulled.some(
				(entry) => entry.name === "@input/pen-not-a-real-extension",
			),
		"self-test: undeclared workspace name in the closure must fail",
	);
}

function fixturePkg(dir, name, dependencies) {
	return { dir, name, dependencies };
}

function fixtureFromManifest(dir, packageJson) {
	return {
		dir,
		name: packageJson.name,
		dependencies: consumerDependencyNames(packageJson),
	};
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function collectPackageJsonPaths(directory) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const packageJsonPaths = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				packageJsonPaths.push(
					...(await collectPackageJsonPaths(entryPath)),
				);
			}
			continue;
		}
		if (entry.isFile() && entry.name === "package.json") {
			packageJsonPaths.push(entryPath);
		}
	}

	return packageJsonPaths;
}

export async function loadConsumerPackages(repoRoot) {
	const packagesRoot = path.join(repoRoot, "packages");
	const packageJsonPaths = await collectPackageJsonPaths(packagesRoot);
	const packages = [];

	for (const packageJsonPath of packageJsonPaths) {
		const packageJson = JSON.parse(
			await fs.readFile(packageJsonPath, "utf8"),
		);
		if (
			packageJson.private === true ||
			typeof packageJson.name !== "string"
		) {
			continue;
		}
		const dir = path
			.relative(repoRoot, path.dirname(packageJsonPath))
			.split(path.sep)
			.join(path.posix.sep);
		packages.push({
			name: packageJson.name,
			dir,
			dependencies: consumerDependencyNames(packageJson),
		});
	}

	packages.sort((left, right) => left.name.localeCompare(right.name));
	return packages;
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let selfTestOnly = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			selfTestOnly = true;
			continue;
		}
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, selfTestOnly };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	runSelfTests();
	console.log(
		"core clean-install self-test ok (in-memory; direct, transitive, and optionalDependency injections fail closed; core's undo devDependency does not)",
	);
	if (args.selfTestOnly) {
		return;
	}

	const packages = await loadConsumerPackages(args.repoRoot);
	const result = evaluateCoreCleanInstall({ packages });
	console.log("");
	console.log(formatReport(result));
	if (!result.ok) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}

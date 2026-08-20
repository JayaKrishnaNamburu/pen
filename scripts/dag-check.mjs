#!/usr/bin/env node
/**
 * API1 dependency DAG check (spec-v2/14-api-and-packaging.md, Wave P step P.1).
 *
 * Target install DAG (arrow means "depends on"):
 *   types ← crdt-yjs ← core ← {extensions, shared, schema, transports}
 *   core ← dom ← {react, vue}
 *   presets ← everything they assemble
 *
 * Inverted edges fail unless listed in scripts/dag-allowlist.json with a reason.
 * Known inversions are printed. Inversions themselves are deferred; this script
 * only reports them.
 *
 * Checks the published package.json install graph (dependencies + required
 * @input/pen-* peers). Tooling, docs, and playground are outside the product DAG.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ALLOWLIST = path.join("scripts", "dag-allowlist.json");

const WORKSPACE_SCOPE = "@input/pen-";

const LAYER_RANK = {
	types: 0,
	crdt: 1,
	core: 2,
	feature: 3,
	dom: 4,
	binding: 5,
	preset: 6,
};

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

export function layerForPackageDir(relPosix) {
	const parts = relPosix.split("/").filter(Boolean);
	if (parts[0] !== "packages" || parts.length < 2) {
		return null;
	}

	const slot = parts[1];
	if (parts.length === 2) {
		if (slot === "types") {
			return "types";
		}
		if (slot === "core") {
			return "core";
		}
		if (slot === "docs") {
			return "ignore";
		}
		return null;
	}

	if (parts.length !== 3) {
		return null;
	}

	const name = parts[2];
	if (slot === "crdt") {
		return "crdt";
	}
	if (
		slot === "extensions" ||
		slot === "shared" ||
		slot === "schema" ||
		slot === "transports"
	) {
		return "feature";
	}
	if (slot === "presets") {
		return "preset";
	}
	if (slot === "tooling") {
		return "ignore";
	}
	if (slot === "rendering") {
		if (name === "dom") {
			return "dom";
		}
		if (name === "react" || name === "vue") {
			return "binding";
		}
	}
	return null;
}

export function workspaceDependencyNames(packageJson) {
	const names = new Set();
	collectScopedDeps(names, packageJson.dependencies);
	const optionalPeers = new Set(
		Object.entries(packageJson.peerDependenciesMeta ?? {})
			.filter(([, meta]) => meta?.optional === true)
			.map(([name]) => name),
	);
	for (const name of Object.keys(packageJson.peerDependencies ?? {})) {
		if (name.startsWith(WORKSPACE_SCOPE) && !optionalPeers.has(name)) {
			names.add(name);
		}
	}
	return [...names].sort();
}

function collectScopedDeps(names, deps) {
	for (const name of Object.keys(deps ?? {})) {
		if (name.startsWith(WORKSPACE_SCOPE)) {
			names.add(name);
		}
	}
}

export function parseAllowlist(raw) {
	const inversions = raw?.inversions;
	if (!Array.isArray(inversions)) {
		throw new Error("dag-allowlist.json must have an inversions array");
	}
	return inversions.map((entry, index) => {
		if (
			typeof entry?.from !== "string" ||
			typeof entry?.to !== "string" ||
			typeof entry?.reason !== "string" ||
			entry.from.length === 0 ||
			entry.to.length === 0 ||
			entry.reason.trim().length === 0
		) {
			throw new Error(
				`dag-allowlist.json inversions[${index}] needs from, to, and a non-empty reason`,
			);
		}
		return { from: entry.from, to: entry.to, reason: entry.reason.trim() };
	});
}

export function evaluateInversions({ packages, allowlist }) {
	const byName = new Map();
	const unclassified = [];

	for (const pkg of packages) {
		const layer = pkg.layer ?? layerForPackageDir(pkg.dir);
		if (layer == null) {
			unclassified.push(pkg.dir ?? pkg.name);
			continue;
		}
		byName.set(pkg.name, { ...pkg, layer });
	}

	const inverted = [];
	for (const pkg of byName.values()) {
		if (!(pkg.layer in LAYER_RANK)) {
			continue;
		}
		for (const depName of pkg.dependencies) {
			const dep = byName.get(depName);
			if (dep == null || !(dep.layer in LAYER_RANK)) {
				continue;
			}
			if (LAYER_RANK[pkg.layer] < LAYER_RANK[dep.layer]) {
				inverted.push({
					from: pkg.name,
					to: depName,
					fromLayer: pkg.layer,
					toLayer: dep.layer,
				});
			}
		}
	}

	inverted.sort(compareEdge);
	const allowlistByKey = new Map(
		allowlist.map((entry) => [edgeKey(entry), entry]),
	);
	const invertedKeys = new Set(inverted.map(edgeKey));

	const unexpected = inverted.filter(
		(edge) => !allowlistByKey.has(edgeKey(edge)),
	);
	const allowed = inverted
		.filter((edge) => allowlistByKey.has(edgeKey(edge)))
		.map((edge) => ({
			...edge,
			reason: allowlistByKey.get(edgeKey(edge)).reason,
		}));
	const stale = allowlist.filter(
		(entry) => !invertedKeys.has(edgeKey(entry)),
	);

	return { inverted, allowed, unexpected, stale, unclassified };
}

function edgeKey(edge) {
	return `${edge.from}\0${edge.to}`;
}

function compareEdge(left, right) {
	return (
		left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
	);
}

export function formatReport(result) {
	const lines = ["API1 dependency DAG"];

	if (result.unclassified.length > 0) {
		lines.push("");
		lines.push(
			"FAIL unclassified published packages (assign a DAG layer):",
		);
		for (const dir of result.unclassified) {
			lines.push(`  ${dir}`);
		}
	}

	lines.push("");
	if (result.allowed.length === 0) {
		lines.push("Allowlisted inversions: none");
	} else {
		lines.push(
			"Allowlisted inversions (expected until P.1 inversions land):",
		);
		for (const edge of result.allowed) {
			lines.push(
				`  ${edge.from} → ${edge.to}  (${edge.fromLayer} → ${edge.toLayer})`,
			);
			lines.push(`    ${edge.reason}`);
		}
	}

	if (result.unexpected.length > 0) {
		lines.push("");
		lines.push("FAIL unexpected inverted edges:");
		for (const edge of result.unexpected) {
			lines.push(
				`  ${edge.from} → ${edge.to}  (${edge.fromLayer} → ${edge.toLayer})`,
			);
		}
	}

	if (result.stale.length > 0) {
		lines.push("");
		lines.push(
			"FAIL stale allowlist entries (no longer inverted; remove them):",
		);
		for (const entry of result.stale) {
			lines.push(`  ${entry.from} → ${entry.to}`);
			lines.push(`    ${entry.reason}`);
		}
	}

	if (
		result.unexpected.length === 0 &&
		result.stale.length === 0 &&
		result.unclassified.length === 0
	) {
		lines.push("");
		lines.push(
			`OK: ${result.allowed.length} allowlisted inversion(s); allowlist matches the install graph.`,
		);
	}

	return lines.join("\n");
}

export function runSelfTests() {
	const types = fixturePkg("packages/types", "@input/pen-types", []);
	const crdt = fixturePkg("packages/crdt/yjs", "@input/pen-crdt-yjs", [
		"@input/pen-types",
	]);
	const core = fixturePkg("packages/core", "@input/pen-core", [
		"@input/pen-types",
		"@input/pen-crdt-yjs",
		"@input/pen-delta-stream",
	]);
	const deltaStream = fixturePkg(
		"packages/extensions/delta-stream",
		"@input/pen-delta-stream",
		["@input/pen-types"],
	);
	const react = fixturePkg("packages/rendering/react", "@input/pen-react", [
		"@input/pen-core",
		"@input/pen-dom",
	]);
	const dom = fixturePkg("packages/rendering/dom", "@input/pen-dom", [
		"@input/pen-core",
	]);
	const widget = fixturePkg(
		"packages/extensions/widget",
		"@input/pen-widget",
		["@input/pen-core", "@input/pen-react"],
	);

	const allowlist = [
		{
			from: "@input/pen-core",
			to: "@input/pen-delta-stream",
			reason: "Wave 2: fixture",
		},
	];

	const matching = evaluateInversions({
		packages: [types, crdt, core, deltaStream, react, dom],
		allowlist,
	});
	assert(
		matching.unexpected.length === 0,
		"self-test: matching allowlist must not fail",
	);
	assert(
		matching.stale.length === 0,
		"self-test: matching allowlist must not be stale",
	);
	assert(
		matching.allowed.length === 1,
		"self-test: expected one allowlisted inversion",
	);
	assert(
		matching.allowed[0].from === "@input/pen-core" &&
			matching.allowed[0].to === "@input/pen-delta-stream",
		"self-test: allowlisted edge should be core → delta-stream",
	);

	const fake = evaluateInversions({
		packages: [
			types,
			crdt,
			{
				...core,
				dependencies: [...core.dependencies, "@input/pen-react"],
			},
			deltaStream,
			react,
			dom,
		],
		allowlist,
	});
	assert(
		fake.unexpected.some(
			(edge) =>
				edge.from === "@input/pen-core" &&
				edge.to === "@input/pen-react",
		),
		"self-test: fake inverted edge not on the allowlist must fail",
	);

	const extensionToRenderer = evaluateInversions({
		packages: [types, crdt, core, deltaStream, react, dom, widget],
		allowlist,
	});
	assert(
		extensionToRenderer.unexpected.some(
			(edge) =>
				edge.from === "@input/pen-widget" &&
				edge.to === "@input/pen-react",
		),
		"self-test: extension → rendering must be inverted",
	);

	const stale = evaluateInversions({
		packages: [
			types,
			crdt,
			{
				...core,
				dependencies: ["@input/pen-types", "@input/pen-crdt-yjs"],
			},
			deltaStream,
		],
		allowlist,
	});
	assert(
		stale.stale.length === 1,
		"self-test: missing allowlisted edge must be stale",
	);

	const downward = evaluateInversions({
		packages: [
			types,
			crdt,
			{
				...core,
				dependencies: ["@input/pen-types", "@input/pen-crdt-yjs"],
			},
			dom,
			react,
		],
		allowlist: [],
	});
	assert(
		downward.inverted.length === 0,
		"self-test: downward edges are not inversions",
	);

	assert(
		layerForPackageDir("packages/extensions/undo") === "feature",
		"self-test: extension layer",
	);
	assert(
		layerForPackageDir("packages/rendering/vue") === "binding",
		"self-test: vue layer",
	);
	assert(
		layerForPackageDir("packages/tooling/bench") === "ignore",
		"self-test: tooling ignored",
	);
	assert(
		workspaceDependencyNames({
			dependencies: { "@input/pen-core": "workspace:*", react: "^19" },
			peerDependencies: {
				"@input/pen-import-html": "workspace:*",
				"@input/pen-types": "workspace:*",
			},
			peerDependenciesMeta: {
				"@input/pen-import-html": { optional: true },
			},
		}).join(",") === "@input/pen-core,@input/pen-types",
		"self-test: optional peers are not install-graph edges",
	);
}

function fixturePkg(dir, name, dependencies) {
	return { dir, name, dependencies };
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

export async function loadWorkspacePackages(repoRoot) {
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
			dependencies: workspaceDependencyNames(packageJson),
		});
	}

	packages.sort((left, right) => left.name.localeCompare(right.name));
	return packages;
}

export async function loadAllowlist(
	repoRoot,
	allowlistRel = DEFAULT_ALLOWLIST,
) {
	const text = await fs.readFile(path.join(repoRoot, allowlistRel), "utf8");
	return parseAllowlist(JSON.parse(text));
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
		"API1 DAG self-test ok (fixture object; fake inverted edge fails closed)",
	);
	if (args.selfTestOnly) {
		return;
	}

	const packages = await loadWorkspacePackages(args.repoRoot);
	const allowlist = await loadAllowlist(args.repoRoot);
	const result = evaluateInversions({ packages, allowlist });
	console.log("");
	console.log(formatReport(result));
	if (
		result.unexpected.length > 0 ||
		result.stale.length > 0 ||
		result.unclassified.length > 0
	) {
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

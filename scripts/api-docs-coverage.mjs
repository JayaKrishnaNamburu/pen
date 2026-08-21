#!/usr/bin/env node
/**
 * DOC3 public-symbol TSDoc coverage (spec-v2/17-documentation.md,
 * Wave D step D.5).
 *
 * Input is the committed `api-report.md` each published package already
 * keeps for API4 — same list the generated reference will consume. A
 * public symbol is documented when a JSDoc block (`/** ... * /`)
 * immediately precedes a matching declaration in that package's `src/`
 * (tests excluded). Tag-only comments (`/** @internal * /`) do not
 * count. Quality is not judged: `/** The editor. * /` on `editor`
 * passes.
 *
 * Does not catch: inaccurate or one-word restatements; missing
 * `@param` / `@returns` / field defaults; class or interface member
 * docs; README-only docs; JSDoc sitting only on a renamed local
 * (`export { foo as bar }` is followed one hop); JSDoc in another
 * package that this barrel re-exports; glob surfaces (API4 lists
 * files there, not symbols); comments forged inside strings.
 *
 * The live tree is expected to have a large undocumented count until
 * the TSDoc pass (or API4 un-exports) lands. `MAX_UNDOCUMENTED` is a
 * ratchet: the count may only decrease. Raising it fails. A drop
 * without lowering the constant fails as stale. At 0 this is the
 * hard DOC3 gate.
 *
 * Reads committed `api-report.md` and source — not `dist`. Those
 * reports are generated from a published `.d.ts`. Dist freshness is
 * therefore a local proxy: when type-input source is newer than the
 * `.d.ts`, the measured surface may predate source. That is
 * INCONCLUSIVE, not a coverage failure.
 *
 * Freshness is a local guard. The static-gates job does not build
 * first; a missing `.d.ts` is `no-dist`, not `outdated`, so this
 * path does not fire there. Do not add a CI flag for it.
 *
 * "stale" in this script means a ratchet baseline above the live
 * undocumented count — not an outdated `.d.ts`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublishedPackages } from "./api-reports.mjs";
import {
	appendOutdatedDistLines,
	collectOutdatedDist,
	runFreshnessSelfTests,
} from "./lib/distFreshness.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPORT_NAME = "api-report.md";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const SKIP_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"__tests__",
	"playwright-report",
	"test-results",
]);

/**
 * Ratchet. May only decrease. The gate is a hard zero-undocumented
 * check when this hits 0. Measured 2026-08-21: 1926 public symbols,
 * 130 with TSDoc, 1796 without.
 */
export const MAX_UNDOCUMENTED = 1796;

const JSDOC_RE = /\/\*\*[\s\S]*?\*\//g;
const DECL_RE =
	/^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:type\s+|interface\s+|class\s+|function\s*\*?\s*|const\s+|let\s+|var\s+|enum\s+)(\w+)/;
const EXPORT_LIST_RE = /^export\s+(?:type\s+)?\{([^}]+)\}/;

export function splitNamedExports(inner) {
	const specs = [];
	for (const raw of inner.split(",")) {
		const spec = raw.trim();
		if (spec.length === 0) {
			continue;
		}
		const typeOnly = spec.startsWith("type ");
		const rest = typeOnly ? spec.slice(5).trim() : spec;
		const renamed = rest.match(/^(\S+)\s+as\s+(\S+)$/);
		specs.push({
			typeOnly,
			local: renamed ? renamed[1] : rest,
			exported: renamed ? renamed[2] : rest,
		});
	}
	return specs;
}

export function jsdocHasProse(comment) {
	const body = comment
		.replace(/^\/\*\*/, "")
		.replace(/\*\/$/, "")
		.replace(/^\s*\*\s?/gm, "\n")
		.trim();
	const withoutTags = body.replace(/@[A-Za-z][\w-]*/g, " ");
	return /[A-Za-z0-9]/.test(withoutTags);
}

export function collectFileDocs(source) {
	const documented = new Set();
	const aliases = [];

	JSDOC_RE.lastIndex = 0;
	let match;
	while ((match = JSDOC_RE.exec(source))) {
		if (!jsdocHasProse(match[0])) {
			continue;
		}
		const after = source.slice(match.index + match[0].length).replace(/^\s*/, "");
		const decl = after.match(DECL_RE);
		if (decl) {
			documented.add(decl[1]);
		}
		const named = after.match(EXPORT_LIST_RE);
		if (named) {
			for (const spec of splitNamedExports(named[1])) {
				documented.add(spec.exported);
			}
		}
	}

	for (const list of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
		for (const spec of splitNamedExports(list[1])) {
			if (spec.local !== spec.exported) {
				aliases.push({ local: spec.local, exported: spec.exported });
			}
		}
	}

	return { documented, aliases };
}

export function documentedNamesFromSources(sources) {
	const documented = new Set();
	const aliases = [];
	for (const file of sources) {
		const result = collectFileDocs(file.text);
		for (const name of result.documented) {
			documented.add(name);
		}
		aliases.push(...result.aliases);
	}
	let grew = true;
	while (grew) {
		grew = false;
		for (const { local, exported } of aliases) {
			if (documented.has(local) && !documented.has(exported)) {
				documented.add(exported);
				grew = true;
			}
		}
	}
	return documented;
}

export function parseApiReport(text) {
	const title = /^#\s+(\S+)\s*$/m.exec(text);
	if (title == null) {
		throw new Error("api-report.md is missing a `# @scope/name` title");
	}
	const surfaces = [];
	let current = null;
	let currentKind = null;
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (line.startsWith("## ")) {
			current = {
				key: line.slice(3).trim(),
				glob: false,
				entries: [],
			};
			surfaces.push(current);
			currentKind = null;
			continue;
		}
		if (current == null) {
			continue;
		}
		if (line === "glob members:") {
			current.glob = true;
			currentKind = null;
			continue;
		}
		if (line.startsWith("### ")) {
			currentKind = line.slice(4).trim();
			continue;
		}
		if (line.startsWith("- ") && currentKind != null && !current.glob) {
			current.entries.push({
				name: line.slice(2).trim(),
				kind: currentKind,
			});
		}
	}
	return { packageName: title[1], surfaces };
}

export function uniquePublicSymbols(report) {
	const byName = new Map();
	for (const surface of report.surfaces) {
		if (surface.glob) {
			continue;
		}
		for (const entry of surface.entries) {
			const existing = byName.get(entry.name);
			if (existing == null) {
				byName.set(entry.name, {
					name: entry.name,
					kind: entry.kind,
					surfaces: [surface.key],
				});
				continue;
			}
			if (!existing.surfaces.includes(surface.key)) {
				existing.surfaces.push(surface.key);
			}
			if (!existing.kind.split("|").includes(entry.kind)) {
				existing.kind = `${existing.kind}|${entry.kind}`;
			}
		}
	}
	return [...byName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
}

export function evaluateCoverage({
	packages,
	maxUndocumented = MAX_UNDOCUMENTED,
	outdatedDist = [],
}) {
	const undocumented = [];
	const documented = [];
	const missingReports = [];
	const reportNameMismatches = [];
	const globSurfaces = [];
	let publicSymbols = 0;

	for (const pkg of packages) {
		if (pkg.reportText == null) {
			missingReports.push(pkg.name);
			continue;
		}
		let report;
		try {
			report = parseApiReport(pkg.reportText);
		} catch (error) {
			missingReports.push(
				`${pkg.name} (${error instanceof Error ? error.message : error})`,
			);
			continue;
		}
		if (report.packageName !== pkg.name) {
			reportNameMismatches.push({
				package: pkg.name,
				reportName: report.packageName,
			});
		}
		for (const surface of report.surfaces) {
			if (surface.glob) {
				globSurfaces.push({ package: pkg.name, key: surface.key });
			}
		}
		const documentedNames = documentedNamesFromSources(pkg.sources ?? []);
		const symbols = uniquePublicSymbols(report);
		publicSymbols += symbols.length;
		for (const symbol of symbols) {
			const hit = {
				package: pkg.name,
				name: symbol.name,
				kind: symbol.kind,
				surfaces: symbol.surfaces,
			};
			if (documentedNames.has(symbol.name)) {
				documented.push(hit);
			} else {
				undocumented.push(hit);
			}
		}
	}

	undocumented.sort((left, right) => {
		const pkg = left.package.localeCompare(right.package);
		if (pkg !== 0) {
			return pkg;
		}
		return left.name.localeCompare(right.name);
	});

	const count = undocumented.length;
	return {
		publicSymbols,
		documented: documented.length,
		undocumented,
		missingReports,
		reportNameMismatches,
		globSurfaces,
		maxUndocumented,
		count,
		regression: count > maxUndocumented,
		staleBaseline: count < maxUndocumented,
		outdatedDist,
	};
}

export function hasFailures(result) {
	return (
		result.missingReports.length > 0 ||
		result.reportNameMismatches.length > 0 ||
		result.regression ||
		result.staleBaseline
	);
}

export function hasInconclusive(result) {
	return (result.outdatedDist?.length ?? 0) > 0;
}

export function formatReport(result) {
	const lines = ["DOC3 API docs coverage"];
	lines.push("");
	lines.push(`public symbols           ${result.publicSymbols}`);
	lines.push(`documented               ${result.documented}`);
	lines.push(`undocumented             ${result.count}`);
	lines.push(`baseline (max)           ${result.maxUndocumented}`);
	lines.push(`glob surfaces skipped    ${result.globSurfaces.length}`);
	lines.push(`outdated dist            ${result.outdatedDist?.length ?? 0}`);
	if (result.missingReports.length > 0) {
		lines.push("");
		lines.push("missing or unreadable api-report.md:");
		for (const name of result.missingReports) {
			lines.push(`  ${name}`);
		}
	}
	if (result.reportNameMismatches.length > 0) {
		lines.push("");
		lines.push("api-report.md title does not match package.json name:");
		for (const hit of result.reportNameMismatches) {
			lines.push(`  ${hit.package} (report says ${hit.reportName})`);
		}
	}
	if (result.globSurfaces.length > 0) {
		lines.push("");
		lines.push("glob surfaces skipped (API4 lists files, not symbols):");
		for (const hit of result.globSurfaces) {
			lines.push(`  ${hit.package} ${hit.key}`);
		}
	}
	if (result.regression) {
		lines.push("");
		lines.push(
			`FAIL undocumented count ${result.count} exceeds baseline ${result.maxUndocumented}.`,
		);
		lines.push("New public symbols need TSDoc, or un-export them (feed API4).");
	}
	if (result.staleBaseline) {
		lines.push("");
		lines.push(
			`FAIL baseline ${result.maxUndocumented} is stale; undocumented is ${result.count}.`,
		);
		lines.push(
			"Lower MAX_UNDOCUMENTED in scripts/api-docs-coverage.mjs to the new count.",
		);
	}
	if (result.undocumented.length > 0) {
		lines.push("");
		lines.push("undocumented public symbols:");
		for (const hit of result.undocumented) {
			const surfaces = hit.surfaces.join(",");
			lines.push(
				`  ${hit.package}  ${hit.kind}  ${hit.name}  (${surfaces})`,
			);
		}
	}
	appendOutdatedDistLines(lines, result.outdatedDist ?? []);
	if (!hasFailures(result) && !hasInconclusive(result) && result.count === 0) {
		lines.push("");
		lines.push("OK: every public symbol in the API reports has TSDoc in source.");
	} else if (!hasFailures(result) && !hasInconclusive(result)) {
		lines.push("");
		lines.push(
			`OK: undocumented count matches the ratchet (${result.count}). ` +
				"The hard DOC3 gate is MAX_UNDOCUMENTED === 0.",
		);
	} else if (!hasFailures(result) && hasInconclusive(result)) {
		lines.push("");
		lines.push(
			`INCONCLUSIVE: coverage matches the ratchet, but ${result.outdatedDist.length} package(s) have type-input source newer than dist. The measured surface may predate source. That is not a pass.`,
		);
	} else if (hasFailures(result) && hasInconclusive(result)) {
		lines.push("");
		lines.push(
			`INCONCLUSIVE: ${result.outdatedDist.length} package(s) have type-input source newer than dist; coverage results may be incomplete until those rebuild.`,
		);
	}
	return lines.join("\n");
}

export function runSelfTests() {
	const documentedSource = `
/** Create an empty schema registry. */
export function createEmptySchema() {}
/** @internal */
export function hiddenHelper() {}
`;
	const fileDocs = collectFileDocs(documentedSource);
	assert(
		fileDocs.documented.has("createEmptySchema"),
		"self-test: prose JSDoc documents a function",
	);
	assert(
		!fileDocs.documented.has("hiddenHelper"),
		"self-test: tag-only @internal is not documentation",
	);
	assert(jsdocHasProse("/** The editor. */"), "self-test: quality is not judged");
	assert(!jsdocHasProse("/** @internal */"), "self-test: @internal alone has no prose");
	assert(
		!jsdocHasProse("/** @public */"),
		"self-test: @public alone has no prose",
	);
	assert(
		jsdocHasProse("/** @deprecated Use createHeadlessEditor. */"),
		"self-test: a tagged comment with a description counts",
	);

	const aliasSource = `
/** Hosts call this. */
function makeEditor() {}
export { makeEditor as createEditor };
`;
	const aliasDocs = documentedNamesFromSources([{ file: "a.ts", text: aliasSource }]);
	assert(
		aliasDocs.has("createEditor"),
		"self-test: one-hop export rename inherits JSDoc",
	);

	const report = parseApiReport(`# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- createEditor
- leakedHelper

## ./field-editor/*

\`./dist/field-editor/*.d.ts\`

glob members:

- fieldEditorImpl.d.ts
`);
	assert(report.packageName === "@input/pen-core", "self-test: report title");
	assert(report.surfaces.length === 2, "self-test: two surfaces");
	assert(report.surfaces[1].glob === true, "self-test: glob surface");
	assert(
		uniquePublicSymbols(report)
			.map((entry) => entry.name)
			.join(",") === "createEditor,leakedHelper",
		"self-test: glob files are not symbols",
	);

	const healthy = evaluateCoverage({
		packages: [
			{
				name: "@input/pen-core",
				reportText: `# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- createEmptySchema
`,
				sources: [{ file: "emptySchema.ts", text: documentedSource }],
			},
		],
		maxUndocumented: 0,
	});
	assert(healthy.count === 0, "self-test: documented export is green");
	assert(!hasFailures(healthy), "self-test: documented export must pass");

	const injected = evaluateCoverage({
		packages: [
			{
				name: "@input/pen-core",
				reportText: `# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- createEmptySchema
- leakedHelper
`,
				sources: [
					{
						file: "index.ts",
						text: `${documentedSource}\nexport function leakedHelper() {}\n`,
					},
				],
			},
		],
		maxUndocumented: 0,
	});
	assert(injected.count === 1, "self-test: red-proof count");
	assert(
		injected.undocumented.some((hit) => hit.name === "leakedHelper"),
		"self-test: red-proof names leakedHelper",
	);
	assert(hasFailures(injected), "self-test: injected undocumented export fails closed");

	const restored = evaluateCoverage({
		packages: [
			{
				name: "@input/pen-core",
				reportText: `# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- createEmptySchema
`,
				sources: [{ file: "emptySchema.ts", text: documentedSource }],
			},
		],
		maxUndocumented: 0,
	});
	assert(restored.count === 0, "self-test: restore after injection is green");
	assert(!hasFailures(restored), "self-test: restore must pass");

	const missing = evaluateCoverage({
		packages: [{ name: "@input/pen-core", reportText: null, sources: [] }],
		maxUndocumented: 0,
	});
	assert(
		missing.missingReports.includes("@input/pen-core"),
		"self-test: missing api-report fails closed",
	);
	assert(hasFailures(missing), "self-test: missing report is a failure");

	const over = evaluateCoverage({
		packages: [
			{
				name: "@input/pen-core",
				reportText: `# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- leakedHelper
`,
				sources: [{ file: "index.ts", text: "export function leakedHelper() {}\n" }],
			},
		],
		maxUndocumented: 0,
	});
	assert(over.regression, "self-test: count above baseline is a regression");

	const stale = evaluateCoverage({
		packages: [
			{
				name: "@input/pen-core",
				reportText: `# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- createEmptySchema
`,
				sources: [{ file: "emptySchema.ts", text: documentedSource }],
			},
		],
		maxUndocumented: 4,
	});
	assert(stale.staleBaseline, "self-test: a drop without lowering the ratchet fails");
	assert(hasFailures(stale), "self-test: stale baseline fails closed");

	const outdatedOnly = evaluateCoverage({
		packages: [
			{
				name: "@input/pen-core",
				reportText: `# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- createEmptySchema
`,
				sources: [{ file: "emptySchema.ts", text: documentedSource }],
			},
		],
		maxUndocumented: 0,
		outdatedDist: [{ package: "@input/pen-core", newerCount: 1 }],
	});
	assert(!hasFailures(outdatedOnly), "self-test: outdated dist is not a coverage failure");
	assert(hasInconclusive(outdatedOnly), "self-test: outdated dist is inconclusive");
	const outdatedReport = formatReport(outdatedOnly);
	assert(!outdatedReport.includes("OK:"), "self-test: outdated dist must not print OK");
	assert(outdatedReport.includes("INCONCLUSIVE:"), "self-test: outdated dist prints INCONCLUSIVE");
	assert(
		outdatedReport.includes("@input/pen-core"),
		"self-test: INCONCLUSIVE names the package",
	);
	assert(
		!outdatedReport.includes("FAIL baseline"),
		"self-test: outdated dist is not a stale baseline",
	);

	const injectedAndOutdated = evaluateCoverage({
		packages: [
			{
				name: "@input/pen-core",
				reportText: `# @input/pen-core

## .

\`./dist/index.d.ts\`

### function

- createEmptySchema
- leakedHelper
`,
				sources: [
					{
						file: "index.ts",
						text: `${documentedSource}\nexport function leakedHelper() {}\n`,
					},
				],
			},
		],
		maxUndocumented: 0,
		outdatedDist: [{ package: "@input/pen-core", newerCount: 1 }],
	});
	assert(hasFailures(injectedAndOutdated), "self-test: undocumented export still fails when dist is outdated");
	assert(
		formatReport(injectedAndOutdated).includes("leakedHelper"),
		"self-test: outdated dist does not hide an undocumented export",
	);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function isTestFile(filePath) {
	const parts = filePath.split(path.sep);
	if (parts.includes("__tests__")) {
		return true;
	}
	return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(parts[parts.length - 1]);
}

async function collectSourceFiles(directory, files) {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIR_NAMES.has(entry.name)) {
				await collectSourceFiles(entryPath, files);
			}
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			continue;
		}
		if (isTestFile(entryPath)) {
			continue;
		}
		files.push(entryPath);
	}
}

export async function loadCoveragePackages(repoRoot) {
	const published = await loadPublishedPackages(repoRoot);
	const packages = [];
	for (const pkg of published) {
		const reportPath = path.join(pkg.dir, REPORT_NAME);
		let reportText = null;
		try {
			reportText = await fs.readFile(reportPath, "utf8");
		} catch (error) {
			if (error && error.code !== "ENOENT") {
				throw error;
			}
		}
		const sourceFiles = [];
		await collectSourceFiles(path.join(pkg.dir, "src"), sourceFiles);
		const sources = [];
		for (const filePath of sourceFiles.sort()) {
			sources.push({
				file: path.relative(pkg.dir, filePath).split(path.sep).join("/"),
				text: await fs.readFile(filePath, "utf8"),
			});
		}
		packages.push({
			name: pkg.name,
			dir: pkg.dir,
			packageJson: pkg.packageJson,
			reportPath,
			reportText,
			sources,
		});
	}
	return packages;
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let json = false;
	let strict = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "--strict") {
			strict = true;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, json, strict };
}

async function main() {
	runSelfTests();
	await runFreshnessSelfTests();
	console.log("DOC3 api-docs-coverage self-test ok");
	console.log(
		"  red-proof: injected undocumented export leakedHelper failed closed, then restored",
	);
	console.log("  red-proof: tag-only @internal failed closed");
	console.log("  red-proof: missing api-report.md failed closed");
	console.log("  red-proof: baseline regression and stale baseline failed closed");

	const args = parseArgs(process.argv.slice(2));
	const packages = await loadCoveragePackages(args.repoRoot);
	const outdatedDist = await collectOutdatedDist(packages);
	const result = evaluateCoverage({
		packages,
		maxUndocumented: args.strict ? 0 : MAX_UNDOCUMENTED,
		outdatedDist,
	});
	console.log("");
	if (args.json) {
		console.log(
			JSON.stringify(
				{
					publicSymbols: result.publicSymbols,
					documented: result.documented,
					undocumented: result.count,
					maxUndocumented: result.maxUndocumented,
					globSurfaces: result.globSurfaces,
					hits: result.undocumented,
				},
				null,
				2,
			),
		);
	} else {
		console.log(formatReport(result));
	}
	if (hasFailures(result) || hasInconclusive(result)) {
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

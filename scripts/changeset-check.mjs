#!/usr/bin/env node
/**
 * Changeset coverage gate (CONTRIBUTING.md "Changesets And API Reports").
 *
 * A pull request that changes what a published package ships must carry a
 * changeset naming that package, otherwise the release train publishes a
 * behavior change with no changelog line and no version bump. That rule was
 * prose and a checkbox until this gate existed, which meant it was enforced
 * only when a reviewer happened to remember it.
 *
 * Population is `src/**` inside a published (non-private) package, minus
 * tests and fixtures. That is deliberately narrower than "everything the
 * tarball contains":
 *
 *   - `package.json` is out. The release bot's own pull request edits every
 *     manifest and deletes every changeset; a manifest trigger would fail
 *     that PR by construction. `package-metadata` already owns manifests.
 *   - READMEs, api-report.md, and CHANGELOG.md are out. They ship, but a
 *     wording fix is not a release.
 *
 * Know what this does not catch, same caveat as api-reports: a dependency
 * bump inside a published manifest changes what users install and produces
 * no `src/**` diff. Call those out by hand.
 *
 * An empty changeset (`pnpm changeset --empty`) satisfies the gate. That is
 * the changesets-native way to say "touched shipped code, no release" — for
 * a comment, a rename, or a pure refactor — and it keeps the decision in the
 * diff where a reviewer can disagree with it.
 *
 * Fails closed on a git invocation that does not work. A gate that silently
 * reports "no changed packages" because it could not find the base ref is a
 * gate that passes everything.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const PACKAGES_ROOT = "packages";
const CHANGESET_DIR = ".changeset";

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
 * Test and fixture paths inside `src/`. These never reach a consumer, so a
 * change confined to them is not a release.
 */
const NON_SHIPPING_RE =
	/(^|\/)(?:__tests__|__fixtures__|__mocks__)(?:\/|$)|\.(?:test|spec|bench)\.[cm]?[jt]sx?$/;

/**
 * Candidate base refs, in order, when neither `--base` nor GITHUB_BASE_REF
 * says otherwise. `.changeset/config.json` names main as the base branch.
 */
const FALLBACK_BASE_REFS = ["origin/main", "main", "origin/master", "master"];

export function isShippedSourcePath(relPathInPackage) {
	if (!relPathInPackage.startsWith("src/")) {
		return false;
	}
	return !NON_SHIPPING_RE.test(relPathInPackage);
}

/**
 * Maps a repo-relative file to the published package that owns it. Longest
 * directory wins so `packages/crdt/yjs/src/x.ts` resolves to the yjs package
 * rather than to a parent that merely shares a prefix.
 */
export function ownerOf(file, packages) {
	let owner = null;
	for (const pkg of packages) {
		const prefix = `${pkg.dir}/`;
		if (!file.startsWith(prefix)) {
			continue;
		}
		if (owner == null || pkg.dir.length > owner.dir.length) {
			owner = pkg;
		}
	}
	return owner;
}

export function changedPublishedPackages({ files, packages }) {
	const names = new Set();
	for (const file of files) {
		const owner = ownerOf(file, packages);
		if (owner == null) {
			continue;
		}
		const relInPackage = file.slice(owner.dir.length + 1);
		if (isShippedSourcePath(relInPackage)) {
			names.add(owner.name);
		}
	}
	return [...names].sort();
}

/**
 * Reads the package names out of a changeset's frontmatter. An empty
 * frontmatter block is the explicit "no release" marker, not a parse failure.
 */
export function parseChangeset(markdown) {
	const lines = markdown.split(/\r?\n/);
	const open = lines.findIndex((line) => line.trim() === "---");
	if (open === -1) {
		return { packages: [], bumps: [], isEmpty: false, malformed: true };
	}
	const close = lines.findIndex(
		(line, index) => index > open && line.trim() === "---",
	);
	if (close === -1) {
		return { packages: [], bumps: [], isEmpty: false, malformed: true };
	}

	const packages = [];
	const bumps = [];
	for (const line of lines.slice(open + 1, close)) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}
		const match = /^["']?(@?[^"':]+)["']?\s*:\s*(major|minor|patch)\s*$/.exec(
			trimmed,
		);
		if (match == null) {
			return { packages: [], bumps: [], isEmpty: false, malformed: true };
		}
		packages.push(match[1]);
		bumps.push({ name: match[1], bump: match[2] });
	}

	return {
		packages,
		bumps,
		isEmpty: packages.length === 0,
		malformed: false,
	};
}

export function evaluateCoverage({
	changed,
	changesets,
	ignored = [],
	trainIsZeroX = false,
}) {
	const ignoredSet = new Set(ignored);
	const relevant = changed.filter((name) => !ignoredSet.has(name));
	const skipped = changed.filter((name) => ignoredSet.has(name));

	const declared = new Set();
	let hasEmpty = false;
	const malformed = [];
	const majorBumps = [];
	for (const changeset of changesets) {
		if (changeset.malformed) {
			malformed.push(changeset.file);
			continue;
		}
		if (changeset.isEmpty) {
			hasEmpty = true;
			continue;
		}
		for (const name of changeset.packages) {
			declared.add(name);
		}
		if (trainIsZeroX) {
			for (const bump of changeset.bumps ?? []) {
				if (bump.bump === "major") {
					majorBumps.push({ file: changeset.file, package: bump.name });
				}
			}
		}
	}

	const missing = hasEmpty
		? []
		: relevant.filter((name) => !declared.has(name));

	return {
		relevant,
		skipped,
		declared: [...declared].sort(),
		hasEmpty,
		malformed,
		missing,
		majorBumps,
		trainIsZeroX,
	};
}

export function formatReport({ base, files, result }) {
	const lines = ["Changeset coverage"];
	lines.push("");
	lines.push(`base            ${base}`);
	lines.push(`changed files   ${files.length}`);
	lines.push(`published src   ${result.relevant.length}`);

	if (result.skipped.length > 0) {
		lines.push("");
		lines.push("Ignored by .changeset/config.json (no version, no tag):");
		for (const name of result.skipped) {
			lines.push(`  ${name}`);
		}
	}

	if (result.hasEmpty) {
		lines.push("");
		lines.push(
			"An empty changeset is present: this branch declares shipped code changed without a release.",
		);
	}

	if (result.malformed.length > 0) {
		lines.push("");
		lines.push("FAIL: changeset frontmatter did not parse:");
		for (const file of result.malformed) {
			lines.push(`  ${file}`);
		}
		lines.push(
			"  Expected a --- block of `\"@input/pen-x\": patch|minor` lines.",
		);
	}

	if (result.majorBumps.length > 0) {
		lines.push("");
		lines.push("FAIL: `major` is illegal while the train is 0.x (API7):");
		for (const bump of result.majorBumps) {
			lines.push(`  ${bump.file}  ${bump.package}`);
		}
		lines.push("");
		lines.push("  Breaking change → minor. Additive change → patch.");
		lines.push("  `major` is how the train would jump to 1.0.0. Do not pick");
		lines.push("  it until the project means to leave 0.x.");
	}

	if (result.missing.length > 0) {
		lines.push("");
		lines.push("FAIL: published packages changed with no changeset:");
		for (const name of result.missing) {
			lines.push(`  ${name}`);
		}
		lines.push("");
		lines.push("  Run `pnpm changeset` from the repository root, select the");
		lines.push("  packages above, pick minor or patch, and write a");
		lines.push("  user-facing summary. Commit the new .changeset/*.md file.");
		lines.push("");
		lines.push("  If this branch really ships no behavior change — a comment,");
		lines.push("  a rename, a test-only refactor — record that decision with");
		lines.push("  `pnpm changeset --empty` instead of widening this gate.");
	}

	if (
		result.missing.length === 0 &&
		result.malformed.length === 0 &&
		result.majorBumps.length === 0
	) {
		lines.push("");
		if (result.relevant.length === 0) {
			lines.push("OK: no published package changed shipped source.");
		} else if (result.declared.length === 0) {
			lines.push("OK: shipped source changed and no release is claimed.");
		} else {
			lines.push(
				`OK: every changed published package is named in a changeset (${result.declared.join(", ")}).`,
			);
		}
	}

	return lines.join("\n");
}

export function hasFailures(result) {
	return (
		result.missing.length > 0 ||
		result.malformed.length > 0 ||
		(result.majorBumps?.length ?? 0) > 0
	);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTests() {
	const packages = [
		{ name: "@input/pen-core", dir: "packages/core" },
		{ name: "@input/pen-crdt-yjs", dir: "packages/crdt/yjs" },
		{ name: "@input/pen-docs", dir: "packages/docs" },
	];

	assert(
		isShippedSourcePath("src/editor.ts"),
		"self-test: src/ is shipped source",
	);
	assert(
		!isShippedSourcePath("src/__tests__/editor.test.ts"),
		"self-test: colocated tests do not ship",
	);
	assert(
		!isShippedSourcePath("src/editor.test.ts"),
		"self-test: a .test.ts sibling does not ship",
	);
	assert(
		!isShippedSourcePath("README.md") &&
			!isShippedSourcePath("package.json") &&
			!isShippedSourcePath("api-report.md"),
		"self-test: manifests and docs are out of population",
	);

	assert(
		ownerOf("packages/crdt/yjs/src/doc.ts", packages)?.name ===
			"@input/pen-crdt-yjs",
		"self-test: nested package wins over a shared prefix",
	);
	assert(
		ownerOf("playground/src/main.ts", packages) == null,
		"self-test: non-published trees have no owner",
	);

	const changed = changedPublishedPackages({
		files: [
			"packages/core/src/apply.ts",
			"packages/core/src/__tests__/apply.test.ts",
			"packages/docs/src/page.ts",
			"playground/src/main.ts",
			"spec/rules/pipeline.md",
		],
		packages,
	});
	assert(
		changed.join(",") === "@input/pen-core,@input/pen-docs",
		`self-test: expected core + docs, got ${changed.join(",")}`,
	);

	const parsed = parseChangeset(
		'---\n"@input/pen-core": minor\n"@input/pen-dom": patch\n---\n\nSummary.\n',
	);
	assert(
		parsed.packages.join(",") === "@input/pen-core,@input/pen-dom" &&
			parsed.bumps.map((bump) => bump.bump).join(",") === "minor,patch" &&
			!parsed.isEmpty &&
			!parsed.malformed,
		"self-test: frontmatter package names parse",
	);
	assert(
		parseChangeset("---\n---\n").isEmpty,
		"self-test: an empty changeset is recognised, not malformed",
	);
	assert(
		parseChangeset("no frontmatter here").malformed,
		"self-test: a body with no frontmatter is malformed",
	);
	assert(
		parseChangeset('---\n"@input/pen-core": massive\n---\n').malformed,
		"self-test: an unknown bump type is malformed",
	);

	const uncovered = evaluateCoverage({
		changed: ["@input/pen-core", "@input/pen-docs"],
		changesets: [],
		ignored: ["@input/pen-docs"],
	});
	assert(
		uncovered.missing.join(",") === "@input/pen-core",
		"self-test: a changed published package with no changeset fails",
	);
	assert(
		uncovered.skipped.join(",") === "@input/pen-docs",
		"self-test: config.json ignore list is honoured",
	);
	assert(hasFailures(uncovered), "self-test: missing coverage is a failure");

	const covered = evaluateCoverage({
		changed: ["@input/pen-core"],
		changesets: [
			{
				file: ".changeset/brave-pandas-smile.md",
				packages: ["@input/pen-core"],
				isEmpty: false,
				malformed: false,
			},
		],
	});
	assert(
		!hasFailures(covered) && covered.missing.length === 0,
		"self-test: a naming changeset satisfies the gate",
	);

	const emptied = evaluateCoverage({
		changed: ["@input/pen-core", "@input/pen-dom"],
		changesets: [
			{
				file: ".changeset/empty.md",
				packages: [],
				isEmpty: true,
				malformed: false,
			},
		],
	});
	assert(
		!hasFailures(emptied),
		"self-test: an empty changeset is an explicit no-release decision",
	);

	const broken = evaluateCoverage({
		changed: [],
		changesets: [
			{
				file: ".changeset/broken.md",
				packages: [],
				isEmpty: false,
				malformed: true,
			},
		],
	});
	assert(
		hasFailures(broken),
		"self-test: a malformed changeset fails even with no changed packages",
	);

	const untouched = evaluateCoverage({ changed: [], changesets: [] });
	assert(
		!hasFailures(untouched),
		"self-test: a branch that touches no published source needs no changeset",
	);

	const majorOnZero = evaluateCoverage({
		changed: ["@input/pen-core"],
		trainIsZeroX: true,
		changesets: [
			{
				file: ".changeset/oops.md",
				packages: ["@input/pen-core"],
				bumps: [{ name: "@input/pen-core", bump: "major" }],
				isEmpty: false,
				malformed: false,
			},
		],
	});
	assert(
		hasFailures(majorOnZero) &&
			majorOnZero.majorBumps.some(
				(bump) => bump.package === "@input/pen-core",
			),
		"self-test: major on a 0.x train fails closed",
	);

	const majorOnOne = evaluateCoverage({
		changed: ["@input/pen-core"],
		trainIsZeroX: false,
		changesets: [
			{
				file: ".changeset/one.md",
				packages: ["@input/pen-core"],
				bumps: [{ name: "@input/pen-core", bump: "major" }],
				isEmpty: false,
				malformed: false,
			},
		],
	});
	assert(
		!hasFailures(majorOnOne),
		"self-test: major is allowed once the train leaves 0.x",
	);
}

function git(repoRoot, args) {
	const result = spawnSync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	if (result.error) {
		throw new Error(`git ${args.join(" ")}: ${result.error.message}`);
	}
	return result;
}

function refExists(repoRoot, ref) {
	return git(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
		.status === 0;
}

export function resolveBaseRef(repoRoot, explicit) {
	if (explicit != null) {
		if (!refExists(repoRoot, explicit)) {
			throw new Error(`changeset-check: base ref not found: ${explicit}`);
		}
		return explicit;
	}

	const fromEnv = process.env.GITHUB_BASE_REF;
	if (fromEnv != null && fromEnv.length > 0) {
		for (const candidate of [`origin/${fromEnv}`, fromEnv]) {
			if (refExists(repoRoot, candidate)) {
				return candidate;
			}
		}
		throw new Error(
			`changeset-check: GITHUB_BASE_REF=${fromEnv} is not fetched. Check out with fetch-depth: 0.`,
		);
	}

	for (const candidate of FALLBACK_BASE_REFS) {
		if (refExists(repoRoot, candidate)) {
			return candidate;
		}
	}

	throw new Error(
		`changeset-check: no base ref found (tried ${FALLBACK_BASE_REFS.join(", ")}). Pass --base <ref>.`,
	);
}

export function changedFilesSince(repoRoot, base) {
	const result = git(repoRoot, ["diff", "--name-only", `${base}...HEAD`]);
	if (result.status !== 0) {
		throw new Error(
			`changeset-check: git diff ${base}...HEAD failed: ${result.stderr.trim()}`,
		);
	}
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function collectPackageJsonPaths(directory) {
	const found = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIR_NAMES.has(entry.name)) {
				found.push(...collectPackageJsonPaths(entryPath));
			}
			continue;
		}
		if (entry.isFile() && entry.name === "package.json") {
			found.push(entryPath);
		}
	}
	return found;
}

export function loadPublishedPackages(repoRoot) {
	const packages = [];
	for (const packageJsonPath of collectPackageJsonPaths(
		path.join(repoRoot, PACKAGES_ROOT),
	)) {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		if (packageJson.private === true || typeof packageJson.name !== "string") {
			continue;
		}
		packages.push({
			name: packageJson.name,
			version:
				typeof packageJson.version === "string" ? packageJson.version : "",
			dir: path
				.relative(repoRoot, path.dirname(packageJsonPath))
				.split(path.sep)
				.join(path.posix.sep),
		});
	}
	packages.sort((left, right) => left.name.localeCompare(right.name));
	return packages;
}

export function loadChangesets(repoRoot) {
	const dir = path.join(repoRoot, CHANGESET_DIR);
	if (!fs.existsSync(dir)) {
		return [];
	}
	return fs
		.readdirSync(dir)
		.filter((name) => name.endsWith(".md") && name !== "README.md")
		.sort()
		.map((name) => ({
			file: `${CHANGESET_DIR}/${name}`,
			...parseChangeset(fs.readFileSync(path.join(dir, name), "utf8")),
		}));
}

export function loadIgnoredPackages(repoRoot) {
	const configPath = path.join(repoRoot, CHANGESET_DIR, "config.json");
	if (!fs.existsSync(configPath)) {
		return [];
	}
	const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
	return Array.isArray(config.ignore) ? config.ignore : [];
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let base = null;
	let selfTestOnly = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--base") {
			base = argv[i + 1] ?? null;
			i += 1;
			continue;
		}
		if (arg === "--self-test") {
			selfTestOnly = true;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, base, selfTestOnly };
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	runSelfTests();
	console.log(
		"changeset-check self-test ok (an uncovered published package, a malformed frontmatter, a major bump on 0.x, and a lost base ref all fail closed)",
	);
	if (args.selfTestOnly) {
		return;
	}

	const packages = loadPublishedPackages(args.repoRoot);
	if (packages.length === 0) {
		console.error(
			"changeset-check: cannot check: packages/**/package.json walk matched 0 published manifests",
		);
		process.exitCode = 1;
		return;
	}

	const base = resolveBaseRef(args.repoRoot, args.base);
	const files = changedFilesSince(args.repoRoot, base);
	const result = evaluateCoverage({
		changed: changedPublishedPackages({ files, packages }),
		changesets: loadChangesets(args.repoRoot),
		ignored: loadIgnoredPackages(args.repoRoot),
		trainIsZeroX: packages.some((pkg) => pkg.version.startsWith("0.")),
	});

	console.log("");
	console.log(`population: ${packages.length} published packages`);
	console.log(formatReport({ base, files, result }));
	if (hasFailures(result)) {
		process.exitCode = 1;
	}
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

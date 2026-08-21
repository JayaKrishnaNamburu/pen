/**
 * Dist freshness — local guard for gates that read published `.d.ts`.
 *
 * Compares the mtime of every production type-input file under `src/`
 * (`.ts` / `.tsx` / `.mts` / `.cts`, tests excluded) against the
 * package's published root `.d.ts`. This is an mtime comparison, not a
 * content-identity check. A format-only touch can trip it.
 *
 * Three states, not two:
 *   - `fresh`    — every type-input is older than or equal to the `.d.ts`
 *   - `no-dist`  — the published root `.d.ts` is absent
 *   - `outdated` — at least one type-input is newer than the `.d.ts`
 *
 * Freshness is a local guard. CI runs `pnpm build` first, so the `.d.ts`
 * is current by construction and the `outdated` path does not fire there.
 * Do not add a CI flag for it. `no-dist` stays the existing missing-
 * artifact failure of each caller; only `outdated` is INCONCLUSIVE.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const IGNORE_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	".git",
	"playwright-report",
	"test-results",
]);

const TYPE_INPUT_IGNORE_DIR_NAMES = new Set([
	...IGNORE_DIR_NAMES,
	"__tests__",
]);

const TYPE_INPUT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const TYPE_INPUT_TEST_NAME = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function isTypeInputFile(relativePosix) {
	const normalized = relativePosix.split(path.sep).join("/");
	const parts = normalized.split("/").filter(Boolean);
	if (parts[0] !== "src" || parts.length < 2) {
		return false;
	}
	if (parts.some((part) => TYPE_INPUT_IGNORE_DIR_NAMES.has(part))) {
		return false;
	}
	const base = parts[parts.length - 1];
	if (TYPE_INPUT_TEST_NAME.test(base)) {
		return false;
	}
	const dot = base.lastIndexOf(".");
	if (dot <= 0) {
		return false;
	}
	return TYPE_INPUT_EXTENSIONS.has(base.slice(dot));
}

export function typesSpecifier(exportEntry) {
	if (exportEntry == null) {
		return null;
	}
	if (typeof exportEntry === "string") {
		return null;
	}
	if (typeof exportEntry.types === "string") {
		return exportEntry.types;
	}
	if (typeof exportEntry.import === "object" && exportEntry.import != null) {
		if (typeof exportEntry.import.types === "string") {
			return exportEntry.import.types;
		}
	}
	if (typeof exportEntry.require === "object" && exportEntry.require != null) {
		if (typeof exportEntry.require.types === "string") {
			return exportEntry.require.types;
		}
	}
	return null;
}

export function rootTypesSpecifier(pkg) {
	const exportsField = pkg.packageJson.exports;
	const entry =
		exportsField == null || typeof exportsField === "string"
			? { types: pkg.packageJson.types ?? "./dist/index.d.ts" }
			: exportsField["."];
	return (
		typesSpecifier(entry) ?? pkg.packageJson.types ?? "./dist/index.d.ts"
	);
}

async function collectTypeInputFiles(packageDir, directory, files) {
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
			if (!TYPE_INPUT_IGNORE_DIR_NAMES.has(entry.name)) {
				await collectTypeInputFiles(packageDir, entryPath, files);
			}
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const relativePosix = path
			.relative(packageDir, entryPath)
			.split(path.sep)
			.join("/");
		if (!isTypeInputFile(relativePosix)) {
			continue;
		}
		const stat = await fs.stat(entryPath);
		files.push({
			relativePosix,
			absolute: entryPath,
			mtimeMs: stat.mtimeMs,
		});
	}
}

export async function listTypeInputFiles(packageDir) {
	const files = [];
	await collectTypeInputFiles(
		packageDir,
		path.join(packageDir, "src"),
		files,
	);
	files.sort((left, right) =>
		left.relativePosix.localeCompare(right.relativePosix),
	);
	return files;
}

export async function assessDistFreshness(pkg) {
	const specifier = rootTypesSpecifier(pkg);
	if (specifier.includes("*")) {
		return { status: "fresh", newer: [] };
	}
	const dtsPath = path.join(pkg.dir, specifier);
	let distMtime;
	try {
		distMtime = (await fs.stat(dtsPath)).mtimeMs;
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return { status: "no-dist", newer: [] };
		}
		throw error;
	}
	const inputs = await listTypeInputFiles(pkg.dir);
	const newer = inputs.filter((file) => file.mtimeMs > distMtime);
	return {
		status: newer.length > 0 ? "outdated" : "fresh",
		newer,
	};
}

export async function collectOutdatedDist(packages) {
	const outdatedDist = [];
	for (const pkg of packages) {
		const freshness = await assessDistFreshness(pkg);
		if (freshness.status === "outdated") {
			outdatedDist.push({
				package: pkg.name,
				newerCount: freshness.newer.length,
			});
		}
	}
	return outdatedDist;
}

export function appendOutdatedDistLines(lines, outdatedDist) {
	if (outdatedDist.length === 0) {
		return;
	}
	lines.push("");
	lines.push(
		"outdated dist (type-input source newer than published .d.ts):",
	);
	for (const hit of outdatedDist) {
		lines.push(
			`  ${hit.package} (${hit.newerCount} ${
				hit.newerCount === 1 ? "file" : "files"
			} newer)`,
		);
	}
	lines.push("");
	const filters = outdatedDist
		.map((hit) => `--filter ${hit.package}`)
		.join(" ");
	lines.push(`rebuild: pnpm ${filters} build`);
}

export function runTypeInputSelfTests() {
	if (isTypeInputFile("src/index.ts") !== true) {
		throw new Error("self-test: src/index.ts is a type input");
	}
	if (isTypeInputFile("src/editor/apply.tsx") !== true) {
		throw new Error("self-test: src tsx is a type input");
	}
	if (isTypeInputFile("src/foo.test.ts") !== false) {
		throw new Error("self-test: colocated test is not a type input");
	}
	if (isTypeInputFile("src/__tests__/bar.ts") !== false) {
		throw new Error("self-test: __tests__ is not a type input");
	}
	if (isTypeInputFile("README.md") !== false) {
		throw new Error("self-test: non-src is not a type input");
	}
	if (isTypeInputFile("package.json") !== false) {
		throw new Error("self-test: package.json is not a type input");
	}
}

export async function runFreshnessSelfTests() {
	runTypeInputSelfTests();
	const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pen-dist-freshness-"));
	try {
		await runFreshnessSelfTestsIn(tmpRoot);
	} finally {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	}
}

async function runFreshnessSelfTestsIn(tmpRoot) {
	const packageDir = path.join(tmpRoot, "pkg");
	const srcDir = path.join(packageDir, "src");
	const distDir = path.join(packageDir, "dist");
	const testsDir = path.join(srcDir, "__tests__");
	await fs.mkdir(testsDir, { recursive: true });
	await fs.mkdir(distDir, { recursive: true });
	await fs.writeFile(
		path.join(packageDir, "package.json"),
		`${JSON.stringify({
			name: "@input/pen-freshness-fixture",
			types: "./dist/index.d.ts",
			exports: { ".": { types: "./dist/index.d.ts" } },
		})}\n`,
	);
	const srcPath = path.join(srcDir, "index.ts");
	const testPath = path.join(srcDir, "index.test.ts");
	const nestedTestPath = path.join(testsDir, "hidden.ts");
	const dtsPath = path.join(distDir, "index.d.ts");
	const dts = "export declare const FLAG: 1;\n";
	await fs.writeFile(srcPath, "export const FLAG = 1;\n");
	await fs.writeFile(testPath, "export const TEST = 1;\n");
	await fs.writeFile(nestedTestPath, "export const HIDDEN = 1;\n");
	await fs.writeFile(dtsPath, dts);

	const listed = await listTypeInputFiles(packageDir);
	if (listed.map((file) => file.relativePosix).join(",") !== "src/index.ts") {
		throw new Error("self-test: type inputs exclude tests");
	}

	const past = new Date("2020-01-01T00:00:00.000Z");
	const recent = new Date("2026-08-21T00:00:00.000Z");
	await fs.utimes(dtsPath, past, past);
	await fs.utimes(srcPath, recent, recent);
	await fs.utimes(testPath, recent, recent);

	const fixturePkg = {
		name: "@input/pen-freshness-fixture",
		dir: packageDir,
		keys: ["."],
		packageJson: JSON.parse(
			await fs.readFile(path.join(packageDir, "package.json"), "utf8"),
		),
	};

	const outdated = await assessDistFreshness(fixturePkg);
	if (outdated.status !== "outdated") {
		throw new Error("self-test: newer src mtime is outdated dist");
	}
	if (
		outdated.newer.length !== 1 ||
		outdated.newer[0].relativePosix !== "src/index.ts"
	) {
		throw new Error("self-test: outdated dist names the newer type input");
	}

	const collected = await collectOutdatedDist([fixturePkg]);
	if (
		collected.length !== 1 ||
		collected[0].package !== fixturePkg.name ||
		collected[0].newerCount !== 1
	) {
		throw new Error("self-test: collectOutdatedDist names the outdated package");
	}

	const printed = [];
	appendOutdatedDistLines(printed, collected);
	if (!printed.join("\n").includes(fixturePkg.name)) {
		throw new Error("self-test: outdated listing names the package");
	}
	if (!printed.join("\n").includes("rebuild: pnpm --filter @input/pen-freshness-fixture build")) {
		throw new Error("self-test: outdated listing names the rebuild");
	}

	await fs.utimes(dtsPath, recent, recent);
	await fs.utimes(srcPath, past, past);
	const fresh = await assessDistFreshness(fixturePkg);
	if (fresh.status !== "fresh" || fresh.newer.length !== 0) {
		throw new Error("self-test: older src mtime is fresh dist");
	}

	await fs.rm(dtsPath);
	const missing = await assessDistFreshness(fixturePkg);
	if (missing.status !== "no-dist" || missing.newer.length !== 0) {
		throw new Error("self-test: missing published .d.ts is no-dist");
	}
}

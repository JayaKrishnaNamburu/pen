#!/usr/bin/env node
/**
 * Host-shaped install proof (spec-v3 Wave 6 Step 6.5 / SF4).
 *
 * Publishes the production `@input/pen-*` closure of the top-level host
 * packages to a local Verdaccio, then `pnpm add`s those packages in a
 * temp project outside the workspace, builds, and runs the mount-and-edit
 * smoke from `examples/e2e/smoke.spec.ts`. Workspace-symlink installs
 * prove nothing here: this is the only check that exercises `exports`
 * maps, `files`, and peer ranges the way a host does.
 *
 * This is not an `npm publish` to the public registry. The script
 * refuses any registry that is not loopback and rewrites every packed
 * `publishConfig.registry` before the local publish.
 *
 * Distinct from `core-clean-install.mjs`: that script walks published
 * manifests in-memory and asserts core's production closure stays in
 * {core, crdt-yjs, types}. It never packs, publishes, or installs. This
 * script reuses `productionClosure` / `loadConsumerPackages` for the
 * graph walk and then does the host-shaped remainder.
 *
 * Outcomes (message and exit path are distinct):
 *   PASS         exit 0
 *   FAIL         exit 1
 *   INCONCLUSIVE exit 2  — could not measure (missing verdaccio, no
 *                           network, smoke harness absent). Not a pass.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadConsumerPackages,
	productionClosure,
} from "./core-clean-install.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_INCONCLUSIVE = 2;

export const DEFAULT_TOP_LEVEL = [
	"@input/pen-core",
	"@input/pen-preset-default",
	"@input/pen-react",
	"@input/pen-vue",
	"@input/pen-dom",
];

const HOST_PEERS = ["react", "react-dom", "vue", "yjs", "y-protocols"];
const HOST_DEV_DEPS = [
	"typescript",
	"vite",
	"@vitejs/plugin-react",
	"@types/react",
	"@types/react-dom",
];

const MISSING_EXPORTS_SUBPATH = "not-exported";
const OMITTED_FILES_PACKAGE = "@input/pen-fixture-omitted";
const OMITTED_FILES_FILE = "schema.json";
const SMOKE_SPEC_REL = path.join("examples", "e2e", "smoke.spec.ts");
const SMOKE_CONFIG_REL = path.join(
	"scripts",
	"__fixtures__",
	"verdaccio-closure-check",
	"playwright.config.ts",
);

export function exportsFailureReason(specifier) {
	return `FAIL exports: ${specifier} is not in the published exports map`;
}

export function filesFailureReason(packageName, omittedFile) {
	return `FAIL files: ${packageName} published dist but omitted required file ${omittedFile}`;
}

export function parseArgs(argv) {
	const args = {
		repoRoot: DEFAULT_REPO_ROOT,
		selfTestOnly: false,
		proveFail: null,
		requireSubpaths: [],
		skipSmoke: false,
		keepTemp: false,
		topLevel: [...DEFAULT_TOP_LEVEL],
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			args.selfTestOnly = true;
			continue;
		}
		if (arg === "--skip-smoke") {
			args.skipSmoke = true;
			continue;
		}
		if (arg === "--keep-temp") {
			args.keepTemp = true;
			continue;
		}
		if (arg === "--repo-root") {
			args.repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--prove-fail") {
			const kind = argv[i + 1] ?? "";
			if (kind !== "exports" && kind !== "files") {
				throw new Error(
					"Unknown --prove-fail kind (expected exports or files)",
				);
			}
			args.proveFail = kind;
			i += 1;
			continue;
		}
		if (arg === "--require-subpath") {
			const specifier = argv[i + 1] ?? "";
			if (specifier.length === 0) {
				throw new Error("--require-subpath needs a specifier");
			}
			args.requireSubpaths.push(specifier);
			i += 1;
			continue;
		}
		if (arg === "--top-level") {
			const names = (argv[i + 1] ?? "")
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean);
			if (names.length === 0) {
				throw new Error(
					"--top-level needs a comma-separated package list",
				);
			}
			args.topLevel = names;
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return args;
}

export function assertLocalRegistry(registryUrl) {
	let parsed;
	try {
		parsed = new URL(registryUrl);
	} catch {
		throw new Error(
			`refuse: registry is not loopback (${registryUrl}); this script never publishes off-machine`,
		);
	}
	if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
		throw new Error(
			`refuse: registry is not loopback (${registryUrl}); this script never publishes off-machine`,
		);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(
			`refuse: registry is not loopback (${registryUrl}); this script never publishes off-machine`,
		);
	}
}

export function assertOutsideRepo(dir, repoRoot) {
	const resolvedDir = path.resolve(dir);
	const resolvedRoot = path.resolve(repoRoot);
	const relative = path.relative(resolvedRoot, resolvedDir);
	if (relative === "" || !relative.startsWith("..")) {
		throw new Error(
			"FAIL host project is inside the workspace; a workspace install proves nothing",
		);
	}
}

export function rewritePublishConfig(manifest, registryUrl) {
	assertLocalRegistry(registryUrl);
	return {
		...manifest,
		publishConfig: {
			...(manifest.publishConfig ?? {}),
			access: "public",
			registry: registryUrl,
		},
	};
}

export function tarballFileName(name, version) {
	return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

export function parseScopedSpecifier(specifier) {
	const parts = specifier.split("/").filter(Boolean);
	if (specifier.startsWith("@")) {
		if (parts.length < 2) {
			throw new Error(`not a scoped specifier: ${specifier}`);
		}
		return {
			name: `${parts[0]}/${parts[1]}`,
			subpath: parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".",
		};
	}
	return {
		name: parts[0],
		subpath: parts.length > 1 ? `./${parts.slice(1).join("/")}` : ".",
	};
}

export function exportTargetPath(entry) {
	if (typeof entry === "string") {
		return normalizeExportTarget(entry);
	}
	if (entry == null || typeof entry !== "object") {
		return null;
	}
	if (typeof entry.import === "string") {
		return normalizeExportTarget(entry.import);
	}
	if (
		entry.import != null &&
		typeof entry.import === "object" &&
		typeof entry.import.default === "string"
	) {
		return normalizeExportTarget(entry.import.default);
	}
	if (typeof entry.default === "string") {
		return normalizeExportTarget(entry.default);
	}
	if (
		entry.require != null &&
		typeof entry.require === "object" &&
		typeof entry.require.default === "string"
	) {
		return normalizeExportTarget(entry.require.default);
	}
	if (typeof entry.require === "string") {
		return normalizeExportTarget(entry.require);
	}
	return null;
}

function normalizeExportTarget(target) {
	if (target.includes("*")) {
		return null;
	}
	return target.replace(/^\.\//, "");
}

export function lookupExportEntry(manifest, subpath) {
	const exportsField = manifest.exports;
	if (exportsField == null) {
		return subpath === "." ? "." : null;
	}
	if (typeof exportsField === "string") {
		return subpath === "." ? exportsField : null;
	}
	if (typeof exportsField !== "object" || Array.isArray(exportsField)) {
		return null;
	}
	if (Object.hasOwn(exportsField, subpath)) {
		return exportsField[subpath];
	}
	return null;
}

export function classifyHostResolveFailure({
	specifier,
	error,
	inExports,
	exportTarget,
	targetExists,
}) {
	if (inExports === false) {
		return {
			outcome: "FAIL",
			reason: exportsFailureReason(specifier),
		};
	}
	if (inExports === true && exportTarget != null && targetExists === false) {
		const { name } = parseScopedSpecifier(specifier);
		return {
			outcome: "FAIL",
			reason: filesFailureReason(name, path.basename(exportTarget)),
		};
	}
	const code = error?.code;
	if (code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
		return {
			outcome: "FAIL",
			reason: exportsFailureReason(specifier),
		};
	}
	if (
		code === "ERR_MODULE_NOT_FOUND" &&
		exportTarget != null &&
		targetExists === false
	) {
		const { name } = parseScopedSpecifier(specifier);
		return {
			outcome: "FAIL",
			reason: filesFailureReason(name, path.basename(exportTarget)),
		};
	}
	return {
		outcome: "FAIL",
		reason: `FAIL resolve: ${specifier} (${code ?? "unknown"}: ${error?.message ?? error})`,
	};
}

export function unionProductionClosure({ packages, starts }) {
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const union = new Map();
	const missingStarts = [];
	for (const start of starts) {
		if (!byName.has(start)) {
			missingStarts.push(start);
			continue;
		}
		const { reachable } = productionClosure({ packages, start });
		for (const [name, info] of reachable) {
			if (!union.has(name)) {
				union.set(name, info.pkg ?? byName.get(name) ?? null);
			}
		}
	}
	return { byName, union, missingStarts };
}

export function topologicalNames(union) {
	const remaining = new Map();
	for (const [name, pkg] of union) {
		remaining.set(
			name,
			new Set((pkg?.dependencies ?? []).filter((dep) => union.has(dep))),
		);
	}
	const ordered = [];
	while (remaining.size > 0) {
		const ready = [...remaining.entries()]
			.filter(([, deps]) => deps.size === 0)
			.map(([name]) => name)
			.sort();
		if (ready.length === 0) {
			throw new Error(
				`FAIL closure has a dependency cycle: ${[...remaining.keys()].sort().join(", ")}`,
			);
		}
		for (const name of ready) {
			ordered.push(name);
			remaining.delete(name);
			for (const deps of remaining.values()) {
				deps.delete(name);
			}
		}
	}
	return ordered;
}

export function verdaccioConfigYaml() {
	return [
		"storage: ./storage",
		"web:",
		"  enable: false",
		"auth:",
		"  htpasswd:",
		"    file: ./htpasswd",
		"    max_users: -1",
		"uplinks:",
		"  npmjs:",
		"    url: https://registry.npmjs.org/",
		"packages:",
		"  '@input/*':",
		"    access: $all",
		"    publish: $all",
		"    unpublish: $all",
		"  '**':",
		"    access: $all",
		"    publish: $authenticated",
		"    proxy: npmjs",
		"logs:",
		"  - { type: stdout, format: pretty, level: warn }",
		"",
	].join("\n");
}

export function localNpmrcContents(registryUrl) {
	assertLocalRegistry(registryUrl);
	const host = new URL(registryUrl).host;
	return [
		`registry=${registryUrl}`,
		`@input:registry=${registryUrl}`,
		`//${host}/:_authToken=verdaccio-local`,
		"",
	].join("\n");
}

export function stripPublicRegistryAuth(env) {
	const next = { ...env };
	for (const key of Object.keys(next)) {
		const lower = key.toLowerCase();
		if (
			lower === "npm_token" ||
			lower === "node_auth_token" ||
			lower.includes("registry.npmjs") ||
			(lower.includes("_authtoken") && lower.includes("npm"))
		) {
			delete next[key];
		}
	}
	return next;
}

export function isolatedRegistryEnv({
	registryUrl,
	userconfig,
	env = process.env,
}) {
	assertLocalRegistry(registryUrl);
	const next = stripPublicRegistryAuth(env);
	next.NPM_CONFIG_USERCONFIG = userconfig;
	next.NPM_CONFIG_GLOBALCONFIG = path.join(
		path.dirname(userconfig),
		"empty.npmrc",
	);
	next.npm_config_registry = registryUrl;
	next.NPM_CONFIG_REGISTRY = registryUrl;
	next.npm_config_update_notifier = "false";
	return next;
}

export function formatOutcome({ outcome, reason, details = [] }) {
	const headline =
		reason.startsWith(`${outcome}:`) || reason.startsWith(`${outcome} `)
			? reason
			: `${outcome}: ${reason}`;
	const lines = [headline];
	for (const detail of details) {
		lines.push(`  ${detail}`);
	}
	return lines.join("\n");
}

export function inspectPackedExportTargets(packageRoot, manifest) {
	const missing = [];
	const exportsField = manifest.exports;
	if (exportsField == null || typeof exportsField !== "object") {
		return missing;
	}
	for (const [key, entry] of Object.entries(exportsField)) {
		const target = exportTargetPath(entry);
		if (target == null) {
			continue;
		}
		if (!existsSync(path.join(packageRoot, target))) {
			missing.push({ key, target });
		}
	}
	return missing;
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTests() {
	assertLocalRegistry("http://127.0.0.1:4873/");
	assertLocalRegistry("http://localhost:4873");
	let refused = false;
	try {
		assertLocalRegistry("https://registry.npmjs.org/");
	} catch (error) {
		refused = String(error.message).includes("not loopback");
	}
	assert(refused, "self-test: public registry must be refused");

	const rewritten = rewritePublishConfig(
		{
			name: "@input/pen-core",
			publishConfig: {
				access: "public",
				registry: "https://registry.npmjs.org/",
			},
		},
		"http://127.0.0.1:4873/",
	);
	assert(
		rewritten.publishConfig.registry === "http://127.0.0.1:4873/",
		"self-test: publishConfig.registry must be rewritten to loopback",
	);

	assert(
		tarballFileName("@input/pen-core", "0.0.1") ===
			"input-pen-core-0.0.1.tgz",
		"self-test: scoped tarball name",
	);
	assert(
		parseScopedSpecifier("@input/pen-core/not-exported").subpath ===
			"./not-exported",
		"self-test: scoped subpath parse",
	);

	assertOutsideRepo("/tmp/pen-verdaccio-host-x", DEFAULT_REPO_ROOT);
	let inside = false;
	try {
		assertOutsideRepo(
			path.join(DEFAULT_REPO_ROOT, "tmp-host"),
			DEFAULT_REPO_ROOT,
		);
	} catch (error) {
		inside = String(error.message).includes("inside the workspace");
	}
	assert(inside, "self-test: in-repo host dir must fail");

	const types = {
		name: "@input/pen-types",
		dir: "packages/types",
		dependencies: [],
	};
	const crdt = {
		name: "@input/pen-crdt-yjs",
		dir: "packages/crdt/yjs",
		dependencies: ["@input/pen-types"],
	};
	const core = {
		name: "@input/pen-core",
		dir: "packages/core",
		dependencies: ["@input/pen-types", "@input/pen-crdt-yjs"],
	};
	const react = {
		name: "@input/pen-react",
		dir: "packages/rendering/react",
		dependencies: ["@input/pen-core"],
	};
	const { union, missingStarts } = unionProductionClosure({
		packages: [types, crdt, core, react],
		starts: ["@input/pen-core", "@input/pen-react"],
	});
	assert(missingStarts.length === 0, "self-test: starts must exist");
	assert(union.has("@input/pen-types"), "self-test: union includes types");
	assert(union.has("@input/pen-react"), "self-test: union includes react");
	assert(
		topologicalNames(union).indexOf("@input/pen-types") <
			topologicalNames(union).indexOf("@input/pen-core"),
		"self-test: types publishes before core",
	);

	const exportsClassified = classifyHostResolveFailure({
		specifier: "@input/pen-core/not-exported",
		error: { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" },
		inExports: false,
	});
	assert(
		exportsClassified.reason ===
			exportsFailureReason("@input/pen-core/not-exported"),
		"self-test: missing exports subpath is named, not a generic install error",
	);

	const filesClassified = classifyHostResolveFailure({
		specifier: `${OMITTED_FILES_PACKAGE}/schema`,
		error: { code: "ERR_MODULE_NOT_FOUND" },
		inExports: true,
		exportTarget: OMITTED_FILES_FILE,
		targetExists: false,
	});
	assert(
		filesClassified.reason ===
			filesFailureReason(OMITTED_FILES_PACKAGE, OMITTED_FILES_FILE),
		"self-test: files allowlist omission is named",
	);

	const packedMissing = inspectPackedExportTargets("/tmp/does-not-exist", {
		exports: {
			".": { import: { default: "./dist/index.mjs" } },
			"./schema": "./schema.json",
		},
	});
	assert(
		packedMissing.some((entry) => entry.target === "schema.json"),
		"self-test: packed-export inspection names the omitted file",
	);

	assert(
		verdaccioConfigYaml().includes("registry.npmjs.org/"),
		"self-test: verdaccio config keeps an uplink for public peers",
	);
	assert(
		verdaccioConfigYaml().includes("publish: $all"),
		"self-test: @input/* is anonymously publishable on the local registry",
	);
	assert(
		formatOutcome({
			outcome: "INCONCLUSIVE",
			reason: "verdaccio is not installed and could not be fetched (npx verdaccio)",
		}).startsWith("INCONCLUSIVE:"),
		"self-test: INCONCLUSIVE is a distinct prefix",
	);

	console.log(
		"verdaccio-closure-check self-test ok (loopback refuse, publishConfig rewrite, named exports/files failures, in-repo host dir fails, closure topo)",
	);
}

function allocatePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port =
				typeof address === "object" && address != null
					? address.port
					: 0;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
		server.on("error", reject);
	});
}

function waitForHttp(url, timeoutMs) {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const attempt = () => {
			const req = http.get(url, (res) => {
				res.resume();
				resolve(res.statusCode ?? 0);
			});
			req.on("error", () => {
				if (Date.now() - started > timeoutMs) {
					reject(
						new Error(
							`INCONCLUSIVE: verdaccio did not become ready at ${url}`,
						),
					);
					return;
				}
				setTimeout(attempt, 200);
			});
		};
		attempt();
	});
}

function runCapture(command, args, options) {
	return spawnSync(command, args, {
		encoding: "utf8",
		...options,
	});
}

function commandOutput(result) {
	return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function inconclusive(reason, details = []) {
	return {
		outcome: "INCONCLUSIVE",
		exitCode: EXIT_INCONCLUSIVE,
		reason,
		details,
	};
}

function fail(reason, details = []) {
	return {
		outcome: "FAIL",
		exitCode: EXIT_FAIL,
		reason,
		details,
	};
}

function pass(reason, details = []) {
	return {
		outcome: "PASS",
		exitCode: EXIT_PASS,
		reason,
		details,
	};
}

async function obtainVerdaccio(scratch) {
	const fromEnv = process.env.VERDACCIO_BIN;
	if (
		typeof fromEnv === "string" &&
		fromEnv.length > 0 &&
		existsSync(fromEnv)
	) {
		return { bin: fromEnv, argsPrefix: [] };
	}
	const version = runCapture("npx", ["--yes", "verdaccio@6", "--version"], {
		cwd: scratch,
		timeout: 120_000,
		env: stripPublicRegistryAuth(process.env),
	});
	if (version.status !== 0) {
		return {
			error: inconclusive(
				"verdaccio is not installed and could not be fetched (npx verdaccio)",
				[
					commandOutput(version).trim() ||
						version.error?.message ||
						`npx exited ${version.status}`,
				],
			),
		};
	}
	return { bin: "npx", argsPrefix: ["--yes", "verdaccio@6"] };
}

async function startVerdaccio({ scratch, repoRoot }) {
	assertOutsideRepo(scratch, repoRoot);
	const verdaccioDir = path.join(scratch, "verdaccio");
	await fs.mkdir(path.join(verdaccioDir, "storage"), { recursive: true });
	const configPath = path.join(verdaccioDir, "config.yaml");
	await fs.writeFile(configPath, verdaccioConfigYaml());
	const obtained = await obtainVerdaccio(scratch);
	if (obtained.error) {
		return obtained.error;
	}
	const port = await allocatePort();
	const registryUrl = `http://127.0.0.1:${port}/`;
	const userconfig = path.join(scratch, "local.npmrc");
	const globalconfig = path.join(scratch, "empty.npmrc");
	await fs.writeFile(userconfig, localNpmrcContents(registryUrl));
	await fs.writeFile(globalconfig, "");
	const child = spawn(
		obtained.bin,
		[
			...obtained.argsPrefix,
			"--config",
			configPath,
			"--listen",
			`127.0.0.1:${port}`,
		],
		{
			cwd: verdaccioDir,
			env: stripPublicRegistryAuth(process.env),
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	const logs = [];
	child.stdout.on("data", (chunk) => {
		logs.push(String(chunk));
	});
	child.stderr.on("data", (chunk) => {
		logs.push(String(chunk));
	});
	let exited = null;
	child.on("exit", (code, signal) => {
		exited = { code, signal };
	});
	try {
		await waitForHttp(registryUrl, 30_000);
	} catch (error) {
		child.kill("SIGTERM");
		return inconclusive(
			`verdaccio did not become ready at ${registryUrl}`,
			[
				error instanceof Error ? error.message : String(error),
				...logs.join("").split("\n").filter(Boolean).slice(-8),
				exited ? `process exited ${exited.code ?? exited.signal}` : "",
			].filter(Boolean),
		);
	}
	return {
		registryUrl,
		userconfig,
		child,
		stop() {
			if (child.exitCode == null && child.signalCode == null) {
				child.kill("SIGTERM");
			}
		},
	};
}

async function loadClosurePackages({ repoRoot, starts }) {
	const packages = await loadConsumerPackages(repoRoot);
	const { union, missingStarts } = unionProductionClosure({
		packages,
		starts,
	});
	if (missingStarts.length > 0) {
		return fail(
			`top-level package(s) are not published workspace packages: ${missingStarts.join(", ")}`,
		);
	}
	const unresolved = [...union.entries()]
		.filter(([, pkg]) => pkg == null)
		.map(([name]) => name);
	if (unresolved.length > 0) {
		return fail(
			`closure names workspace packages that are not under packages/: ${unresolved.join(", ")}`,
		);
	}
	const ordered = topologicalNames(union);
	const loaded = [];
	for (const name of ordered) {
		const pkg = union.get(name);
		const manifest = JSON.parse(
			await fs.readFile(
				path.join(repoRoot, pkg.dir, "package.json"),
				"utf8",
			),
		);
		loaded.push({
			...pkg,
			version: manifest.version,
			manifest,
		});
	}
	return { packages: loaded };
}

async function packAndRewrite({ pkg, repoRoot, scratch, registryUrl }) {
	const packDir = path.join(scratch, "tarballs");
	await fs.mkdir(packDir, { recursive: true });
	const packed = runCapture("pnpm", ["pack", "--pack-destination", packDir], {
		cwd: path.join(repoRoot, pkg.dir),
		timeout: 60_000,
	});
	if (packed.status !== 0) {
		return fail(`pnpm pack failed for ${pkg.name}`, [
			commandOutput(packed).trim(),
		]);
	}
	const tarball = path.join(packDir, tarballFileName(pkg.name, pkg.version));
	if (!existsSync(tarball)) {
		return fail(`pnpm pack did not write ${path.basename(tarball)}`, [
			commandOutput(packed).trim(),
		]);
	}
	const extractDir = path.join(
		scratch,
		"extract",
		pkg.name.replace("/", "-"),
	);
	await fs.rm(extractDir, { recursive: true, force: true });
	await fs.mkdir(extractDir, { recursive: true });
	const extracted = runCapture("tar", ["-xzf", tarball, "-C", extractDir]);
	if (extracted.status !== 0) {
		return fail(`tar extract failed for ${pkg.name}`, [
			commandOutput(extracted).trim(),
		]);
	}
	const packageRoot = path.join(extractDir, "package");
	const packedManifestPath = path.join(packageRoot, "package.json");
	const packedManifest = JSON.parse(
		await fs.readFile(packedManifestPath, "utf8"),
	);
	const rewritten = rewritePublishConfig(packedManifest, registryUrl);
	await fs.writeFile(
		packedManifestPath,
		`${JSON.stringify(rewritten, null, 2)}\n`,
	);
	const missing = inspectPackedExportTargets(packageRoot, rewritten);
	const rewrittenTarball = path.join(
		scratch,
		"rewritten",
		tarballFileName(pkg.name, pkg.version),
	);
	await fs.mkdir(path.dirname(rewrittenTarball), { recursive: true });
	const retar = runCapture("tar", [
		"-czf",
		rewrittenTarball,
		"-C",
		extractDir,
		"package",
	]);
	if (retar.status !== 0) {
		return fail(`re-tar failed for ${pkg.name}`, [
			commandOutput(retar).trim(),
		]);
	}
	return { tarball: rewrittenTarball, missing, manifest: rewritten };
}

async function publishTarball({ tarball, registryUrl, userconfig, scratch }) {
	assertLocalRegistry(registryUrl);
	const published = runCapture(
		"npm",
		[
			"publish",
			tarball,
			"--registry",
			registryUrl,
			"--userconfig",
			userconfig,
			"--ignore-scripts",
		],
		{
			cwd: scratch,
			timeout: 60_000,
			env: isolatedRegistryEnv({ registryUrl, userconfig }),
		},
	);
	if (published.status !== 0) {
		return fail(`local npm publish failed for ${path.basename(tarball)}`, [
			commandOutput(published).trim(),
		]);
	}
	return { ok: true };
}

async function createHostProject({
	scratch,
	repoRoot,
	registryUrl,
	userconfig,
}) {
	const hostDir = path.join(scratch, "host");
	await fs.mkdir(path.join(hostDir, "src"), { recursive: true });
	assertOutsideRepo(hostDir, repoRoot);
	await fs.writeFile(
		path.join(hostDir, "package.json"),
		`${JSON.stringify(
			{
				name: "pen-host-closure-check",
				private: true,
				version: "0.0.0",
				type: "module",
				scripts: {
					build: "vite build",
					preview: "vite preview",
				},
			},
			null,
			2,
		)}\n`,
	);
	await fs.writeFile(
		path.join(hostDir, ".npmrc"),
		localNpmrcContents(registryUrl),
	);
	await fs.writeFile(
		path.join(hostDir, "tsconfig.json"),
		`${JSON.stringify(
			{
				compilerOptions: {
					target: "ES2022",
					lib: ["ES2022", "DOM", "DOM.Iterable"],
					module: "ESNext",
					moduleResolution: "bundler",
					jsx: "react-jsx",
					strict: true,
					noEmit: true,
					skipLibCheck: true,
					isolatedModules: true,
					types: ["vite/client"],
				},
				include: ["src"],
			},
			null,
			2,
		)}\n`,
	);
	await fs.writeFile(
		path.join(hostDir, "vite.config.ts"),
		[
			'import { defineConfig } from "vite";',
			'import react from "@vitejs/plugin-react";',
			"",
			"export default defineConfig({",
			"  plugins: [react()],",
			"});",
			"",
		].join("\n"),
	);
	await fs.writeFile(
		path.join(hostDir, "index.html"),
		[
			"<!doctype html>",
			'<html lang="en">',
			"  <head>",
			'    <meta charset="UTF-8" />',
			'    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
			"    <title>Pen host closure check</title>",
			"  </head>",
			"  <body>",
			'    <div id="app"></div>',
			'    <script type="module" src="/src/main.tsx"></script>',
			"  </body>",
			"</html>",
			"",
		].join("\n"),
	);
	await fs.writeFile(
		path.join(hostDir, "src", "App.tsx"),
		[
			'"use client";',
			"",
			'import { createEditor } from "@input/pen-core";',
			'import { defaultPreset } from "@input/pen-preset-default";',
			'import { PenEditor } from "@input/pen-react";',
			"",
			"const editor = createEditor({",
			"  preset: defaultPreset(),",
			"});",
			"",
			"export function App() {",
			"  return <PenEditor editor={editor} />;",
			"}",
			"",
		].join("\n"),
	);
	await fs.writeFile(
		path.join(hostDir, "src", "main.tsx"),
		[
			'import { createRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			'createRoot(document.querySelector("#app")!).render(<App />);',
			"",
		].join("\n"),
	);
	return { hostDir, userconfig };
}

function classifyInstallFailure(output) {
	if (/ERR_PNPM_FETCH_404/.test(output) && /@input\/pen-/.test(output)) {
		return fail(
			"host install 404d an @input/pen-* package; the published closure is incomplete",
			[output.trim().slice(-800)],
		);
	}
	if (
		/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_FETCH_401|ERR_PNPM_FETCH_403|ERR_PNPM_FETCH_500|ERR_PNPM_FETCH_502|ERR_PNPM_FETCH_503/i.test(
			output,
		)
	) {
		return inconclusive(
			"public registry uplink could not be reached while installing host peers",
			[output.trim().slice(-800)],
		);
	}
	return fail("pnpm add of the top-level packages failed", [
		output.trim().slice(-800),
	]);
}

async function installTopLevel({
	hostDir,
	topLevel,
	registryUrl,
	userconfig,
	extraPackages = [],
}) {
	const add = runCapture(
		"pnpm",
		[
			"add",
			...topLevel,
			...HOST_PEERS,
			...extraPackages,
			"--registry",
			registryUrl,
		],
		{
			cwd: hostDir,
			timeout: 180_000,
			env: isolatedRegistryEnv({ registryUrl, userconfig }),
		},
	);
	if (add.status !== 0) {
		return classifyInstallFailure(commandOutput(add));
	}
	const addDev = runCapture(
		"pnpm",
		["add", "-D", ...HOST_DEV_DEPS, "--registry", registryUrl],
		{
			cwd: hostDir,
			timeout: 180_000,
			env: isolatedRegistryEnv({ registryUrl, userconfig }),
		},
	);
	if (addDev.status !== 0) {
		return classifyInstallFailure(commandOutput(addDev));
	}
	return {
		ok: true,
		output: `${commandOutput(add)}\n${commandOutput(addDev)}`,
	};
}

function resolveFromProject(projectDir, specifier) {
	const resolverPath = path.join(projectDir, "resolve-host-specifier.mjs");
	if (!existsSync(resolverPath)) {
		writeFileSync(
			resolverPath,
			"const specifier = process.argv[2];\nprocess.stdout.write(import.meta.resolve(specifier));\n",
		);
	}
	const result = runCapture("node", [resolverPath, specifier], {
		cwd: projectDir,
		timeout: 15_000,
	});
	if (result.status !== 0) {
		const output = commandOutput(result);
		const codeMatch = output.match(/Error \[([A-Z0-9_]+)\]/);
		return {
			ok: false,
			error: {
				code: codeMatch?.[1] ?? "ERR_MODULE_NOT_FOUND",
				message: output.trim(),
			},
		};
	}
	return { ok: true, resolved: (result.stdout ?? "").trim() };
}

async function readInstalledManifest(hostDir, packageName) {
	const manifestPath = path.join(
		hostDir,
		"node_modules",
		...packageName.split("/"),
		"package.json",
	);
	if (!existsSync(manifestPath)) {
		return null;
	}
	return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

async function evaluateSpecifier(hostDir, specifier) {
	const { name, subpath } = parseScopedSpecifier(specifier);
	const installedDir = path.join(hostDir, "node_modules", ...name.split("/"));
	const manifest = await readInstalledManifest(hostDir, name);
	if (manifest == null) {
		return fail(
			`FAIL resolve: ${specifier} (package ${name} is not installed)`,
		);
	}
	const entry = lookupExportEntry(manifest, subpath);
	const inExports = entry != null;
	const exportTarget = inExports ? exportTargetPath(entry) : null;
	const targetExists =
		exportTarget != null &&
		existsSync(path.join(installedDir, exportTarget));
	if (!inExports) {
		return fail(exportsFailureReason(specifier));
	}
	if (exportTarget != null && !targetExists) {
		return fail(filesFailureReason(name, path.basename(exportTarget)));
	}
	const resolved = resolveFromProject(hostDir, specifier);
	if (!resolved.ok) {
		return fail(
			classifyHostResolveFailure({
				specifier,
				error: resolved.error,
				inExports,
				exportTarget,
				targetExists,
			}).reason,
		);
	}
	return { ok: true, resolved: resolved.resolved };
}

async function buildHost(hostDir) {
	const built = runCapture("pnpm", ["exec", "vite", "build"], {
		cwd: hostDir,
		timeout: 180_000,
	});
	if (built.status !== 0) {
		const output = commandOutput(built);
		if (
			/Package path .* is not exported|ERR_PACKAGE_PATH_NOT_EXPORTED/.test(
				output,
			)
		) {
			const match = output.match(
				/@input\/pen-[a-z0-9-]+\/[A-Za-z0-9._/-]+/,
			);
			return fail(
				exportsFailureReason(match?.[0] ?? "an @input/pen-* specifier"),
				[output.trim().slice(-800)],
			);
		}
		if (
			/Could not (?:load|resolve)|ERR_MODULE_NOT_FOUND|Failed to resolve/.test(
				output,
			)
		) {
			return fail("host build failed resolving a published file", [
				output.trim().slice(-800),
			]);
		}
		return fail("host build failed", [output.trim().slice(-800)]);
	}
	return { ok: true };
}

async function runMountAndEditSmoke({ hostDir, repoRoot }) {
	const specPath = path.join(repoRoot, SMOKE_SPEC_REL);
	const configPath = path.join(repoRoot, SMOKE_CONFIG_REL);
	if (!existsSync(specPath) || !existsSync(configPath)) {
		return inconclusive(
			`mount-and-edit smoke harness is absent (${SMOKE_SPEC_REL} / ${SMOKE_CONFIG_REL})`,
		);
	}
	const playwrightBin = path.join(
		repoRoot,
		"node_modules",
		".bin",
		"playwright",
	);
	if (!existsSync(playwrightBin)) {
		return inconclusive(
			"playwright is not installed and could not be used for the mount-and-edit smoke",
		);
	}
	const previewPort = await allocatePort();
	const smoke = runCapture(playwrightBin, ["test", "--config", configPath], {
		cwd: repoRoot,
		timeout: 180_000,
		env: {
			...process.env,
			CI: process.env.CI ?? "1",
			PEN_HOST_DIR: hostDir,
			PEN_HOST_PORT: String(previewPort),
			PEN_SMOKE_DIR: path.dirname(specPath),
		},
	});
	if (smoke.status !== 0) {
		const output = commandOutput(smoke);
		if (
			/browserType\.launch|Executable doesn't exist|Looks like Playwright/.test(
				output,
			)
		) {
			return inconclusive(
				"playwright browsers are not installed; mount-and-edit smoke could not run",
				[output.trim().slice(-800)],
			);
		}
		return fail(
			"mount-and-edit smoke failed (accessible role, visible content, click, type, character appears)",
			[output.trim().slice(-1200)],
		);
	}
	return { ok: true };
}

async function publishWorkspaceClosure({
	repoRoot,
	starts,
	scratch,
	registryUrl,
	userconfig,
}) {
	const loaded = await loadClosurePackages({ repoRoot, starts });
	if (loaded.outcome) {
		return loaded;
	}
	console.log(
		`closure (${loaded.packages.length}): ${loaded.packages.map((pkg) => pkg.name).join(", ")}`,
	);
	const filesDefects = [];
	const details = [];
	for (const pkg of loaded.packages) {
		const packed = await packAndRewrite({
			pkg,
			repoRoot,
			scratch,
			registryUrl,
		});
		if (packed.outcome) {
			return packed;
		}
		if (packed.missing.length > 0) {
			for (const entry of packed.missing) {
				filesDefects.push(
					filesFailureReason(pkg.name, path.basename(entry.target)),
				);
				details.push(
					`${pkg.name} export ${entry.key} → ${entry.target} is not in the packed tarball`,
				);
			}
		}
		const published = await publishTarball({
			tarball: packed.tarball,
			registryUrl,
			userconfig,
			scratch,
		});
		if (published.outcome) {
			return published;
		}
		console.log(`published ${pkg.name}@${pkg.version}`);
	}
	if (filesDefects.length > 0) {
		return {
			...fail(filesDefects[0], details),
			packages: loaded.packages,
		};
	}
	return { ok: true, packages: loaded.packages };
}

async function writeOmittedFilesFixture(dir) {
	await fs.mkdir(path.join(dir, "dist"), { recursive: true });
	await fs.writeFile(
		path.join(dir, "package.json"),
		`${JSON.stringify(
			{
				name: OMITTED_FILES_PACKAGE,
				version: "0.0.1",
				type: "module",
				exports: {
					".": "./dist/index.js",
					"./schema": `./${OMITTED_FILES_FILE}`,
				},
				files: ["dist"],
			},
			null,
			2,
		)}\n`,
	);
	await fs.writeFile(
		path.join(dir, "dist", "index.js"),
		"export const ok = true;\n",
	);
	await fs.writeFile(
		path.join(dir, OMITTED_FILES_FILE),
		`${JSON.stringify({ omitted: true })}\n`,
	);
}

async function packFixture({ fixtureDir, scratch, registryUrl }) {
	const packDir = path.join(scratch, "tarballs");
	await fs.mkdir(packDir, { recursive: true });
	const packed = runCapture("pnpm", ["pack", "--pack-destination", packDir], {
		cwd: fixtureDir,
		timeout: 60_000,
	});
	if (packed.status !== 0) {
		return fail("pnpm pack failed for the files-omission fixture", [
			commandOutput(packed).trim(),
		]);
	}
	const tarball = path.join(
		packDir,
		tarballFileName(OMITTED_FILES_PACKAGE, "0.0.1"),
	);
	const extractDir = path.join(scratch, "extract", "fixture-omitted");
	await fs.rm(extractDir, { recursive: true, force: true });
	await fs.mkdir(extractDir, { recursive: true });
	runCapture("tar", ["-xzf", tarball, "-C", extractDir]);
	const packageRoot = path.join(extractDir, "package");
	const packedManifestPath = path.join(packageRoot, "package.json");
	const packedManifest = JSON.parse(
		await fs.readFile(packedManifestPath, "utf8"),
	);
	const rewritten = rewritePublishConfig(packedManifest, registryUrl);
	await fs.writeFile(
		packedManifestPath,
		`${JSON.stringify(rewritten, null, 2)}\n`,
	);
	const rewrittenTarball = path.join(
		scratch,
		"rewritten",
		tarballFileName(OMITTED_FILES_PACKAGE, "0.0.1"),
	);
	await fs.mkdir(path.dirname(rewrittenTarball), { recursive: true });
	runCapture("tar", ["-czf", rewrittenTarball, "-C", extractDir, "package"]);
	return {
		tarball: rewrittenTarball,
		missing: inspectPackedExportTargets(packageRoot, rewritten),
	};
}

async function createMinimalHost({ scratch, repoRoot, registryUrl }) {
	const hostDir = path.join(scratch, "host");
	await fs.mkdir(hostDir, { recursive: true });
	assertOutsideRepo(hostDir, repoRoot);
	await fs.writeFile(
		path.join(hostDir, "package.json"),
		`${JSON.stringify(
			{
				name: "pen-host-closure-check-probe",
				private: true,
				version: "0.0.0",
				type: "module",
			},
			null,
			2,
		)}\n`,
	);
	await fs.writeFile(
		path.join(hostDir, ".npmrc"),
		localNpmrcContents(registryUrl),
	);
	return hostDir;
}

async function proveFailExports({ repoRoot, scratch, registry, keepTemp }) {
	const published = await publishWorkspaceClosure({
		repoRoot,
		starts: ["@input/pen-core"],
		scratch,
		registryUrl: registry.registryUrl,
		userconfig: registry.userconfig,
	});
	if (published.outcome) {
		return published;
	}
	const hostDir = await createMinimalHost({
		scratch,
		repoRoot,
		registryUrl: registry.registryUrl,
	});
	const add = runCapture(
		"pnpm",
		[
			"add",
			"@input/pen-core",
			"yjs",
			"y-protocols",
			"--registry",
			registry.registryUrl,
		],
		{
			cwd: hostDir,
			timeout: 180_000,
			env: isolatedRegistryEnv({
				registryUrl: registry.registryUrl,
				userconfig: registry.userconfig,
			}),
		},
	);
	if (add.status !== 0) {
		return classifyInstallFailure(commandOutput(add));
	}
	const specifier = `@input/pen-core/${MISSING_EXPORTS_SUBPATH}`;
	const evaluated = await evaluateSpecifier(hostDir, specifier);
	if (
		evaluated.outcome === "FAIL" &&
		evaluated.reason === exportsFailureReason(specifier)
	) {
		return {
			outcome: "FAIL",
			exitCode: EXIT_FAIL,
			reason: evaluated.reason,
			details: [
				"PROVED: pointing the check at a subpath that is not in @input/pen-core's exports map reports that specifically",
				keepTemp ? `temp ${scratch}` : "",
			].filter(Boolean),
			proved: true,
		};
	}
	if (evaluated.ok) {
		return fail(
			"prove-fail exports: expected a named exports failure, got PASS",
		);
	}
	return fail(
		`prove-fail exports: expected ${exportsFailureReason(specifier)}, got ${evaluated.reason}`,
	);
}

async function proveFailFiles({ repoRoot, scratch, registry, keepTemp }) {
	const fixtureDir = path.join(scratch, "fixture-omitted");
	await writeOmittedFilesFixture(fixtureDir);
	const packed = await packFixture({
		fixtureDir,
		scratch,
		registryUrl: registry.registryUrl,
	});
	if (packed.outcome) {
		return packed;
	}
	const expectedPacked = filesFailureReason(
		OMITTED_FILES_PACKAGE,
		OMITTED_FILES_FILE,
	);
	if (
		!packed.missing.some(
			(entry) => path.basename(entry.target) === OMITTED_FILES_FILE,
		)
	) {
		return fail(
			"prove-fail files: packed fixture still contained the omitted file (files allowlist did not drop it)",
		);
	}
	const published = await publishTarball({
		tarball: packed.tarball,
		registryUrl: registry.registryUrl,
		userconfig: registry.userconfig,
		scratch,
	});
	if (published.outcome) {
		return published;
	}
	const hostDir = await createMinimalHost({
		scratch,
		repoRoot,
		registryUrl: registry.registryUrl,
	});
	const add = runCapture(
		"pnpm",
		["add", OMITTED_FILES_PACKAGE, "--registry", registry.registryUrl],
		{
			cwd: hostDir,
			timeout: 180_000,
			env: isolatedRegistryEnv({
				registryUrl: registry.registryUrl,
				userconfig: registry.userconfig,
			}),
		},
	);
	if (add.status !== 0) {
		return classifyInstallFailure(commandOutput(add));
	}
	const specifier = `${OMITTED_FILES_PACKAGE}/schema`;
	const evaluated = await evaluateSpecifier(hostDir, specifier);
	if (evaluated.outcome === "FAIL" && evaluated.reason === expectedPacked) {
		return {
			outcome: "FAIL",
			exitCode: EXIT_FAIL,
			reason: evaluated.reason,
			details: [
				"PROVED: a files allowlist that ships dist but omits a required export target is reported by name",
				keepTemp ? `temp ${scratch}` : "",
			].filter(Boolean),
			proved: true,
		};
	}
	if (evaluated.ok) {
		return fail(
			"prove-fail files: expected a named files failure, got PASS",
		);
	}
	return fail(
		`prove-fail files: expected ${expectedPacked}, got ${evaluated.reason}`,
	);
}

async function runFullCheck({
	repoRoot,
	topLevel,
	requireSubpaths,
	skipSmoke,
	scratch,
	registry,
	keepTemp,
}) {
	console.log(`top-level: ${topLevel.join(", ")}`);
	const published = await publishWorkspaceClosure({
		repoRoot,
		starts: topLevel,
		scratch,
		registryUrl: registry.registryUrl,
		userconfig: registry.userconfig,
	});
	if (published.outcome) {
		return published;
	}
	const host = await createHostProject({
		scratch,
		repoRoot,
		registryUrl: registry.registryUrl,
		userconfig: registry.userconfig,
	});
	const installed = await installTopLevel({
		hostDir: host.hostDir,
		topLevel,
		registryUrl: registry.registryUrl,
		userconfig: registry.userconfig,
	});
	if (installed.outcome) {
		return installed;
	}
	console.log(`installed in ${host.hostDir}`);
	const specifiers = [...topLevel, ...requireSubpaths];
	for (const specifier of specifiers) {
		const evaluated = await evaluateSpecifier(host.hostDir, specifier);
		if (evaluated.outcome) {
			return evaluated;
		}
		console.log(`resolved ${specifier}`);
	}
	const built = await buildHost(host.hostDir);
	if (built.outcome) {
		return built;
	}
	console.log("build: ok");
	if (skipSmoke) {
		return pass(
			"host install of the published closure resolved and built (smoke skipped)",
			[keepTemp ? `temp ${scratch}` : ""].filter(Boolean),
		);
	}
	const smoked = await runMountAndEditSmoke({
		hostDir: host.hostDir,
		repoRoot,
	});
	if (smoked.outcome) {
		return smoked;
	}
	console.log("smoke: ok");
	return pass(
		"host install of the published closure mounts and accepts a keystroke",
		[
			`closure ${published.packages.length} packages`,
			`host ${host.hostDir}`,
		],
	);
}

async function withRegistry(repoRoot, keepTemp, run) {
	const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pen-verdaccio-"));
	assertOutsideRepo(scratch, repoRoot);
	let registry;
	try {
		const started = await startVerdaccio({ scratch, repoRoot });
		if (started.outcome) {
			return started;
		}
		registry = started;
		console.log(`local registry ${registry.registryUrl}`);
		return await run({ scratch, registry });
	} finally {
		registry?.stop();
		if (!keepTemp) {
			await fs.rm(scratch, { recursive: true, force: true });
		} else {
			console.log(`kept temp ${scratch}`);
		}
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	runSelfTests();
	if (args.selfTestOnly) {
		return;
	}

	const result = await withRegistry(
		args.repoRoot,
		args.keepTemp,
		async (ctx) => {
			if (args.proveFail === "exports") {
				return proveFailExports({
					repoRoot: args.repoRoot,
					keepTemp: args.keepTemp,
					...ctx,
				});
			}
			if (args.proveFail === "files") {
				return proveFailFiles({
					repoRoot: args.repoRoot,
					keepTemp: args.keepTemp,
					...ctx,
				});
			}
			return runFullCheck({
				repoRoot: args.repoRoot,
				topLevel: args.topLevel,
				requireSubpaths: args.requireSubpaths,
				skipSmoke: args.skipSmoke,
				keepTemp: args.keepTemp,
				...ctx,
			});
		},
	);

	console.log("");
	console.log(
		formatOutcome({
			outcome: result.outcome,
			reason: result.reason,
			details: result.details ?? [],
		}),
	);
	process.exitCode = result.exitCode;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		if (message.startsWith("INCONCLUSIVE:")) {
			console.error(message);
			process.exitCode = EXIT_INCONCLUSIVE;
			return;
		}
		if (message.startsWith("FAIL ") || message.startsWith("Unknown flag")) {
			console.error(message);
			process.exitCode = EXIT_FAIL;
			return;
		}
		console.error(message);
		process.exitCode = EXIT_FAIL;
	});
}

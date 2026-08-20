/**
 * HOST2 (`spec-v2/15-host-integration.md`): import every published exports path
 * in a plain Node process with no DOM globals, ESM via import() and CJS via
 * require(), then construct a headless editor, apply an op, read the text back,
 * and destroy.
 *
 * Each pass runs in its own process and exits immediately after the last import
 * so a published package that schedules work on load (today: `@input/pen-bench`)
 * cannot keep the suite alive.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { discoverPublishedExportPaths } from "./discover.js";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
const self = fileURLToPath(import.meta.url);

function assertNoDomGlobals() {
	if (typeof window !== "undefined" || typeof document !== "undefined") {
		throw new Error(
			"HOST2: suite must run in a plain Node process with no DOM globals",
		);
	}
}

function specifierFor(entry) {
	return `${entry.packageName}${entry.exportPath === "." ? "" : entry.exportPath.slice(1)}`;
}

function runHeadless(createHeadlessEditor, label) {
	const editor = createHeadlessEditor();
	editor.apply(
		[
			{
				type: "insert-block",
				blockId: "host2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "host2", offset: 0, text: "host2" },
		],
		{ origin: "user" },
	);
	const text = editor.getBlock("host2")?.textContent();
	if (text !== "host2") {
		throw new Error(
			`HOST2: ${label} expected text "host2", got ${JSON.stringify(text)}`,
		);
	}
	editor.destroy();
}

async function importAllEsm(entries) {
	for (const entry of entries) {
		try {
			await import(pathToFileURL(entry.esmAbs).href);
		} catch (error) {
			const message =
				error instanceof Error
					? (error.stack ?? error.message)
					: String(error);
			throw new Error(
				`HOST2: ESM import() failed for ${specifierFor(entry)}\n${message}`,
				{
					cause: error,
				},
			);
		}
	}
}

function requireAllCjs(entries) {
	for (const entry of entries) {
		try {
			require(entry.cjsAbs);
		} catch (error) {
			const message =
				error instanceof Error
					? (error.stack ?? error.message)
					: String(error);
			throw new Error(
				`HOST2: CJS require() failed for ${specifierFor(entry)}\n${message}`,
				{
					cause: error,
				},
			);
		}
	}
}

async function runHeadlessPass(entries) {
	const core = entries.find(
		(entry) =>
			entry.packageName === "@input/pen-core" && entry.exportPath === ".",
	);
	if (!core) {
		throw new Error(
			"HOST2: @input/pen-core . export missing from discovery",
		);
	}

	const esmCore = await import(pathToFileURL(core.esmAbs).href);
	if (typeof esmCore.createHeadlessEditor !== "function") {
		throw new Error(
			"HOST2: createHeadlessEditor is not exported from @input/pen-core ESM",
		);
	}
	runHeadless(esmCore.createHeadlessEditor, "ESM");

	const cjsCore = require(core.cjsAbs);
	if (typeof cjsCore.createHeadlessEditor !== "function") {
		throw new Error(
			"HOST2: createHeadlessEditor is not exported from @input/pen-core CJS",
		);
	}
	runHeadless(cjsCore.createHeadlessEditor, "CJS");
}

function spawnPass(mode) {
	const result = spawnSync(process.execPath, [self, mode], {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.stdout) {
		process.stdout.write(result.stdout);
	}
	if (result.status !== 0) {
		const detail = (result.stderr || result.stdout || "").trim();
		throw new Error(
			`HOST2: ${mode} pass failed${detail ? `\n${detail}` : ""}`,
		);
	}
}

async function childMain(mode, entries) {
	assertNoDomGlobals();
	if (mode === "esm") {
		await importAllEsm(entries);
		console.log(`HOST2: ESM import() ${entries.length}/${entries.length}`);
		return;
	}
	if (mode === "cjs") {
		requireAllCjs(entries);
		console.log(`HOST2: CJS require() ${entries.length}/${entries.length}`);
		return;
	}
	if (mode === "headless") {
		await runHeadlessPass(entries);
		console.log(
			"HOST2: createHeadlessEditor construct/apply/read/destroy (ESM + CJS)",
		);
		return;
	}
	throw new Error(`HOST2: unknown pass ${mode}`);
}

async function parentMain(entries) {
	assertNoDomGlobals();
	const packages = new Set(entries.map((entry) => entry.packageName));
	console.log(
		`HOST2: discovered ${entries.length} export paths across ${packages.size} published packages`,
	);

	spawnPass("headless");
	spawnPass("esm");
	spawnPass("cjs");

	console.log(`HOST2: suite green (${entries.length} paths × 2 formats)`);
}

const mode = process.argv[2];
const entries = discoverPublishedExportPaths(repoRoot);

const run = mode ? childMain(mode, entries) : parentMain(entries);
run.then(() => {
	if (mode) {
		process.exit(0);
	}
}).catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});

/**
 * HOST2 (`spec/rules/host.md`): import every published exports path
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

function runHeadless(createHeadlessEditor, schema, label) {
	const editor = createHeadlessEditor({ schema });
	editor.apply(
		[
			{
				type: "insert-block",
				blockId: "host2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "splice-text", blockId: "host2", from: 0,
				to: 0,
				insert: "host2" },
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

function rootEntry(entries, packageName) {
	const entry = entries.find(
		(candidate) =>
			candidate.packageName === packageName && candidate.exportPath === ".",
	);
	if (!entry) {
		throw new Error(`HOST2: ${packageName} . export missing from discovery`);
	}
	return entry;
}

// Core registers no block types on its own — it cannot depend on
// @input/pen-schema-default (API1). A host assembles the two, so the smoke
// assembles them too, from the built artifacts rather than from source.
async function runHeadlessPass(entries) {
	const core = rootEntry(entries, "@input/pen-core");
	const schemaPackage = rootEntry(entries, "@input/pen-schema-default");

	const esmCore = await import(pathToFileURL(core.esmAbs).href);
	if (typeof esmCore.createHeadlessEditor !== "function") {
		throw new Error(
			"HOST2: createHeadlessEditor is not exported from @input/pen-core ESM",
		);
	}
	const esmSchema = await import(pathToFileURL(schemaPackage.esmAbs).href);
	if (!esmSchema.defaultSchema) {
		throw new Error(
			"HOST2: defaultSchema is not exported from @input/pen-schema-default ESM",
		);
	}
	runHeadless(esmCore.createHeadlessEditor, esmSchema.defaultSchema, "ESM");

	const cjsCore = require(core.cjsAbs);
	if (typeof cjsCore.createHeadlessEditor !== "function") {
		throw new Error(
			"HOST2: createHeadlessEditor is not exported from @input/pen-core CJS",
		);
	}
	const cjsSchema = require(schemaPackage.cjsAbs);
	if (!cjsSchema.defaultSchema) {
		throw new Error(
			"HOST2: defaultSchema is not exported from @input/pen-schema-default CJS",
		);
	}
	runHeadless(cjsCore.createHeadlessEditor, cjsSchema.defaultSchema, "CJS");
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

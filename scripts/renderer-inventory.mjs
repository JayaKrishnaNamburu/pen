#!/usr/bin/env node
/**
 * renderer-inventory (Wave P.6 / API6)
 *
 * Lists modules under packages/rendering/{react,vue}/src that import
 * neither their framework nor a framework type. Those belong in
 * @input/pen-dom (or core), not the renderer bindings.
 *
 * Pure re-export stubs are the P.6 end state and are not leftovers.
 * Allowlisted modules live in scripts/renderer-framework-free-allowlist.json
 * (each entry needs a reason). Report-only by default. `--strict` exits 1
 * when any non-allowlisted leftover remains.
 */

import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	"..",
);
const ALLOWLIST_PATH = path.join(
	repoRoot,
	"scripts/renderer-framework-free-allowlist.json",
);

const RENDERERS = [
	{
		id: "react",
		root: path.join(repoRoot, "packages/rendering/react/src"),
		specifiers: [/^react$/, /^react\//, /^react-dom$/, /^react-dom\//],
	},
	{
		id: "vue",
		root: path.join(repoRoot, "packages/rendering/vue/src"),
		specifiers: [/^vue$/, /^vue\//, /^@vue\//],
	},
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const IMPORT_SPECIFIER =
	/(?:import|export)(?:\s+type)?(?:[\s\w{},*]*?\sfrom\s*|\s*)["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

const strict = process.argv.includes("--strict");
const allowlist = await loadAllowlist();

const findings = [];
const allowlisted = [];
const scanned = [];

for (const renderer of RENDERERS) {
	const files = await collectSourceFiles(renderer.root);
	scanned.push({ id: renderer.id, count: files.length });
	for (const filePath of files) {
		const source = await fs.readFile(filePath, "utf8");
		if (usesFramework(source, renderer.specifiers)) {
			continue;
		}
		if (isPureReexport(source)) {
			continue;
		}
		const file = path
			.relative(renderer.root, filePath)
			.split(path.sep)
			.join("/");
		const repoPath = `packages/rendering/${renderer.id}/src/${file}`;
		const allowed = allowlist.get(repoPath);
		if (allowed) {
			allowlisted.push({
				renderer: renderer.id,
				file,
				reason: allowed.reason,
			});
			continue;
		}
		findings.push({
			renderer: renderer.id,
			file,
		});
	}
}

const emptyRenderer = scanned.find((row) => row.count === 0);
console.log(
	`population: ${scanned.map((row) => `${row.id} ${row.count}`).join(", ")} files (packages/rendering/{react,vue}/src)`,
);
if (emptyRenderer) {
	console.error(
		`renderer-inventory: cannot check: packages/rendering/${emptyRenderer.id}/src walk matched 0 files`,
	);
	process.exitCode = 1;
} else {
	printReport(findings, allowlisted);
	if (strict && findings.length > 0) {
		process.exitCode = 1;
	}
}

async function loadAllowlist() {
	const entries = new Map();
	let parsed;
	try {
		parsed = JSON.parse(await fs.readFile(ALLOWLIST_PATH, "utf8"));
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return entries;
		}
		throw error;
	}
	for (const entry of parsed.modules ?? []) {
		if (
			typeof entry?.file === "string" &&
			typeof entry.reason === "string" &&
			entry.reason.trim().length > 0
		) {
			entries.set(entry.file, entry);
		}
	}
	return entries;
}

function isPureReexport(source) {
	const code = stripComments(source)
		.replace(/^["']use client["'];?\s*/gm, "")
		.replace(/^\s*$/gm, "")
		.trim();
	if (!code) {
		return false;
	}
	const leftover = code
		.replace(/export\s+type\s+\*\s+from\s+["'][^"']+["'];?/g, "")
		.replace(/export\s+\*\s+from\s+["'][^"']+["'];?/g, "")
		.replace(/export\s+type\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];?/g, "")
		.replace(/export\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];?/g, "")
		.trim();
	return leftover.length === 0;
}

function usesFramework(source, specifierPatterns) {
	const code = stripComments(source);
	for (const specifier of collectSpecifiers(code)) {
		if (specifierPatterns.some((pattern) => pattern.test(specifier))) {
			return true;
		}
	}
	return false;
}

function collectSpecifiers(source) {
	const specifiers = [];
	for (const regex of [IMPORT_SPECIFIER, DYNAMIC_IMPORT]) {
		regex.lastIndex = 0;
		for (const match of source.matchAll(regex)) {
			specifiers.push(match[1]);
		}
	}
	return specifiers;
}

function stripComments(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function collectSourceFiles(root) {
	const files = [];
	await walk(root, files);
	return files.sort();
}

async function walk(directory, files) {
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
			if (entry.name === "__tests__" || entry.name === "node_modules") {
				continue;
			}
			await walk(entryPath, files);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const extension = path.extname(entry.name);
		if (
			!SOURCE_EXTENSIONS.has(extension) ||
			TEST_FILE.test(entry.name) ||
			DECLARATION_FILE.test(entry.name)
		) {
			continue;
		}
		files.push(entryPath);
	}
}

function printReport(rows, allowedRows) {
	const grouped = new Map();
	for (const row of rows) {
		const list = grouped.get(row.renderer) ?? [];
		list.push(row.file);
		grouped.set(row.renderer, list);
	}

	console.log("Renderer inventory (API6)");
	console.log(
		"Modules under packages/rendering/{react,vue}/src that import neither their framework nor a framework type.",
	);
	console.log("Re-export stubs are omitted. Allowlisted leftovers are listed last.");
	console.log("");

	let total = 0;
	for (const renderer of RENDERERS) {
		const files = grouped.get(renderer.id) ?? [];
		total += files.length;
		console.log(`${renderer.id} (${files.length})`);
		if (files.length === 0) {
			console.log("  (none)");
		} else {
			for (const file of files) {
				console.log(`  ${file}`);
			}
		}
		console.log("");
	}

	console.log(
		`${total} leftover framework-free module${total === 1 ? "" : "s"} (tests and stubs excluded)`,
	);

	if (allowedRows.length > 0) {
		console.log("");
		console.log(`Allowlisted (${allowedRows.length})`);
		for (const row of allowedRows) {
			console.log(`  ${row.renderer}/${row.file} — ${row.reason}`);
		}
	}
}

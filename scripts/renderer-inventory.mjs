#!/usr/bin/env node
/**
 * renderer-inventory (Wave P.6 / API6)
 *
 * Lists modules under packages/rendering/{react,vue}/src that import
 * neither their framework nor a framework type. Those belong in
 * @input/pen-dom (or core), not the renderer bindings.
 *
 * Report-only by default. `--strict` exits 1 when any finding remains.
 * Tests, declaration files, and the eslint rule are out of scope here
 * (E.2 owns no-framework-free-modules-in-renderers).
 */

import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	"..",
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

const findings = [];

for (const renderer of RENDERERS) {
	const files = await collectSourceFiles(renderer.root);
	for (const filePath of files) {
		const source = await fs.readFile(filePath, "utf8");
		if (usesFramework(source, renderer.specifiers)) {
			continue;
		}
		findings.push({
			renderer: renderer.id,
			file: path
				.relative(renderer.root, filePath)
				.split(path.sep)
				.join("/"),
		});
	}
}

printReport(findings);

if (strict && findings.length > 0) {
	process.exitCode = 1;
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

function printReport(rows) {
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
		`${total} framework-free module${total === 1 ? "" : "s"} (tests excluded)`,
	);
}

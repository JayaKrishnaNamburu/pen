#!/usr/bin/env node
/**
 * Conformance structural-mirror drift gate.
 *
 * Scenario files evaluated inside the page cannot import production
 * types, so they keep a hand-written structural copy. A stale copy
 * compiles and the scenario keeps passing while testing the wrong
 * shape. This gate compares each registered mirror against its source
 * and fails on missing fields, extra fields, and field-type
 * disagreement.
 *
 * Fail-closed: an empty registry, a walker that finds no mirror
 * files, a missing file, or an unregistered file in src/mirrors/ is
 * a failure. The compared count is always printed.
 *
 * Does not catch: a new in-page mirror that was never registered;
 * variance that TypeScript considers mutually assignable (readonly
 * on an otherwise identical property).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const MIRROR_DIR = "packages/tooling/conformance/src/mirrors";
const SKIP_MIRROR_FILES = new Set(["pin.ts"]);

export const MIRRORS = [
	{
		name: "GeometryReader",
		source: {
			file: "packages/rendering/dom/src/geometry/types.ts",
			exportName: "GeometryReader",
		},
		mirror: {
			file: `${MIRROR_DIR}/geometryReader.ts`,
			exportName: "GeometryReader",
		},
	},
];

const COMPILER_OPTIONS = {
	...ts.getDefaultCompilerOptions(),
	strict: true,
	noEmit: true,
	skipLibCheck: true,
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
};

export function toPosix(relPath) {
	return relPath.split(path.sep).join("/");
}

export function listMirrorFiles(repoRoot) {
	const absDir = path.join(repoRoot, MIRROR_DIR);
	if (!fs.existsSync(absDir)) {
		return [];
	}
	return fs
		.readdirSync(absDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
		.filter((entry) => !SKIP_MIRROR_FILES.has(entry.name))
		.filter((entry) => !entry.name.endsWith(".test.ts"))
		.map((entry) => toPosix(path.join(MIRROR_DIR, entry.name)))
		.sort();
}

export function registryCoverageError(mirrors, mirrorFiles) {
	if (!Array.isArray(mirrors) || mirrors.length === 0) {
		return "conformance-mirror-drift failed: registry is empty (0 mirrors compared)";
	}
	if (mirrorFiles.length === 0) {
		return `conformance-mirror-drift failed: 0 mirror files under ${MIRROR_DIR}`;
	}
	const registered = new Set(mirrors.map((entry) => entry.mirror.file));
	const extras = mirrorFiles.filter((file) => !registered.has(file));
	if (extras.length > 0) {
		return `conformance-mirror-drift failed: unregistered mirror file(s): ${extras.join(", ")}`;
	}
	const missing = mirrors
		.map((entry) => entry.mirror.file)
		.filter((file) => !mirrorFiles.includes(file));
	if (missing.length > 0) {
		return `conformance-mirror-drift failed: registered mirror file(s) not found: ${missing.join(", ")}`;
	}
	return null;
}

function getExportedType(checker, sourceFile, exportName) {
	if (!sourceFile) {
		return null;
	}
	for (const statement of sourceFile.statements) {
		if (
			(ts.isInterfaceDeclaration(statement) ||
				ts.isTypeAliasDeclaration(statement)) &&
			statement.name.text === exportName
		) {
			const exported = statement.modifiers?.some(
				(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
			);
			if (exported) {
				return checker.getTypeAtLocation(statement.name);
			}
		}
	}
	return null;
}

function typeOfSymbol(checker, symbol) {
	if (typeof checker.getTypeOfSymbol === "function") {
		return checker.getTypeOfSymbol(symbol);
	}
	const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
	if (!declaration) {
		return undefined;
	}
	return checker.getTypeOfSymbolAtLocation(symbol, declaration);
}

export function diffTypes(checker, sourceType, mirrorType) {
	const sourceProps = checker.getPropertiesOfType(sourceType);
	const mirrorProps = checker.getPropertiesOfType(mirrorType);
	const sourceByName = new Map(sourceProps.map((symbol) => [symbol.getName(), symbol]));
	const mirrorByName = new Map(mirrorProps.map((symbol) => [symbol.getName(), symbol]));

	const missing = [];
	const extra = [];
	const typeDisagree = [];

	for (const name of sourceByName.keys()) {
		if (!mirrorByName.has(name)) {
			missing.push(name);
		}
	}
	for (const name of mirrorByName.keys()) {
		if (!sourceByName.has(name)) {
			extra.push(name);
		}
	}

	for (const name of sourceByName.keys()) {
		const mirrorSymbol = mirrorByName.get(name);
		if (!mirrorSymbol) {
			continue;
		}
		const sourcePropType = typeOfSymbol(checker, sourceByName.get(name));
		const mirrorPropType = typeOfSymbol(checker, mirrorSymbol);
		if (sourcePropType == null || mirrorPropType == null) {
			typeDisagree.push({
				field: name,
				source: sourcePropType == null ? "<unknown>" : checker.typeToString(sourcePropType),
				mirror: mirrorPropType == null ? "<unknown>" : checker.typeToString(mirrorPropType),
			});
			continue;
		}
		const sourceToMirror = checker.isTypeAssignableTo(sourcePropType, mirrorPropType);
		const mirrorToSource = checker.isTypeAssignableTo(mirrorPropType, sourcePropType);
		if (!sourceToMirror || !mirrorToSource) {
			typeDisagree.push({
				field: name,
				source: checker.typeToString(sourcePropType),
				mirror: checker.typeToString(mirrorPropType),
			});
		}
	}

	missing.sort();
	extra.sort();
	typeDisagree.sort((left, right) => left.field.localeCompare(right.field));

	return { missing, extra, typeDisagree };
}

function createMemoryHost(files) {
	const sysHost = ts.createCompilerHost(COMPILER_OPTIONS, true);
	return {
		...sysHost,
		fileExists(fileName) {
			return Object.hasOwn(files, fileName) || sysHost.fileExists(fileName);
		},
		readFile(fileName) {
			if (Object.hasOwn(files, fileName)) {
				return files[fileName];
			}
			return sysHost.readFile(fileName);
		},
		getSourceFile(fileName, languageVersion, onError) {
			if (Object.hasOwn(files, fileName)) {
				return ts.createSourceFile(fileName, files[fileName], languageVersion, true);
			}
			return sysHost.getSourceFile(fileName, languageVersion, onError);
		},
	};
}

export function compareInterfaceTexts({
	sourceText,
	mirrorText,
	sourceExport = "Source",
	mirrorExport = "Mirror",
}) {
	const files = {
		"/memory/source.ts": sourceText,
		"/memory/mirror.ts": mirrorText,
	};
	const host = createMemoryHost(files);
	const program = ts.createProgram(
		["/memory/source.ts", "/memory/mirror.ts"],
		COMPILER_OPTIONS,
		host,
	);
	const checker = program.getTypeChecker();
	const sourceType = getExportedType(
		checker,
		program.getSourceFile("/memory/source.ts"),
		sourceExport,
	);
	const mirrorType = getExportedType(
		checker,
		program.getSourceFile("/memory/mirror.ts"),
		mirrorExport,
	);
	if (!sourceType || !mirrorType) {
		return {
			ok: false,
			error: `compareInterfaceTexts: missing export (source=${Boolean(sourceType)} mirror=${Boolean(mirrorType)})`,
			missing: [],
			extra: [],
			typeDisagree: [],
		};
	}
	const diff = diffTypes(checker, sourceType, mirrorType);
	return {
		ok:
			diff.missing.length === 0 &&
			diff.extra.length === 0 &&
			diff.typeDisagree.length === 0,
		...diff,
	};
}

export function compareRegisteredMirror(repoRoot, entry) {
	const sourceAbs = path.join(repoRoot, entry.source.file);
	const mirrorAbs = path.join(repoRoot, entry.mirror.file);
	if (!fs.existsSync(sourceAbs)) {
		return {
			name: entry.name,
			ok: false,
			error: `source file missing: ${entry.source.file}`,
			missing: [],
			extra: [],
			typeDisagree: [],
		};
	}
	if (!fs.existsSync(mirrorAbs)) {
		return {
			name: entry.name,
			ok: false,
			error: `mirror file missing: ${entry.mirror.file}`,
			missing: [],
			extra: [],
			typeDisagree: [],
		};
	}

	const program = ts.createProgram([sourceAbs, mirrorAbs], COMPILER_OPTIONS);
	const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
		const fileName = diagnostic.file?.fileName ?? "";
		return fileName === sourceAbs || fileName === mirrorAbs;
	});
	if (diagnostics.length > 0) {
		const messages = diagnostics.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
		);
		return {
			name: entry.name,
			ok: false,
			error: `TypeScript diagnostics: ${messages.join("; ")}`,
			missing: [],
			extra: [],
			typeDisagree: [],
		};
	}

	const checker = program.getTypeChecker();
	const sourceType = getExportedType(
		checker,
		program.getSourceFile(sourceAbs),
		entry.source.exportName,
	);
	const mirrorType = getExportedType(
		checker,
		program.getSourceFile(mirrorAbs),
		entry.mirror.exportName,
	);
	if (!sourceType) {
		return {
			name: entry.name,
			ok: false,
			error: `source export '${entry.source.exportName}' not found in ${entry.source.file}`,
			missing: [],
			extra: [],
			typeDisagree: [],
		};
	}
	if (!mirrorType) {
		return {
			name: entry.name,
			ok: false,
			error: `mirror export '${entry.mirror.exportName}' not found in ${entry.mirror.file}`,
			missing: [],
			extra: [],
			typeDisagree: [],
		};
	}

	const diff = diffTypes(checker, sourceType, mirrorType);
	return {
		name: entry.name,
		ok:
			diff.missing.length === 0 &&
			diff.extra.length === 0 &&
			diff.typeDisagree.length === 0,
		...diff,
	};
}

export function formatDiff(result) {
	const lines = [];
	if (result.error) {
		lines.push(`${result.name}: ${result.error}`);
		return lines;
	}
	for (const field of result.missing) {
		lines.push(`${result.name}: missing field ${field}`);
	}
	for (const field of result.extra) {
		lines.push(`${result.name}: extra field ${field}`);
	}
	for (const entry of result.typeDisagree) {
		lines.push(
			`${result.name}: field ${entry.field} type disagrees (source: ${entry.source}, mirror: ${entry.mirror})`,
		);
	}
	if (lines.length === 0) {
		lines.push(`${result.name}: ok`);
	}
	return lines;
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTest() {
	const emptyRegistry = registryCoverageError([], [`${MIRROR_DIR}/geometryReader.ts`]);
	assert(
		emptyRegistry != null && emptyRegistry.includes("0 mirrors compared"),
		"self-test: empty registry must fail closed",
	);

	const emptyWalk = registryCoverageError(MIRRORS, []);
	assert(
		emptyWalk != null && emptyWalk.includes("0 mirror files"),
		"self-test: empty mirror directory must fail closed",
	);

	const match = compareInterfaceTexts({
		sourceText: "export interface Source { a: number; b: string | null }\n",
		mirrorText: "export interface Mirror { a: number; b: string | null }\n",
	});
	assert(match.ok, "self-test: identical interfaces must match");

	const missing = compareInterfaceTexts({
		sourceText: "export interface Source { keep: number; drop: string }\n",
		mirrorText: "export interface Mirror { keep: number }\n",
	});
	assert(!missing.ok, "self-test: missing field must fail");
	assert(
		missing.missing.includes("drop"),
		`self-test: missing field must name drop, got ${JSON.stringify(missing)}`,
	);

	const extra = compareInterfaceTexts({
		sourceText: "export interface Source { keep: number }\n",
		mirrorText: "export interface Mirror { keep: number; spurious: boolean }\n",
	});
	assert(!extra.ok, "self-test: extra field must fail");
	assert(
		extra.extra.includes("spurious"),
		`self-test: extra field must name spurious, got ${JSON.stringify(extra)}`,
	);

	const typeDisagree = compareInterfaceTexts({
		sourceText: "export interface Source { value: string | null }\n",
		mirrorText: "export interface Mirror { value: string }\n",
	});
	assert(!typeDisagree.ok, "self-test: field type disagreement must fail");
	assert(
		typeDisagree.typeDisagree.some((entry) => entry.field === "value"),
		`self-test: type disagreement must name value, got ${JSON.stringify(typeDisagree)}`,
	);

	const missingLine = formatDiff({
		name: "GeometryReader",
		ok: false,
		missing: ["caretRect"],
		extra: [],
		typeDisagree: [],
	});
	assert(
		missingLine.includes("GeometryReader: missing field caretRect"),
		`self-test: format must name mirror and field, got ${JSON.stringify(missingLine)}`,
	);
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot };
}

export function run(repoRoot = DEFAULT_REPO_ROOT) {
	const coverageError = registryCoverageError(MIRRORS, listMirrorFiles(repoRoot));
	const results = MIRRORS.map((entry) => compareRegisteredMirror(repoRoot, entry));
	const lines = [`conformance-mirror-drift: compared ${MIRRORS.length} mirror(s)`];
	if (coverageError != null) {
		return { ok: false, lines: [...lines, coverageError] };
	}
	let ok = true;
	for (const result of results) {
		if (!result.ok) {
			ok = false;
		}
		lines.push(...formatDiff(result));
	}
	return { ok, lines };
}

function main() {
	runSelfTest();
	console.log(
		"conformance-mirror-drift self-test: empty registry, missing field, extra field, and type disagreement failed the checker.",
	);

	const { repoRoot } = parseArgs(process.argv.slice(2));
	const { ok, lines } = run(repoRoot);
	const report = lines.join("\n");
	if (!ok) {
		console.error(report);
		process.exitCode = 1;
		return;
	}
	console.log(report);
}

const isDirectRun =
	process.argv[1] != null &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}

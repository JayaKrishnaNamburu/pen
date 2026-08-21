import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageRoot, "../..");
const pagesRoot = join(packageRoot, "src", "pages");

const SAMPLE_RE = /<pre>\s*<code>\{`([\s\S]*?)`\}<\/code>\s*<\/pre>/g;

const SKIP_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	"__tests__",
	"__snapshots__",
]);

function walkFiles(directory, files = []) {
	const entries = readdirSync(directory, { withFileTypes: true });
	for (const entry of entries) {
		if (SKIP_DIR_NAMES.has(entry.name)) {
			continue;
		}
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			walkFiles(path, files);
			continue;
		}
		if (/\.tsx?$/.test(entry.name)) {
			files.push(path);
		}
	}
	return files;
}

function collectPackages(root) {
	const packages = [];
	function walk(directory, depth) {
		if (depth > 3) {
			return;
		}
		let entries;
		try {
			entries = readdirSync(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || SKIP_DIR_NAMES.has(entry.name)) {
				continue;
			}
			const next = join(directory, entry.name);
			const manifestPath = join(next, "package.json");
			if (existsSync(manifestPath)) {
				const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
				if (
					typeof manifest.name === "string" &&
					manifest.name.startsWith("@input/pen-")
				) {
					packages.push({ name: manifest.name, dir: next, manifest });
				}
			}
			walk(next, depth + 1);
		}
	}
	walk(root, 0);
	return packages;
}

function resolveEntry(pkg) {
	const distTypes = join(pkg.dir, "dist", "index.d.ts");
	if (existsSync(distTypes)) {
		return distTypes;
	}
	const srcTs = join(pkg.dir, "src", "index.ts");
	if (existsSync(srcTs)) {
		return srcTs;
	}
	const srcTsx = join(pkg.dir, "src", "index.tsx");
	if (existsSync(srcTsx)) {
		return srcTsx;
	}
	return distTypes;
}

function addHostTypes(paths, fromPackageJson, spec, packageName, fileName) {
	try {
		const req = createRequire(fromPackageJson);
		const packageJsonPath = req.resolve(`${packageName}/package.json`);
		const dir = dirname(packageJsonPath);
		if (fileName) {
			const filePath = join(dir, fileName);
			if (existsSync(filePath)) {
				paths[spec] = [filePath];
			}
			return;
		}
		const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		const types =
			manifest.types ??
			manifest.typings ??
			manifest.exports?.["."]?.import?.types ??
			manifest.exports?.["."]?.types ??
			"index.d.ts";
		const filePath = join(dir, types);
		if (existsSync(filePath)) {
			paths[spec] = [filePath];
		}
	} catch {
		// host package not installed in this workspace checkout
	}
}

function compilerPaths(packages) {
	const paths = {};
	for (const pkg of packages) {
		if (pkg.manifest.private === true) {
			continue;
		}
		paths[pkg.name] = [resolveEntry(pkg)];
		const exportsField = pkg.manifest.exports;
		if (exportsField && typeof exportsField === "object") {
			for (const key of Object.keys(exportsField)) {
				if (key === "." || !key.startsWith("./")) {
					continue;
				}
				const spec = `${pkg.name}${key.slice(1)}`;
				const nestedDist = join(pkg.dir, "dist", `${key.slice(2)}.d.ts`);
				const nestedSrc = join(pkg.dir, "src", `${key.slice(2)}.ts`);
				if (existsSync(nestedDist)) {
					paths[spec] = [nestedDist];
				} else if (existsSync(nestedSrc)) {
					paths[spec] = [nestedSrc];
				}
			}
		}
	}
	const fromDocs = join(packageRoot, "package.json");
	const fromReact = join(repoRoot, "packages/rendering/react/package.json");
	const fromVue = join(repoRoot, "packages/rendering/vue/package.json");
	addHostTypes(paths, fromDocs, "react", "@types/react");
	addHostTypes(paths, fromDocs, "react/jsx-runtime", "@types/react", "jsx-runtime.d.ts");
	addHostTypes(paths, fromReact, "react", "@types/react");
	addHostTypes(paths, fromReact, "react/jsx-runtime", "@types/react", "jsx-runtime.d.ts");
	addHostTypes(paths, fromVue, "vue", "vue");
	return paths;
}

function classifySample(code) {
	if (/<script\b/i.test(code)) {
		return "vue";
	}
	if (/<[A-Za-z]/.test(code) || code.includes("use client")) {
		return "tsx";
	}
	return "ts";
}

function vueScript(code) {
	const openEnd = findScriptOpenEnd(code);
	if (openEnd === -1) {
		return null;
	}
	const closeStart = findScriptCloseStart(code, openEnd);
	if (closeStart === -1) {
		return null;
	}
	return code.slice(openEnd, closeStart);
}

function findScriptOpenEnd(code) {
	const lower = code.toLowerCase();
	let from = 0;
	while (from < lower.length) {
		const at = lower.indexOf("<script", from);
		if (at === -1) {
			return -1;
		}
		const afterName = at + "<script".length;
		const next = code[afterName];
		if (next !== undefined && next !== ">" && !isHtmlNameBoundary(next)) {
			from = afterName;
			continue;
		}
		const gt = code.indexOf(">", afterName);
		return gt === -1 ? -1 : gt + 1;
	}
	return -1;
}

function findScriptCloseStart(code, from) {
	const lower = code.toLowerCase();
	const needle = "</script";
	let i = from;
	while (i < lower.length) {
		const at = lower.indexOf(needle, i);
		if (at === -1) {
			return -1;
		}
		const afterName = at + needle.length;
		const gt = code.indexOf(">", afterName);
		if (gt !== -1) {
			return at;
		}
		i = afterName;
	}
	return -1;
}

function isHtmlNameBoundary(ch) {
	return ch === "/" || ch === "\t" || ch === "\n" || ch === "\r" || ch === " " || ch === ">";
}

function prepareSample(code, lang) {
	if (lang === "vue") {
		const script = vueScript(code);
		if (script === null) {
			return { skip: "vue-template-only" };
		}
		return { source: script, ext: "ts" };
	}
	if (code.trim().length === 0) {
		return { skip: "empty" };
	}
	return { source: code, ext: lang === "tsx" ? "tsx" : "ts" };
}

function extractSamples() {
	const samples = [];
	for (const file of walkFiles(pagesRoot)) {
		const text = readFileSync(file, "utf8");
		const relativeFile = relative(packageRoot, file);
		let index = 0;
		const pattern = new RegExp(SAMPLE_RE.source, SAMPLE_RE.flags);
		for (const match of text.matchAll(pattern)) {
			index += 1;
			const code = match[1] ?? "";
			samples.push({
				file: relativeFile,
				index,
				lang: classifySample(code),
				code,
			});
		}
	}
	return samples;
}

const samples = extractSamples();
if (samples.length === 0) {
	console.error("DOC2 sample gate: no <pre><code> samples found under src/pages");
	process.exit(1);
}

const prepared = [];
const skipped = [];
for (const sample of samples) {
	const next = prepareSample(sample.code, sample.lang);
	if (next.skip) {
		skipped.push({ file: sample.file, index: sample.index, reason: next.skip });
		continue;
	}
	prepared.push({ sample, source: next.source, ext: next.ext });
}

const packages = collectPackages(join(repoRoot, "packages"));
const tmp = mkdtempSync(join(tmpdir(), "pen-doc2-samples-"));
const files = [];

try {
	for (const item of prepared) {
		const name = `${item.sample.file.replaceAll("/", "__").replaceAll(".", "_")}__${item.sample.index}.${item.ext}`;
		writeFileSync(join(tmp, name), item.source, "utf8");
		item.name = name;
		files.push(name);
	}

	const tsconfig = {
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
			noUnusedLocals: false,
			noUnusedParameters: false,
			paths: compilerPaths(packages),
		},
		include: files,
	};
	writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify(tsconfig, null, 2), "utf8");

	const tsc = join(repoRoot, "node_modules", ".bin", "tsc");
	if (!existsSync(tsc)) {
		console.error("DOC2 sample gate: missing TypeScript binary at node_modules/.bin/tsc");
		process.exit(1);
	}
	const result = spawnSync(tsc, ["--pretty", "false", "-p", tmp], {
		encoding: "utf8",
		cwd: tmp,
	});
	if (result.error) {
		console.error(`DOC2 sample gate: failed to run tsc: ${result.error.message}`);
		process.exit(1);
	}
	const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
	const errors = [];
	if (result.status !== 0) {
		for (const line of output.split("\n")) {
			const match = /^([^\s:(]+)\((\d+),(\d+)\): error TS\d+: (.+)$/.exec(line);
			if (!match) {
				continue;
			}
			const item = prepared.find((entry) => entry.name === basename(match[1]));
			errors.push({
				file: item?.sample.file ?? match[1],
				index: item?.sample.index ?? 0,
				line: Number(match[2]),
				message: match[4],
			});
		}
		if (errors.length === 0 && output.length > 0) {
			errors.push({
				file: "(tsc)",
				index: 0,
				line: 0,
				message: output.slice(0, 2000),
			});
		}
	}

	if (errors.length > 0) {
		console.error("DOC2 sample gate: type-check failed");
		for (const error of errors) {
			console.error(
				`  ${error.file} sample ${error.index}:${error.line}  ${error.message}`,
			);
		}
		process.exit(1);
	}

	console.log(
		`DOC2 sample gate: ${prepared.length} samples type-check` +
			(skipped.length > 0 ? `, ${skipped.length} skipped` : ""),
	);
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

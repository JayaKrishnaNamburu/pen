/**
 * HOST2 (`spec/rules/host.md`): the import-smoke suite is generated
 * from published manifests, not a handwritten list. A new package or export
 * subpath is covered the day it exists.
 */
import fs from "node:fs";
import path from "node:path";

function collectManifestPaths(repoRoot) {
	const packagesDir = path.join(repoRoot, "packages");
	const manifests = [];
	for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const first = path.join(packagesDir, entry.name);
		const direct = path.join(first, "package.json");
		if (fs.existsSync(direct)) {
			manifests.push(direct);
		}
		for (const nested of fs.readdirSync(first, { withFileTypes: true })) {
			if (!nested.isDirectory()) {
				continue;
			}
			const nestedManifest = path.join(
				first,
				nested.name,
				"package.json",
			);
			if (fs.existsSync(nestedManifest)) {
				manifests.push(nestedManifest);
			}
		}
	}
	return manifests.sort();
}

function resolveRuntimeTarget(target, kind) {
	if (target == null) {
		return null;
	}
	if (typeof target === "string") {
		return target;
	}
	if (Array.isArray(target)) {
		for (const item of target) {
			const resolved = resolveRuntimeTarget(item, kind);
			if (resolved) {
				return resolved;
			}
		}
		return null;
	}
	if (typeof target !== "object") {
		return null;
	}

	const order =
		kind === "import"
			? ["import", "node", "default"]
			: ["require", "node", "default"];
	for (const key of order) {
		if (key in target) {
			const resolved = resolveRuntimeTarget(target[key], kind);
			if (resolved) {
				return resolved;
			}
		}
	}
	return null;
}

function starCapture(pattern, value) {
	const star = pattern.indexOf("*");
	if (star === -1) {
		return value === pattern ? "" : null;
	}
	const pre = pattern.slice(0, star);
	const post = pattern.slice(star + 1);
	if (!value.startsWith(pre) || !value.endsWith(post)) {
		return null;
	}
	return value.slice(pre.length, value.length - post.length);
}

function expandWildcard(packageDir, exportKey, esmRel, cjsRel) {
	const esmPattern = esmRel.replace(/^\.\//, "");
	const matches = fs
		.globSync(esmPattern, { cwd: packageDir })
		.map((file) => `./${file.replaceAll("\\", "/")}`)
		.sort();
	if (matches.length === 0) {
		throw new Error(
			`HOST2: export "${exportKey}" matched no files for ${esmRel} under ${packageDir} (build first?)`,
		);
	}

	const entries = [];
	for (const esmFile of matches) {
		const captured = starCapture(esmRel, esmFile);
		if (captured == null) {
			throw new Error(
				`HOST2: ${esmFile} did not match pattern ${esmRel}`,
			);
		}
		const subpath = exportKey.replaceAll("*", captured);
		const cjsFile = cjsRel.replaceAll("*", captured);
		entries.push({ exportPath: subpath, esmFile, cjsFile });
	}
	return entries;
}

function concreteEntry(packageDir, exportKey, esmRel, cjsRel) {
	const esmAbs = path.join(packageDir, esmRel);
	const cjsAbs = path.join(packageDir, cjsRel);
	if (!fs.existsSync(esmAbs)) {
		throw new Error(
			`HOST2: missing ESM artifact ${esmAbs} for export "${exportKey}"`,
		);
	}
	if (!fs.existsSync(cjsAbs)) {
		throw new Error(
			`HOST2: missing CJS artifact ${cjsAbs} for export "${exportKey}"`,
		);
	}
	return [{ exportPath: exportKey, esmFile: esmRel, cjsFile: cjsRel }];
}

export function discoverPublishedExportPaths(repoRoot) {
	const entries = [];
	for (const manifestPath of collectManifestPaths(repoRoot)) {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
		if (manifest.private) {
			continue;
		}
		if (!manifest.name || !manifest.exports) {
			throw new Error(
				`HOST2: published package at ${manifestPath} is missing name or exports`,
			);
		}

		const packageDir = path.dirname(manifestPath);
		const exportMap =
			typeof manifest.exports === "string"
				? { ".": manifest.exports }
				: manifest.exports;

		for (const [exportKey, target] of Object.entries(exportMap)) {
			// SF4 requires published packages to expose "./package.json" so tooling
			// can resolve the manifest. It is a resolution target, not a module
			// entry: ESM cannot import() JSON without a type attribute. Nothing is
			// left unverified by skipping it — the file being resolvable is already
			// proven by this loop reading it.
			if (exportKey === "./package.json") {
				continue;
			}

			const esmRel = resolveRuntimeTarget(target, "import");
			const cjsRel = resolveRuntimeTarget(target, "require");
			if (!esmRel || !cjsRel) {
				throw new Error(
					`HOST2: ${manifest.name} export "${exportKey}" is missing an import or require runtime target`,
				);
			}

			const expanded = exportKey.includes("*")
				? expandWildcard(packageDir, exportKey, esmRel, cjsRel)
				: concreteEntry(packageDir, exportKey, esmRel, cjsRel);

			for (const item of expanded) {
				entries.push({
					packageName: manifest.name,
					packageDir,
					exportPath: item.exportPath,
					esmFile: item.esmFile,
					cjsFile: item.cjsFile,
					esmAbs: path.join(packageDir, item.esmFile),
					cjsAbs: path.join(packageDir, item.cjsFile),
				});
			}
		}
	}

	if (entries.length === 0) {
		throw new Error("HOST2: discovery found no published export paths");
	}

	const names = new Set(entries.map((entry) => entry.packageName));
	if (!names.has("@input/pen-core")) {
		throw new Error(
			"HOST2: discovery missed @input/pen-core — generator is broken",
		);
	}
	if (
		names.has("@input/pen-eslint-plugin") ||
		names.has("@input/pen-conformance")
	) {
		throw new Error("HOST2: discovery included a private package");
	}

	return entries;
}
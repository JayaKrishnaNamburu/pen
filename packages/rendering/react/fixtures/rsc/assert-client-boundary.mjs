import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

function collectArtifactPaths(value, out = new Set()) {
	if (typeof value === "string") {
		if (value.endsWith(".mjs") || value.endsWith(".cjs")) {
			out.add(value);
		}
		return out;
	}
	if (value && typeof value === "object") {
		for (const nested of Object.values(value)) {
			collectArtifactPaths(nested, out);
		}
	}
	return out;
}

const artifacts = [...collectArtifactPaths(pkg.exports)].sort();
if (artifacts.length === 0) {
	throw new Error("HOST1: no .mjs/.cjs paths in @input/pen-react exports");
}

const missing = [];
for (const relativePath of artifacts) {
	const absolutePath = join(packageRoot, relativePath);
	let source;
	try {
		source = readFileSync(absolutePath, "utf8");
	} catch {
		missing.push(`${relativePath} (missing — run pnpm --filter @input/pen-react build)`);
		continue;
	}
	const head = source.slice(0, 200);
	if (!head.includes("use client")) {
		missing.push(relativePath);
	}
}

if (missing.length > 0) {
	throw new Error(`HOST1: "use client" missing from:\n${missing.map((path) => `  ${path}`).join("\n")}`);
}

console.log(`HOST1: ${artifacts.length} published entries carry "use client"`);
for (const relativePath of artifacts) {
	console.log(`  ${relativePath}`);
}

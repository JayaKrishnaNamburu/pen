#!/usr/bin/env node
/**
 * SEC7: published packages must not declare install-time lifecycle
 * scripts (preinstall, install, postinstall, prepare). Those run on
 * consumer install. Publish-only hooks (prepublish, prepack) are
 * outside this check.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const banned = ["preinstall", "install", "postinstall", "prepare"];
const hits = [];
const packagesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "packages");

function walk(dir) {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === "dist") continue;
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			walk(full);
			continue;
		}
		if (name === "package.json") visit(full);
	}
}

function visit(file) {
	const pkg = JSON.parse(readFileSync(file, "utf8"));
	if (pkg.private === true) return;
	const scripts = pkg.scripts ?? {};
	for (const key of banned) {
		if (Object.hasOwn(scripts, key)) {
			hits.push(`${file}: scripts.${key}`);
		}
	}
}

walk(packagesRoot);

if (hits.length > 0) {
	console.error(
		"SEC7: published manifests must not declare install-time scripts:",
	);
	for (const hit of hits) console.error(`  ${hit}`);
	process.exit(1);
}

console.log(
	"SEC7: no published manifest declares preinstall/install/postinstall/prepare",
);

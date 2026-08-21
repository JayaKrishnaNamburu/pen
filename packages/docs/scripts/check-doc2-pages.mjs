import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(packageRoot, "src");
const appSource = readFileSync(join(srcRoot, "App.tsx"), "utf8");

const requiredPages = [
	{ id: "getting-started", file: "GettingStarted.tsx" },
	{ id: "core-concepts", file: "CoreConcepts.tsx" },
	{ id: "selection", file: "Selection.tsx" },
	{ id: "extensions", file: "Extensions.tsx" },
	{ id: "commands", file: "Commands.tsx" },
	{ id: "collaboration", file: "Collaboration.tsx" },
	{ id: "ai", file: "AI.tsx" },
	{ id: "import-export", file: "ImportExport.tsx" },
	{ id: "security", file: "Security.tsx" },
	{ id: "accessibility", file: "Accessibility.tsx" },
	{ id: "support", file: "Support.tsx" },
	{ id: "localization", file: "Localization.tsx" },
	{ id: "upgrade", file: "Upgrade.tsx" },
];

const failures = [];

for (const page of requiredPages) {
	const pagePath = join(srcRoot, "pages", page.file);
	if (!existsSync(pagePath)) {
		failures.push(`missing page module src/pages/${page.file}`);
	}
	if (!appSource.includes(`"${page.id}"`)) {
		failures.push(`App.tsx does not register page id "${page.id}"`);
	}
	if (!appSource.includes(`href: "#/${page.id}"`)) {
		failures.push(`App.tsx has no nav href "#/${page.id}"`);
	}
}

function walk(directory) {
	const entries = readdirSync(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(path));
		} else {
			files.push(path);
		}
	}
	return files;
}

for (const file of walk(srcRoot)) {
	const text = readFileSync(file, "utf8");
	if (text.includes("Coming soon")) {
		failures.push(`${file.slice(srcRoot.length + 1)} contains "Coming soon"`);
	}
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`DOC2 page gate: ${failure}`);
	}
	process.exit(1);
}

console.log(`DOC2 page gate: ${requiredPages.length} required pages present`);

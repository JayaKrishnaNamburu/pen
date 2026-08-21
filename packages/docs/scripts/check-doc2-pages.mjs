import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(packageRoot, "src");
const pagesRoot = join(srcRoot, "pages");
const appSource = existsSync(join(srcRoot, "App.tsx"))
	? readFileSync(join(srcRoot, "App.tsx"), "utf8")
	: "";

/**
 * DOC2 content contract (spec-v2/17-documentation.md, wave-d D.3).
 *
 * Presence plus a banned phrase is too weak: a heading and one sentence
 * passes. A raw line-count minimum is worse — arbitrary, padded, and
 * waived the first time a tight page is complete. A blanket "every page
 * has a type-checked sample" would force decorative samples onto Support
 * (a runtime table) and Upgrade (a break list). "Must link the generated
 * reference" cannot be the rule while DOC3 has no browsable reference.
 *
 * This gate checks a property worth having: each required page still
 * teaches the thing its owning spec says it must. Ownership is a cited
 * spec path or the executed-quickstart / package-README token that D.3
 * names as owner. Required <h1>–<h3> headings are the sections that
 * teaching needs. API-teaching pages must also contain a <pre><code>
 * sample that check-doc2-samples.mjs type-checks.
 *
 * The 53-line Commands.tsx that named the spec in a code span and
 * avoided "Coming soon" fails this contract: it lacks Command registry,
 * Dispatch and precedence, Registering or overriding, Built-in catalog,
 * and a sample.
 */
const requiredPages = [
	{
		id: "getting-started",
		file: "GettingStarted.tsx",
		owner: "examples/react",
		headings: ["React", "Vue", "Vanilla DOM"],
		sample: true,
	},
	{
		id: "core-concepts",
		file: "CoreConcepts.tsx",
		owner: "spec-v2/01-architecture.md",
		headings: ["Document store", "Ops and apply", "Origins"],
		sample: true,
	},
	{
		id: "selection",
		file: "Selection.tsx",
		owner: "spec-v2/03-selection.md",
		headings: ["Selection kinds", "Host writes"],
		sample: true,
	},
	{
		id: "extensions",
		file: "Extensions.tsx",
		owner: "spec-v2/04-facets.md",
		headings: ["Facets"],
		sample: true,
	},
	{
		id: "commands",
		file: "Commands.tsx",
		owner: "spec-v2/05-commands.md",
		headings: [
			"Command registry",
			"Dispatch and precedence",
			"Registering or overriding",
			"Built-in catalog",
			"Keymaps",
		],
		sample: true,
	},
	{
		id: "collaboration",
		file: "Collaboration.tsx",
		owner: "COLLABORATION.md",
		headings: ["Setup", "What Pen guarantees", "What the host owns"],
		sample: true,
	},
	{
		id: "ai",
		file: "AI.tsx",
		owner: "ModelAdapter",
		headings: ["One door", "Features"],
		sample: true,
	},
	{
		id: "import-export",
		file: "ImportExport.tsx",
		owner: "@input/pen-import-html",
		headings: [
			"Packages",
			"Clipboard payload",
			"Paste fidelity",
			"Export fidelity",
			"Ingest bounds",
			"Asset provider",
		],
		sample: true,
	},
	{
		id: "security",
		file: "Security.tsx",
		owner: "spec-v2/12-security.md",
		headings: ["URL policy"],
		sample: false,
	},
	{
		id: "accessibility",
		file: "Accessibility.tsx",
		owner: "spec-v2/13-accessibility.md",
		headings: ["Editing surface"],
		sample: true,
	},
	{
		id: "support",
		file: "Support.tsx",
		owner: "spec-v2/15-host-integration.md",
		headings: ["Browser and Node support"],
		sample: false,
	},
	{
		id: "localization",
		file: "Localization.tsx",
		owner: "spec-v2/16-localization.md",
		headings: ["Locale and messages", "Default catalog"],
		sample: true,
	},
	{
		id: "upgrade",
		file: "Upgrade.tsx",
		owner: "MIGRATION.md",
		headings: ["Support", "Landed host-visible breaks"],
		sample: false,
	},
];

const SAMPLE_RE = /<pre>\s*<code>\{`/;
const HEADING_RE = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g;

function stripTags(html) {
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

function headingsIn(source) {
	return [...source.matchAll(new RegExp(HEADING_RE.source, HEADING_RE.flags))].map(
		(match) => stripTags(match[1] ?? ""),
	);
}

const failures = [];

if (requiredPages.length === 0) {
	failures.push("required page list is empty");
}

if (!existsSync(pagesRoot)) {
	failures.push("src/pages is missing");
}

for (const page of requiredPages) {
	const pagePath = join(pagesRoot, page.file);
	if (!existsSync(pagePath)) {
		failures.push(`missing page module src/pages/${page.file}`);
		continue;
	}
	const source = readFileSync(pagePath, "utf8");
	if (!appSource.includes(`"${page.id}"`)) {
		failures.push(`App.tsx does not register page id "${page.id}"`);
	}
	if (!appSource.includes(`href: "#/${page.id}"`)) {
		failures.push(`App.tsx has no nav href "#/${page.id}"`);
	}
	if (!source.includes(page.owner)) {
		failures.push(
			`${page.file} does not cite owner ${JSON.stringify(page.owner)}`,
		);
	}
	const headings = headingsIn(source);
	for (const heading of page.headings) {
		if (!headings.includes(heading)) {
			failures.push(
				`${page.file} is missing required heading ${JSON.stringify(heading)}`,
			);
		}
	}
	if (page.sample && !SAMPLE_RE.test(source)) {
		failures.push(
			`${page.file} has no type-checked <pre><code> sample`,
		);
	}
}

function walk(directory) {
	if (!existsSync(directory)) {
		return [];
	}
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

console.log(`DOC2 page gate: checked ${requiredPages.length} pages`);

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`DOC2 page gate: ${failure}`);
	}
	process.exit(1);
}

console.log(`DOC2 page gate: ${requiredPages.length} required pages present`);

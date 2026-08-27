/**
 * COL5 / COL6 docs gate.
 *
 * COL5: the collaboration page must still make five host-facing claims.
 * The gate keys on `data-col5` anchors (invisible to readers) and then
 * checks token groups inside each anchored element. That tracks the
 * claim, not a frozen sentence: a rewrite that keeps the meaning stays
 * green; deleting the paragraph, emptying the anchor, or dropping a
 * load-bearing half (especially the ariaReadOnly security-boundary warning)
 * goes red.
 *
 * COL6: every transport variant of @input/pen-transport (the exports-map
 * subpaths besides `.` and `./package.json`) must declare exactly one of
 * reference | production | development-only in its README section
 * (`## \`./<variant>\``). The exports map is enumerated so a third
 * transport subpath is covered without editing this file.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageRoot, "../..");

const GRADES = ["reference", "production", "development-only"];
const GRADE_LINE_RE =
	/\*{0,2}grade:\s*(reference|production|development-only)\.?\*{0,2}/gi;

const COL5_CLAIMS = [
	{
		id: "no-infrastructure",
		label: "Pen provides no transport/provider/server/rooms/presence infrastructure",
		groups: [
			{ name: "transport", pattern: /\btransport\b/ },
			{ name: "provider", pattern: /\bprovider\b/ },
			{ name: "server", pattern: /\bserver\b/ },
			{ name: "rooms", pattern: /\brooms?\b/ },
			{ name: "presence", pattern: /\bpresence\b/ },
		],
	},
	{
		id: "no-auth",
		label: "Pen authenticates nobody",
		groups: [
			{
				name: "auth-subject",
				pattern: /\bauthenticat|\bsession\b|\btoken\b|\btrusted peer\b/,
			},
			{
				name: "negation",
				pattern: /\bno\b|\bnot\b|\bnever\b|\bnobody\b/,
			},
		],
	},
	{
		id: "readonly-is-ui",
		label: "pen.ariaReadOnly is a UI mode, not a security boundary, and stops nothing over the wire",
		groups: [
			{ name: "pen.ariaReadOnly", pattern: /pen\.ariareadonly/ },
			{ name: "ui-or-local-mode", pattern: /\bui\b|\blocal\b/ },
			{
				name: "not-a-security-boundary",
				pattern: /\bsecurity\b|\baccess[- ]?control\b/,
			},
			{
				name: "does-not-stop-inbound",
				pattern:
					/\bwire\b|\bremote\b|\binbound\b|\bincoming\b|\bnetwork\b/,
			},
			{
				name: "stop-or-arrive",
				pattern: /\bstops?\b|\bprevent|\barriv|\bfilter|\b not block\b/,
			},
		],
	},
	{
		id: "no-schema-merge",
		label: "Pen does not merge schemas between peers",
		groups: [
			{ name: "schema", pattern: /\bschemas?\b|\bregistr(?:y|ies)\b/ },
			{ name: "merge", pattern: /\bmerge\b|\bnegotiat|\breconcil/ },
			{ name: "peers", pattern: /\bpeers?\b|\bclients?\b/ },
			{ name: "negation", pattern: /\bno\b|\bnot\b|\bnever\b/ },
		],
	},
	{
		id: "offline-is-yjs",
		label: "offline convergence is Yjs's guarantee, not a Pen feature",
		groups: [
			{ name: "offline", pattern: /\boffline\b/ },
			{ name: "yjs", pattern: /\byjs\b/ },
			{
				name: "yjs-owns-it",
				pattern:
					/\bguarantee\b|\bnot a pen\b|\bpen adds no\b|\bpen contributes no\b|\bnot a .{0,40}feature\b/,
			},
		],
	},
];

function parseArgs(argv) {
	const args = {
		page: join(packageRoot, "src", "pages", "Collaboration.tsx"),
		transportRoot: join(repoRoot, "packages", "transport"),
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--page") {
			i += 1;
			args.page = argv[i];
		} else if (arg === "--transport-root") {
			i += 1;
			args.transportRoot = argv[i];
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return args;
}

function normalizeText(jsxInner) {
	return jsxInner
		.replace(/\{`[\s\S]*?`\}/g, " ")
		.replace(/\{[^}]*\}/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function sliceUntilClose(source, from, tag) {
	const openNeedle = `<${tag}`;
	const closeNeedle = `</${tag}>`;
	let depth = 1;
	let i = from;
	while (i < source.length && depth > 0) {
		const nextOpen = source.indexOf(openNeedle, i);
		const nextClose = source.indexOf(closeNeedle, i);
		if (nextClose === -1) {
			return source.slice(from);
		}
		const afterOpen =
			nextOpen === -1 ? "" : source[nextOpen + openNeedle.length];
		const openIsTag =
			nextOpen !== -1 &&
			nextOpen < nextClose &&
			(afterOpen === " " ||
				afterOpen === ">" ||
				afterOpen === "\n" ||
				afterOpen === "\t");
		if (openIsTag) {
			depth += 1;
			i = nextOpen + openNeedle.length;
		} else {
			depth -= 1;
			if (depth === 0) {
				return source.slice(from, nextClose);
			}
			i = nextClose + closeNeedle.length;
		}
	}
	return source.slice(from);
}

function extractClaims(source) {
	const claims = new Map();
	const openRe =
		/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*\bdata-col5=["']([^"']+)["'][^>]*)>/g;
	let match = openRe.exec(source);
	while (match) {
		const tag = match[1];
		const id = match[3];
		const inner = sliceUntilClose(
			source,
			match.index + match[0].length,
			tag,
		);
		claims.set(id, normalizeText(inner));
		match = openRe.exec(source);
	}
	return claims;
}

function checkCol5(pageSource, pageLabel) {
	const failures = [];
	const claims = extractClaims(pageSource);
	for (const claim of COL5_CLAIMS) {
		const text = claims.get(claim.id);
		if (text == null) {
			failures.push(
				`COL5: ${pageLabel} is missing data-col5="${claim.id}" (${claim.label})`,
			);
			continue;
		}
		if (text.length === 0) {
			failures.push(
				`COL5: ${pageLabel} data-col5="${claim.id}" is empty (${claim.label})`,
			);
			continue;
		}
		for (const group of claim.groups) {
			if (!group.pattern.test(text)) {
				const extra =
					claim.id === "readonly-is-ui"
						? " Both halves of the ariaReadOnly warning must ship together: it is a UI mode, not a security boundary, and it stops nothing arriving over the wire."
						: "";
				failures.push(
					`COL5: ${pageLabel} data-col5="${claim.id}" is missing the "${group.name}" claim (${claim.label}).${extra}`,
				);
			}
		}
	}
	return failures;
}

function transportVariants(transportRoot) {
	const manifestPath = join(transportRoot, "package.json");
	if (!existsSync(manifestPath)) {
		return [];
	}
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (manifest.private === true || typeof manifest.exports !== "object") {
		return [];
	}
	return Object.keys(manifest.exports)
		.filter((key) => key !== "." && key !== "./package.json")
		.sort();
}

function variantSection(readme, variant) {
	const headingRe = new RegExp(
		`^##\\s+\`${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\`\\s*$`,
		"m",
	);
	const heading = headingRe.exec(readme);
	if (!heading) {
		return null;
	}
	const from = heading.index + heading[0].length;
	const next = readme.slice(from).match(/^##\s+/m);
	return next == null
		? readme.slice(from)
		: readme.slice(from, from + next.index);
}

function checkCol6(transportRoot) {
	const failures = [];
	const variants = transportVariants(transportRoot);
	if (variants.length === 0) {
		failures.push(
			`COL6: no transport variant subpaths found in ${relative(repoRoot, join(transportRoot, "package.json")) || "packages/transport/package.json"} (gate fails closed)`,
		);
		return failures;
	}
	const readmePath = join(transportRoot, "README.md");
	const label = relative(repoRoot, readmePath);
	if (!existsSync(readmePath)) {
		failures.push(
			`COL6: ${label} is missing (each transport variant must declare a grade)`,
		);
		return failures;
	}
	const readme = readFileSync(readmePath, "utf8");
	for (const variant of variants) {
		const section = variantSection(readme, variant);
		if (section == null) {
			failures.push(
				`COL6: ${label} has no \`## \`${variant}\`\` section (each exports-map variant documents its grade there)`,
			);
			continue;
		}
		const found = [];
		GRADE_LINE_RE.lastIndex = 0;
		let match = GRADE_LINE_RE.exec(section);
		while (match) {
			found.push(match[1]);
			match = GRADE_LINE_RE.exec(section);
		}
		if (found.length === 0) {
			failures.push(
				`COL6: ${label} section ${variant} has no grade line (expected exactly one of: ${GRADES.join(", ")})`,
			);
			continue;
		}
		if (found.length !== 1) {
			failures.push(
				`COL6: ${label} section ${variant} declares ${found.length} grades (${found.join(", ")}); expected exactly one`,
			);
		}
	}
	return failures;
}

function gutReadonlySecurityHalf(pageSource) {
	const openRe =
		/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*\bdata-col5=["']readonly-is-ui["'][^>]*)>/;
	const match = openRe.exec(pageSource);
	if (!match) {
		return null;
	}
	const tag = match[1];
	const innerStart = match.index + match[0].length;
	const closeNeedle = `</${tag}>`;
	const closeAt = pageSource.indexOf(closeNeedle, innerStart);
	if (closeAt === -1) {
		return null;
	}
	return (
		pageSource.slice(0, innerStart) +
		"Permissions. pen.ariaReadOnly sets aria-readonly on a local editor." +
		pageSource.slice(closeAt)
	);
}

function watchReadonlyFailure(pageSource, pageLabel) {
	const scratch = gutReadonlySecurityHalf(pageSource);
	if (scratch == null) {
		return [
			`COL5: could not gut data-col5="readonly-is-ui" in ${pageLabel} to prove the failure path`,
		];
	}
	const failures = checkCol5(
		scratch,
		`${pageLabel} (scratch, ariaReadOnly security-boundary half removed)`,
	);
	const named = failures.filter(
		(line) =>
			line.includes('data-col5="readonly-is-ui"') &&
			(line.includes("not-a-security-boundary") ||
				line.includes("does-not-stop-inbound") ||
				line.includes("stop-or-arrive")),
	);
	if (named.length === 0) {
		return [
			`COL5: gutting the ariaReadOnly security-boundary half in ${pageLabel} did not fail the gate (failure path is a no-op)`,
		];
	}
	return [];
}

function displayPath(filePath) {
	const rel = relative(repoRoot, filePath);
	if (rel.startsWith("..") || rel.startsWith("/")) {
		return filePath;
	}
	return rel;
}

const args = parseArgs(process.argv.slice(2));
const pageLabel = displayPath(args.page);
const failures = [];

if (!existsSync(args.page)) {
	failures.push(`COL5: ${pageLabel} does not exist`);
} else {
	const pageSource = readFileSync(args.page, "utf8");
	failures.push(...checkCol5(pageSource, pageLabel));
	if (failures.length === 0) {
		failures.push(...watchReadonlyFailure(pageSource, pageLabel));
	}
}

failures.push(...checkCol6(args.transportRoot));

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

const variantCount = transportVariants(args.transportRoot).length;
console.log(
	`COL5/COL6 docs gate: ${COL5_CLAIMS.length} collaboration claims present, ${variantCount} transport variant(s) graded`,
);

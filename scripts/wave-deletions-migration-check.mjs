#!/usr/bin/env node
/**
 * Wave Deletions ↔ MIGRATION.md heading cross-check (spec-v3 Wave 6
 * Step 6.6 / WA5). Not a GATE — `v3-gates.mjs` has no
 * `--migration-cross-check` flag; `migration-guide-check.mjs` audits
 * claims *inside* `spec-v2/MIGRATION.md` against the repo, not wave
 * Deletions against headings. This script is the other direction.
 *
 * MATCHING RULE (must be able to fail on a real undocumented deletion)
 * -------------------------------------------------------------------
 * An ENTRY is, from each wave file's `## Deletions` body:
 *   1. every backticked token except the skip list (`MIGRATION.md` is
 *      a citation of the guide, not a deletion), and
 *   2. every semicolon / bullet / paragraph clause that contains no
 *      backticks, after dropping "See …" cross-references.
 * An explicit "None…" Deletions body contributes 0 entries and is not
 * an empty-population error.
 *
 * A MATCHING HEADING is an ATX heading (`#`–`######`) in MIGRATION.md
 * whose text (backticks stripped, case-insensitive) contains:
 *   - the token, or
 *   - the basename of a path token, or
 *   - the prefix of a trailing-glob token (`PEN_APPLY_*` → `PEN_APPLY_`)
 *     when that prefix is at least 4 characters, or
 *   - for a prose clause: at least two content words (length ≥ 5,
 *     not stopwords), or the single content word when the clause has
 *     only one (length ≥ 6).
 *
 * Headings only — a mention in a table row or paragraph does not
 * count. That is how an undocumented deletion fails even when
 * MIGRATION.md is long. Do not loosen this to "mentioned somewhere".
 *
 * Empty population is always an error (never a vacuous pass):
 *   - no wave files / missing waves dir
 *   - a wave file with no `## Deletions` (or more than one)
 *   - a Deletions body that is empty (not "None")
 *   - zero extractable entries across non-None in-scope waves
 *   - missing MIGRATION.md or zero headings
 *
 * Default scope is every discovered `wave-*.md` (today: waves 0–6).
 * Waves 0–2 are included because WA5 is per deletion, not per wave
 * number; 0–1 are explicit None. `--min-wave` / `--max-wave` exist
 * if a later owner wants the Wave 6-literal 3–6 reading.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	CANNOT_CHECK_ABSENT,
	CANNOT_CHECK_EMPTY_DIR,
	collectWaveFiles,
} from "./v3-gates.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const GUIDE_REL = "spec-v2/MIGRATION.md";
const WAVE_NUM_RE = /^wave-(\d+)/i;
const DELETIONS_HEADING_RE = /^## Deletions\s*$/;
const NEXT_H2_RE = /^## /;
const ATX_HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const TICK_RE = /`([^`]+)`/g;
const SKIP_TOKENS = new Set(["MIGRATION.md"]);
const SEE_CLAUSE_RE = /^See\b/i;
const EXPLICIT_NONE_RE = /^None\b/i;
const GLOB_PREFIX_MIN = 4;
const PROSE_WORD_MIN = 5;
const PROSE_SINGLE_MIN = 6;
const STOPWORDS = new Set([
	"about",
	"above",
	"after",
	"their",
	"there",
	"these",
	"those",
	"every",
	"other",
	"under",
	"until",
	"while",
	"where",
	"which",
	"whose",
	"being",
	"listed",
	"written",
	"reason",
	"named",
	"steps",
	"first",
	"whole",
	"same",
	"must",
	"been",
	"have",
	"does",
	"only",
	"adds",
	"plus",
	"total",
	"time",
	"seed",
	"this",
	"that",
	"with",
	"from",
	"into",
	"onto",
	"than",
	"then",
	"them",
	"they",
	"were",
	"also",
	"each",
	"both",
	"when",
	"what",
]);

export const CANNOT_CHECK_MISSING_GUIDE =
	"cannot check: MIGRATION.md is missing";
export const CANNOT_CHECK_ZERO_HEADINGS =
	"cannot check: MIGRATION.md yielded 0 headings";
export const CANNOT_CHECK_ZERO_ENTRIES =
	"cannot check: in-scope non-None Deletions yielded 0 entries";
export const CANNOT_CHECK_NO_DELETIONS =
	"cannot check: wave file has no ## Deletions section";
export const CANNOT_CHECK_MULTI_DELETIONS =
	"cannot check: wave file has more than one ## Deletions section";
export const CANNOT_CHECK_EMPTY_DELETIONS =
	"cannot check: Deletions section yielded 0 entries";

export function parseArgs(argv, repoRoot = DEFAULT_REPO_ROOT) {
	const files = [];
	let wavesDir = path.join(repoRoot, "spec-v3", "waves");
	let guideRel = GUIDE_REL;
	let selfTest = false;
	let minWave = 0;
	let maxWave = Number.POSITIVE_INFINITY;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			selfTest = true;
			continue;
		}
		if (arg === "--waves-dir") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --waves-dir");
			}
			wavesDir = path.resolve(repoRoot, value);
			i += 1;
			continue;
		}
		if (arg === "--guide") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --guide");
			}
			guideRel = value;
			i += 1;
			continue;
		}
		if (arg === "--min-wave") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --min-wave");
			}
			minWave = Number(value);
			i += 1;
			continue;
		}
		if (arg === "--max-wave") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --max-wave");
			}
			maxWave = Number(value);
			i += 1;
			continue;
		}
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg.startsWith("--")) {
			throw new Error(`unknown flag ${arg}`);
		}
		files.push(path.resolve(repoRoot, arg));
	}
	return { files, wavesDir, guideRel, selfTest, minWave, maxWave, repoRoot };
}

export function waveNumberFromFile(filePath) {
	const base = path.basename(filePath);
	const match = base.match(WAVE_NUM_RE);
	if (!match) {
		return null;
	}
	return Number(match[1]);
}

export function inWaveScope(filePath, minWave, maxWave) {
	const num = waveNumberFromFile(filePath);
	if (num == null) {
		return true;
	}
	return num >= minWave && num <= maxWave;
}

export function extractDeletionsSections(text) {
	const lines = text.split(/\r?\n/);
	const sections = [];
	for (let i = 0; i < lines.length; i += 1) {
		if (!DELETIONS_HEADING_RE.test(lines[i])) {
			continue;
		}
		const bodyLines = [];
		for (let j = i + 1; j < lines.length; j += 1) {
			if (NEXT_H2_RE.test(lines[j])) {
				break;
			}
			bodyLines.push(lines[j]);
		}
		sections.push({
			line: i + 1,
			body: bodyLines.join("\n").trim(),
		});
	}
	return sections;
}

export function isExplicitNone(body) {
	return EXPLICIT_NONE_RE.test(body.trim());
}

export function splitDeletionClauses(body) {
	const trimmed = body.trim();
	if (trimmed.length === 0) {
		return [];
	}
	if (/^[-*]\s+/m.test(trimmed)) {
		return trimmed
			.split(/\n/)
			.map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
			.filter((line) => line.length > 0);
	}
	return trimmed
		.split(/\n\s*\n/)
		.flatMap((para) => para.split(";"))
		.map((part) => part.replace(/\s+/g, " ").trim())
		.filter((part) => part.length > 0);
}

export function extractBacktickTokens(text) {
	const tokens = [];
	const seen = new Set();
	const pattern = new RegExp(TICK_RE.source, TICK_RE.flags);
	for (const match of text.matchAll(pattern)) {
		const token = match[1].trim();
		if (token.length === 0 || SKIP_TOKENS.has(token) || seen.has(token)) {
			continue;
		}
		seen.add(token);
		tokens.push(token);
	}
	return tokens;
}

export function parseDeletionsEntries(body, source) {
	if (isExplicitNone(body)) {
		return { kind: "none", entries: [] };
	}
	if (body.trim().length === 0) {
		return { kind: "empty", entries: [] };
	}

	const entries = [];
	const seen = new Set();
	function push(entry) {
		const key = `${entry.kind}:${entry.key}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		entries.push({ ...entry, source });
	}

	for (const rawClause of splitDeletionClauses(body)) {
		const clause = rawClause.replace(/\s+See\b.+$/i, "").trim();
		if (clause.length === 0 || SEE_CLAUSE_RE.test(clause)) {
			continue;
		}
		const tokens = extractBacktickTokens(clause);
		for (const token of tokens) {
			push({ kind: "token", key: token, display: token });
		}
		if (tokens.length === 0) {
			const display = clause.replace(/[.\s]+$/g, "");
			if (display.length === 0) {
				continue;
			}
			push({ kind: "prose", key: display, display });
		}
	}

	if (entries.length === 0) {
		return { kind: "empty", entries: [] };
	}
	return { kind: "entries", entries };
}

export function extractHeadings(text) {
	const headings = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i += 1) {
		const match = lines[i].match(ATX_HEADING_RE);
		if (!match) {
			continue;
		}
		const raw = match[2].replace(/\s+#+\s*$/, "").trim();
		headings.push({
			line: i + 1,
			depth: match[1].length,
			raw,
			normalized: stripTicks(raw).toLowerCase(),
		});
	}
	return headings;
}

export function stripTicks(text) {
	return text.replace(/`/g, "");
}

export function pathBasename(token) {
	if (!token.includes("/")) {
		return null;
	}
	const base = token.split("/").pop() ?? "";
	return base.length > 0 ? base : null;
}

export function globPrefix(token) {
	if (!token.endsWith("*") || token.length < GLOB_PREFIX_MIN + 1) {
		return null;
	}
	const prefix = token.slice(0, -1);
	return prefix.length >= GLOB_PREFIX_MIN ? prefix : null;
}

export function proseContentWords(clause) {
	const words = [];
	const seen = new Set();
	for (const raw of clause.toLowerCase().match(/[a-z0-9][a-z0-9-]{3,}/g) ??
		[]) {
		if (STOPWORDS.has(raw) || seen.has(raw)) {
			continue;
		}
		seen.add(raw);
		words.push(raw);
	}
	return words;
}

export function entryMatchesHeading(entry, heading) {
	const haystack = heading.normalized;
	if (entry.kind === "token") {
		const needle = entry.key.toLowerCase();
		if (haystack.includes(needle)) {
			return true;
		}
		const base = pathBasename(entry.key);
		if (base && haystack.includes(base.toLowerCase())) {
			return true;
		}
		const prefix = globPrefix(entry.key);
		if (prefix && haystack.includes(prefix.toLowerCase())) {
			return true;
		}
		return false;
	}

	const words = proseContentWords(entry.key);
	if (words.length === 0) {
		return haystack.includes(entry.key.toLowerCase());
	}
	if (words.length === 1) {
		return (
			words[0].length >= PROSE_SINGLE_MIN && haystack.includes(words[0])
		);
	}
	const hits = words.filter(
		(word) => word.length >= PROSE_WORD_MIN && haystack.includes(word),
	);
	return hits.length >= 2;
}

export function undocumentedFailure(entry, fileRel) {
	return `FAIL undocumented deletion: \`${entry.display}\` (${fileRel})`;
}

export function emptyDeletionsFailure(fileRel) {
	return `${CANNOT_CHECK_EMPTY_DELETIONS} (${fileRel})`;
}

function posixRel(repoRoot, filePath) {
	return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

export function evaluateCrossCheck(options) {
	const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
	const minWave = options.minWave ?? 0;
	const maxWave = options.maxWave ?? Number.POSITIVE_INFINITY;
	const collected = collectWaveFiles(options.wavesDir, options.files ?? []);
	if (collected.error) {
		return {
			ok: false,
			error: collected.error,
			population:
				"population: 0 wave files, 0 deletion entries, 0 headings",
			waves: [],
			headings: [],
			undocumented: [],
			repoRoot,
		};
	}

	const scoped = collected.files.filter((file) =>
		inWaveScope(file, minWave, maxWave),
	);
	if (scoped.length === 0) {
		return {
			ok: false,
			error: CANNOT_CHECK_EMPTY_DIR,
			population:
				"population: 0 wave files, 0 deletion entries, 0 headings",
			waves: [],
			headings: [],
			undocumented: [],
			repoRoot,
		};
	}

	const guidePath = path.resolve(repoRoot, options.guideRel ?? GUIDE_REL);
	let guideText = null;
	try {
		guideText = fs.readFileSync(guidePath, "utf8");
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return {
				ok: false,
				error: CANNOT_CHECK_MISSING_GUIDE,
				population: `population: ${scoped.length} wave files, 0 deletion entries, 0 headings`,
				waves: [],
				headings: [],
				undocumented: [],
				repoRoot,
			};
		}
		throw error;
	}

	const headings = extractHeadings(guideText);
	const waves = [];
	const undocumented = [];
	let structural = null;

	for (const file of scoped) {
		const rel = posixRel(repoRoot, file);
		const text = fs.readFileSync(file, "utf8");
		const sections = extractDeletionsSections(text);
		if (sections.length === 0) {
			structural = `${CANNOT_CHECK_NO_DELETIONS} (${rel})`;
			waves.push({
				file,
				rel,
				wave: waveNumberFromFile(file),
				kind: "missing",
				entries: [],
			});
			continue;
		}
		if (sections.length > 1) {
			structural = `${CANNOT_CHECK_MULTI_DELETIONS} (${rel})`;
			waves.push({
				file,
				rel,
				wave: waveNumberFromFile(file),
				kind: "multi",
				entries: [],
			});
			continue;
		}

		const parsed = parseDeletionsEntries(sections[0].body, rel);
		if (parsed.kind === "empty") {
			structural = emptyDeletionsFailure(rel);
			waves.push({
				file,
				rel,
				wave: waveNumberFromFile(file),
				kind: "empty",
				entries: [],
			});
			continue;
		}

		const matched = parsed.entries.map((entry) => {
			const heading = headings.find((item) =>
				entryMatchesHeading(entry, item),
			);
			return { entry, heading: heading ?? null };
		});
		waves.push({
			file,
			rel,
			wave: waveNumberFromFile(file),
			kind: parsed.kind,
			entries: matched,
		});
		for (const row of matched) {
			if (row.heading == null) {
				undocumented.push({
					file: rel,
					entry: row.entry,
					message: undocumentedFailure(row.entry, rel),
				});
			}
		}
	}

	const entryCount = waves.reduce(
		(sum, wave) => sum + wave.entries.length,
		0,
	);
	const population = `population: ${waves.length} wave files, ${entryCount} deletion entries, ${headings.length} headings`;

	if (structural) {
		return {
			ok: false,
			error: structural,
			population,
			waves,
			headings,
			undocumented,
			repoRoot,
		};
	}

	if (headings.length === 0) {
		return {
			ok: false,
			error: CANNOT_CHECK_ZERO_HEADINGS,
			population,
			waves,
			headings,
			undocumented,
			repoRoot,
		};
	}

	const obligated = waves.filter((wave) => wave.kind !== "none");
	if (obligated.length > 0 && entryCount === 0) {
		return {
			ok: false,
			error: CANNOT_CHECK_ZERO_ENTRIES,
			population,
			waves,
			headings,
			undocumented,
			repoRoot,
		};
	}

	return {
		ok: undocumented.length === 0,
		error:
			undocumented.length === 0
				? null
				: `${undocumented.length} undocumented deletion(s)`,
		population,
		waves,
		headings,
		undocumented,
		repoRoot,
	};
}

export function formatReport(result) {
	const lines = ["wave-deletions ↔ MIGRATION.md", "", result.population];
	for (const wave of result.waves) {
		if (wave.kind === "none") {
			lines.push(`  ${wave.rel}  none`);
			continue;
		}
		if (
			wave.kind === "empty" ||
			wave.kind === "missing" ||
			wave.kind === "multi"
		) {
			lines.push(`  ${wave.rel}  ${wave.kind}`);
			continue;
		}
		lines.push(`  ${wave.rel}  ${wave.entries.length} entries`);
	}

	if (result.undocumented.length > 0) {
		lines.push("");
		for (const hit of result.undocumented) {
			lines.push(hit.message);
		}
	}

	if (result.error && result.undocumented.length === 0) {
		lines.push("");
		lines.push(result.error);
	} else if (result.error && result.undocumented.length > 0) {
		lines.push("");
		lines.push(result.error);
	}

	const documented = result.waves.reduce(
		(sum, wave) =>
			sum + wave.entries.filter((row) => row.heading != null).length,
		0,
	);
	lines.push("");
	lines.push(
		`summary: ${documented} documented, ${result.undocumented.length} undocumented`,
	);
	return lines.join("\n");
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTests(repoRoot = DEFAULT_REPO_ROOT) {
	const fixtureRoot = path.join(
		repoRoot,
		"scripts",
		"__fixtures__",
		"wave-deletions-migration-check",
	);

	const passing = evaluateCrossCheck({
		repoRoot,
		wavesDir: fixtureRoot,
		files: [path.join(fixtureRoot, "passing-wave.md")],
		guideRel: path.join(
			"scripts",
			"__fixtures__",
			"wave-deletions-migration-check",
			"passing-MIGRATION.md",
		),
	});
	assert(
		passing.ok,
		`self-test: passing fixture must pass: ${passing.error}`,
	);
	assert(
		passing.undocumented.length === 0,
		"self-test: passing fixture has undocumented entries",
	);

	const failing = evaluateCrossCheck({
		repoRoot,
		wavesDir: fixtureRoot,
		files: [path.join(fixtureRoot, "failing-wave.md")],
		guideRel: path.join(
			"scripts",
			"__fixtures__",
			"wave-deletions-migration-check",
			"failing-MIGRATION.md",
		),
	});
	assert(!failing.ok, "self-test: failing fixture must fail");
	const failMessages = failing.undocumented.map((hit) => hit.message);
	assert(
		failMessages.some((message) =>
			message.includes("`undocumentedDeletion`"),
		),
		`self-test: failing fixture must name undocumentedDeletion, got ${JSON.stringify(failMessages)}`,
	);
	assert(
		!failMessages.some((message) => message.includes("`retiredSymbol`")),
		`self-test: failing fixture must not flag the documented token, got ${JSON.stringify(failMessages)}`,
	);

	const empty = evaluateCrossCheck({
		repoRoot,
		wavesDir: fixtureRoot,
		files: [path.join(fixtureRoot, "empty-wave.md")],
		guideRel: path.join(
			"scripts",
			"__fixtures__",
			"wave-deletions-migration-check",
			"empty-MIGRATION.md",
		),
	});
	assert(!empty.ok, "self-test: empty fixture must fail");
	assert(
		empty.error?.startsWith(CANNOT_CHECK_EMPTY_DELETIONS),
		`self-test: empty fixture error, got ${empty.error}`,
	);
	assert(
		empty.error?.includes("empty-wave.md"),
		`self-test: empty fixture must name the file, got ${empty.error}`,
	);

	return { passing, failing, empty };
}

function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.selfTest) {
		const reports = runSelfTests(parsed.repoRoot);
		console.log("wave-deletions-migration-check self-test ok");
		console.log(formatReport(reports.passing));
		console.log("");
		console.log(formatReport(reports.failing));
		console.log("");
		console.log(formatReport(reports.empty));
		return;
	}

	const result = evaluateCrossCheck({
		repoRoot: parsed.repoRoot,
		wavesDir: parsed.wavesDir,
		files: parsed.files,
		guideRel: parsed.guideRel,
		minWave: parsed.minWave,
		maxWave: parsed.maxWave,
	});
	console.log(formatReport(result));
	if (!result.ok) {
		process.exitCode = 1;
	}
}

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
	main();
}

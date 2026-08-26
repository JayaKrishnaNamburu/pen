#!/usr/bin/env node
/**
 * Host migration guide truth (spec/MIGRATION.md).
 *
 * Adopters read this file to learn what broke. Nothing else checks it.
 * This gate covers the subset that is mechanically true or false:
 *   - every `@input/pen-*` name / version / export subpath resolves
 *   - "`symbol` exports from `@input/pen-x`" (and close variants)
 *     against that package's committed api-report.md
 *   - negative claims ("not on the index", "not re-exported",
 *     "is deleted", "do not import") stay false
 *   - the listed `OpOriginType` union matches `packages/types`
 *   - fenced ts/tsx/js samples type-check the way DOC2 does
 *   - repo paths named in backticks exist (or stay deleted)
 *   - `yjs@…` matches the `@input/pen-crdt-yjs` peer range
 *
 * Does not catch (on purpose — a guess here becomes a deleted gate):
 *   - "Landed" / "Not-yet" / "this is dangerous" prose
 *   - whether an exported symbol is wired (Wave 4's helpers export
 *     today; `editor.dispatch` still does not exist)
 *   - method-on-interface names (`editor.facet`, `getCommands`)
 *   - option/field names (`allowedMutatingTools`, `extensions`)
 *   - "React and Vue both export X" without an export verb
 *   - diagnostic code strings (the generated table is incomplete:
 *     `document-size` and `ORIGIN_UNKNOWN` are real and absent)
 *   - stale caveats of the "hours-ago Not-yet" kind
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	extractFencedSamples,
	extractPackageRefs,
	evaluateRefs,
	loadNamedPackages,
	missingTypeArtifacts,
	typecheckSamples,
} from "./doc-refs.mjs";
import { loadPublishedPackages } from "./api-reports.mjs";
import { parseApiReport, uniquePublicSymbols } from "./api-docs-coverage.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const GUIDE_REL = "spec/MIGRATION.md";
const ORIGIN_SOURCE_REL = "packages/types/src/types/ops.ts";
const YJS_ADAPTER = "@input/pen-crdt-yjs";
const MIN_EXPORT_CLAIMS = 8;

const IDENT_RE = /`([A-Za-z_][A-Za-z0-9_]*)(?:\([^`]*\))?`/g;
const PATH_RE =
	/`((?:packages|scripts|spec(?:-v2)?|waves|core\/src)\/[A-Za-z0-9_./-]+)`/g;
const SPEC_FILE_RE = /`(\d{2}-[a-z0-9-]+\.md)`/g;
const ORIGIN_UNION_RE = /the union is `([^`]+)`/i;
const YJS_VERSION_RE = /yjs@(\^?[0-9]+(?:\.[0-9]+)*)/;
const STRONG_EXPORT_RE =
	/export(?:s|ed)? from|re-export(?:s|ed)?|exists? in|lives? in `@input\/|(?:is|are) on `@input\/| in `@input\//;
const FROM_PACKAGE_RE =
	/`([A-Za-z_][A-Za-z0-9_]*)(?:\([^`]*\))?` from `(@input\/pen-[a-z0-9-]+)`/g;
const NOT_ON_INDEX_RE = /not on the `@input\/pen-[a-z0-9-]+` index/i;
const SOURCE_ONLY_RE = /exist under `@input\/pen-[a-z0-9-]+` source/i;
const LIVE_IN_PATH_RE = /lives? in `packages\//;
const TYPES_BARREL_RE = /on the types barrel/i;
const DELETED_RE = /(?:is|are) deleted\b|do not import/i;
const NOT_REEXPORTED_RE = /not re-exported/i;
const FIDELITY_EXPORTERS = ["packages/extensions/interop/FIDELITY.md"];

export function splitSentences(text) {
	return text
		.split(/(?:(?<=\.)(?:\*\*)?\s+(?=[A-Z*`])|; | — )/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

export function extractBacktickIdents(text) {
	const names = [];
	const seen = new Set();
	const pattern = new RegExp(IDENT_RE.source, IDENT_RE.flags);
	for (const match of text.matchAll(pattern)) {
		const name = match[1];
		if (seen.has(name)) {
			continue;
		}
		seen.add(name);
		names.push(name);
	}
	return names;
}

export function packagesIn(text) {
	return extractPackageRefs(text)
		.filter((ref) => !ref.glob)
		.map((ref) => ref.name);
}

export function extractExportClaims(text) {
	const claims = [];
	const lines = text.split(/\n/);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
		if (line.trim().length === 0) {
			continue;
		}
		let lastIdents = [];
		let lastPackages = [];
		for (const sentence of splitSentences(line)) {
			const symbols = extractBacktickIdents(sentence);
			const packages = packagesIn(sentence);
			const lineNumber = i + 1;
			const notOnIndex = NOT_ON_INDEX_RE.test(sentence);
			const notReexported = NOT_REEXPORTED_RE.test(sentence);
			const deleted = DELETED_RE.test(sentence);
			const sourceOnly = SOURCE_ONLY_RE.test(sentence);
			const liveInPath = LIVE_IN_PATH_RE.test(sentence);
			const typesBarrel = TYPES_BARREL_RE.test(sentence);
			const strongExport = STRONG_EXPORT_RE.test(sentence);
			const fromPairs = [
				...sentence.matchAll(new RegExp(FROM_PACKAGE_RE.source, "g")),
			].map((match) => ({ symbol: match[1], package: match[2] }));

			if (notOnIndex || notReexported) {
				const boundSymbols = symbols.length > 0 ? symbols : lastIdents;
				const boundPackages =
					packages.length > 0 ? packages : lastPackages;
				if (boundSymbols.length > 0 && boundPackages.length > 0) {
					claims.push({
						polarity: "absent",
						symbols: boundSymbols,
						packages: boundPackages,
						line: lineNumber,
						sentence,
					});
				}
			} else if (deleted && symbols.length > 0) {
				claims.push({
					polarity: "absent",
					symbols,
					packages: packages.length > 0 ? packages : null,
					line: lineNumber,
					sentence,
				});
			} else if (sourceOnly || liveInPath) {
				// in-source / path location is not a public-export claim
			} else if (typesBarrel && symbols.length > 0) {
				claims.push({
					polarity: "present",
					symbols,
					packages: ["@input/pen-types"],
					line: lineNumber,
					sentence,
				});
			} else if (
				strongExport &&
				packages.length > 0 &&
				symbols.length > 0
			) {
				claims.push({
					polarity: "present",
					symbols,
					packages,
					line: lineNumber,
					sentence,
				});
			} else if (!strongExport && fromPairs.length > 0) {
				for (const pair of fromPairs) {
					claims.push({
						polarity: "present",
						symbols: [pair.symbol],
						packages: [pair.package],
						line: lineNumber,
						sentence,
					});
				}
			}

			if (symbols.length > 0) {
				lastIdents = symbols;
			}
			if (packages.length > 0) {
				lastPackages = packages;
			}
		}
	}

	return claims;
}

export function extractHostCalls(text) {
	const calls = [];
	const lines = text.split(/\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!/\b(?:Fix:|pass |add |import )/i.test(line)) {
			continue;
		}
		if (DELETED_RE.test(line) || NOT_REEXPORTED_RE.test(line)) {
			continue;
		}
		for (const name of extractBacktickIdents(line)) {
			calls.push({ name, line: i + 1 });
		}
	}
	return calls;
}

export function extractGuideOriginUnion(text) {
	const match = ORIGIN_UNION_RE.exec(text);
	if (match == null) {
		return null;
	}
	return match[1]
		.split("|")
		.map((part) => part.trim().replace(/^["']|["']$/g, ""))
		.filter((part) => part.length > 0);
}

export function parseOpOriginTypes(source) {
	const start = source.indexOf("export type OpOriginType");
	if (start < 0) {
		return null;
	}
	const eq = source.indexOf("=", start);
	const end = source.indexOf(";", eq);
	if (eq < 0 || end < 0) {
		return null;
	}
	return [...source.slice(eq + 1, end).matchAll(/"([^"]+)"/g)].map(
		(match) => match[1],
	);
}

export function extractPathClaims(text) {
	const claims = [];
	const lines = text.split(/\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const deleted = /(?:is|are) deleted\b/.test(line);
		const pathPattern = new RegExp(PATH_RE.source, PATH_RE.flags);
		const specPattern = new RegExp(SPEC_FILE_RE.source, SPEC_FILE_RE.flags);
		for (const pattern of [pathPattern, specPattern]) {
			for (const match of line.matchAll(pattern)) {
				claims.push({
					raw: match[1],
					line: i + 1,
					deleted,
				});
			}
		}
	}
	return claims;
}

export function resolveGuidePath(raw, repoRoot) {
	// The guide cites `core/src/...` without the `packages/` prefix
	// because that is how a reader greps it. Everything else is a
	// repo-root-relative path and resolves as written.
	if (raw.startsWith("core/src/")) {
		return path.join(repoRoot, "packages", raw);
	}
	return path.join(repoRoot, raw);
}

export function evaluateExportClaims({ claims, symbolsByPackage }) {
	const hits = [];
	for (const claim of claims) {
		const packages = claim.packages ?? [...symbolsByPackage.keys()];
		for (const symbol of claim.symbols) {
			if (claim.polarity === "absent" && claim.packages == null) {
				const homes = [];
				for (const [pkg, symbols] of symbolsByPackage) {
					if (symbols.has(symbol)) {
						homes.push(pkg);
					}
				}
				if (homes.length > 0) {
					hits.push({
						line: claim.line,
						symbol,
						package: homes.join(", "),
						polarity: claim.polarity,
						reason: `public export (claim said deleted / do-not-import)`,
						sentence: claim.sentence,
					});
				}
				continue;
			}
			for (const pkg of packages) {
				const symbols = symbolsByPackage.get(pkg);
				if (symbols == null) {
					hits.push({
						line: claim.line,
						symbol,
						package: pkg,
						polarity: claim.polarity,
						reason: "no api-report.md loaded for this package",
						sentence: claim.sentence,
					});
					continue;
				}
				const present = symbols.has(symbol);
				if (claim.polarity === "present" && !present) {
					hits.push({
						line: claim.line,
						symbol,
						package: pkg,
						polarity: claim.polarity,
						reason: "not in that package's api-report.md",
						sentence: claim.sentence,
					});
				}
				if (claim.polarity === "absent" && present) {
					hits.push({
						line: claim.line,
						symbol,
						package: pkg,
						polarity: claim.polarity,
						reason: "is a public export (claim said it is not)",
						sentence: claim.sentence,
					});
				}
			}
		}
	}
	hits.sort(
		(left, right) =>
			left.line - right.line || left.symbol.localeCompare(right.symbol),
	);
	return hits;
}

export function evaluateHostCalls({ calls, symbolsByPackage }) {
	const hits = [];
	const seen = new Set();
	for (const call of calls) {
		const key = `${call.line}:${call.name}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		const exists = [...symbolsByPackage.values()].some((symbols) =>
			symbols.has(call.name),
		);
		if (!exists) {
			hits.push({
				line: call.line,
				symbol: call.name,
				reason: "not a public export in any api-report.md",
			});
		}
	}
	return hits;
}

export function evaluateOriginUnion({ guide, actual }) {
	if (guide == null) {
		return {
			ok: false,
			reason: "MIGRATION.md does not list the OpOriginType union",
			missing: [],
			extra: [],
		};
	}
	if (actual == null || actual.length === 0) {
		return {
			ok: false,
			reason: `could not parse OpOriginType from ${ORIGIN_SOURCE_REL}`,
			missing: [],
			extra: [],
		};
	}
	const guideSet = new Set(guide);
	const actualSet = new Set(actual);
	const missing = actual.filter((name) => !guideSet.has(name));
	const extra = guide.filter((name) => !actualSet.has(name));
	return {
		ok: missing.length === 0 && extra.length === 0,
		reason: null,
		missing,
		extra,
	};
}

export function evaluatePaths({ claims, repoRoot }) {
	const hits = [];
	for (const claim of claims) {
		const resolved = resolveGuidePath(claim.raw, repoRoot);
		const exists = existsSync(resolved);
		if (claim.deleted && exists) {
			hits.push({
				line: claim.line,
				path: claim.raw,
				reason: "claimed deleted but the path exists",
			});
		}
		if (!claim.deleted && !exists) {
			hits.push({
				line: claim.line,
				path: claim.raw,
				reason: "path does not exist",
			});
		}
	}
	return hits;
}

export function evaluateYjsPeer({ text, peerRange }) {
	const match = YJS_VERSION_RE.exec(text);
	if (match == null) {
		return {
			ok: false,
			reason: "MIGRATION.md does not state a yjs@ version",
			guide: null,
			peer: peerRange ?? null,
		};
	}
	if (typeof peerRange !== "string" || peerRange.length === 0) {
		return {
			ok: false,
			reason: `${YJS_ADAPTER} has no yjs peerDependency`,
			guide: match[1],
			peer: null,
		};
	}
	if (match[1] !== peerRange) {
		return {
			ok: false,
			reason: `guide says yjs@${match[1]}; ${YJS_ADAPTER} peer is ${peerRange}`,
			guide: match[1],
			peer: peerRange,
		};
	}
	return { ok: true, reason: null, guide: match[1], peer: peerRange };
}

export function evaluateFidelityFiles({ text, repoRoot }) {
	if (!/FIDELITY\.md/.test(text)) {
		return [];
	}
	const hits = [];
	for (const rel of FIDELITY_EXPORTERS) {
		if (!existsSync(path.join(repoRoot, rel))) {
			hits.push({ path: rel, reason: "exporter FIDELITY.md is missing" });
		}
	}
	return hits;
}

export function hasFailures(result) {
	return (
		result.missingGuide ||
		result.missingOriginSource ||
		result.missingReports.length > 0 ||
		result.missingRefs.length > 0 ||
		result.exportHits.length > 0 ||
		result.pathHits.length > 0 ||
		result.fidelityHits.length > 0 ||
		!result.origin.ok ||
		!result.yjs.ok ||
		result.claims.length < MIN_EXPORT_CLAIMS ||
		result.artifacts.length > 0 ||
		result.typecheck.errors.length > 0
	);
}

export function formatReport(result, guideRel = GUIDE_REL) {
	const lines = ["MIGRATION.md host-guide truth"];
	lines.push("");
	lines.push(
		`export claims ${result.claims.length}  samples ${result.typecheck.checked}`,
	);

	if (result.missingGuide) {
		lines.push("");
		lines.push(`FAIL ${guideRel} is missing.`);
	}
	if (result.missingOriginSource) {
		lines.push("");
		lines.push(`FAIL ${ORIGIN_SOURCE_REL} is missing.`);
	}
	if (result.missingReports.length > 0) {
		lines.push("");
		lines.push(
			"FAIL published packages mentioned in the guide have no api-report.md:",
		);
		for (const name of result.missingReports) {
			lines.push(`  ${name}`);
		}
	}
	if (result.claims.length < MIN_EXPORT_CLAIMS) {
		lines.push("");
		lines.push(
			`FAIL extracted ${result.claims.length} export claim(s); need at least ${MIN_EXPORT_CLAIMS} or the parser went vacuous.`,
		);
	}

	if (result.missingRefs.length > 0) {
		lines.push("");
		lines.push("FAIL package or version references that do not exist:");
		for (const hit of result.missingRefs) {
			lines.push(`  ${hit.file}: ${hit.ref}`);
			lines.push(`    ${hit.reason}`);
		}
	} else if (!result.missingGuide) {
		lines.push("OK: every @input/pen-* name and subpath resolves.");
	}

	if (result.exportHits.length > 0) {
		lines.push("");
		lines.push("FAIL export claims that do not match api-report.md:");
		for (const hit of result.exportHits) {
			lines.push(
				`  ${guideRel}:${hit.line}  ${hit.symbol}  ${hit.package}`,
			);
			lines.push(`    ${hit.reason}`);
		}
	} else if (result.claims.length >= MIN_EXPORT_CLAIMS) {
		lines.push("OK: export / not-exported claims match the API reports.");
	}

	if (!result.origin.ok) {
		lines.push("");
		lines.push(
			`FAIL OpOriginType union: ${result.origin.reason ?? "mismatch"}`,
		);
		if (result.origin.missing.length > 0) {
			lines.push(
				`  missing from guide: ${result.origin.missing.join(", ")}`,
			);
		}
		if (result.origin.extra.length > 0) {
			lines.push(`  extra in guide: ${result.origin.extra.join(", ")}`);
		}
	} else {
		lines.push("OK: listed origin-type union matches OpOriginType.");
	}

	if (!result.yjs.ok) {
		lines.push("");
		lines.push(`FAIL yjs peer: ${result.yjs.reason}`);
	} else {
		lines.push(`OK: yjs@${result.yjs.guide} matches the crdt-yjs peer.`);
	}

	if (result.pathHits.length > 0) {
		lines.push("");
		lines.push("FAIL repo paths named in the guide:");
		for (const hit of result.pathHits) {
			lines.push(`  ${guideRel}:${hit.line}  ${hit.path}`);
			lines.push(`    ${hit.reason}`);
		}
	} else {
		lines.push("OK: named repo paths exist (or stay deleted).");
	}

	if (result.fidelityHits.length > 0) {
		lines.push("");
		lines.push("FAIL exporter FIDELITY.md files:");
		for (const hit of result.fidelityHits) {
			lines.push(`  ${hit.path}`);
			lines.push(`    ${hit.reason}`);
		}
	}

	if (result.artifacts.length > 0) {
		lines.push("");
		lines.push("FAIL missing built type artifacts (run pnpm build):");
		for (const hit of result.artifacts) {
			lines.push(`  ${hit.package}  ${hit.path}`);
		}
	}

	lines.push("");
	lines.push(
		`samples checked ${result.typecheck.checked}  skipped ${result.typecheck.skipped.length}  errors ${result.typecheck.errors.length}`,
	);
	if (result.typecheck.errors.length > 0) {
		lines.push(
			`FAIL ${result.typecheck.errors.length} sample type error(s):`,
		);
		for (const error of result.typecheck.errors) {
			const loc =
				error.index > 0
					? `${error.file} sample ${error.index}:${error.line}`
					: `${error.file}:${error.line}`;
			lines.push(`  ${loc}`);
			lines.push(`    ${error.message}`);
		}
	} else if (result.typecheck.checked > 0) {
		lines.push("OK: every extracted sample type-checks.");
	} else {
		lines.push("OK: no fenced samples to type-check.");
	}

	return lines.join("\n");
}

const FIXTURE_CORE_SYMBOLS = new Set([
	"createEditor",
	"defineFacet",
	"createFacetRegistry",
	"getOpOriginType",
]);
const FIXTURE_TYPES_SYMBOLS = new Set([
	"CommitEvent",
	"DefineFacet",
	"generateId",
]);

function fixtureSymbols() {
	return new Map([
		["@input/pen-core", FIXTURE_CORE_SYMBOLS],
		["@input/pen-types", FIXTURE_TYPES_SYMBOLS],
		["@input/pen-crdt-yjs", new Set(["PenDocumentUnreadableError"])],
	]);
}

export function runSelfTests() {
	assert(
		extractBacktickIdents("`defineFacet` / `createFacetRegistry()`").join(
			",",
		) === "defineFacet,createFacetRegistry",
		"self-test: backtick idents strip trailing ()",
	);

	const healthy = extractExportClaims(
		"- **Landed.** `defineFacet` / `createFacetRegistry` are exported from `@input/pen-core`. `CommitEvent` is on the types barrel.\n",
	);
	assert(
		healthy.some(
			(claim) =>
				claim.polarity === "present" &&
				claim.packages.includes("@input/pen-core") &&
				claim.symbols.includes("defineFacet") &&
				claim.symbols.includes("createFacetRegistry"),
		),
		"self-test: exported-from claim",
	);
	assert(
		healthy.some(
			(claim) =>
				claim.polarity === "present" &&
				claim.packages.includes("@input/pen-types") &&
				claim.symbols.includes("CommitEvent"),
		),
		"self-test: types-barrel claim",
	);

	const leaked = extractExportClaims(
		"- `CommitEvent` exist in `@input/pen-types`.\n- announcer (`createAnnouncer`) exists in pen-dom. Not re-exported.\n",
	);
	assert(
		!leaked.some(
			(claim) =>
				claim.symbols.includes("createAnnouncer") &&
				claim.packages?.includes("@input/pen-types"),
		),
		"self-test: not-re-exported does not inherit a prior bullet's package",
	);

	const negative = extractExportClaims(
		"- `defineCommand` lives in `packages/core/src/commands/`. Not on the `@input/pen-core` index.\n",
	);
	assert(
		negative.some(
			(claim) =>
				claim.polarity === "absent" &&
				claim.packages.includes("@input/pen-core") &&
				claim.symbols.includes("defineCommand"),
		),
		"self-test: not-on-index carries prior symbols",
	);

	const deleted = extractExportClaims(
		"- `toZod` is deleted. Do not import `toZod`.\n",
	);
	assert(
		deleted.some(
			(claim) =>
				claim.polarity === "absent" &&
				claim.packages == null &&
				claim.symbols.includes("toZod"),
		),
		"self-test: deleted symbol is globally absent",
	);

	const fromPkg = extractExportClaims(
		"- **Fix:** add `undoExtension()` from `@input/pen-undo` to `extensions`.\n",
	);
	assert(
		fromPkg.some(
			(claim) =>
				claim.polarity === "present" &&
				claim.packages.includes("@input/pen-undo") &&
				claim.symbols.includes("undoExtension") &&
				!claim.symbols.includes("extensions"),
		),
		"self-test: foo() from package does not bind a later field name",
	);

	const pairedFrom = extractExportClaims(
		"`DefaultRenderer` from `@input/pen-react` and `PenBlock` from `@input/pen-vue`.\n",
	);
	assert(
		pairedFrom.some(
			(claim) =>
				claim.packages.includes("@input/pen-react") &&
				claim.symbols.join(",") === "DefaultRenderer",
		) &&
			pairedFrom.some(
				(claim) =>
					claim.packages.includes("@input/pen-vue") &&
					claim.symbols.join(",") === "PenBlock",
			),
		"self-test: paired from-package claims stay 1:1",
	);

	const clauseSplit = extractExportClaims(
		"`generateId` is the only ID source; HOST4 scenarios are in `@input/pen-conformance`.\n",
	);
	assert(
		!clauseSplit.some((claim) => claim.symbols.includes("generateId")),
		"self-test: semicolon keeps generateId off an unrelated package",
	);

	const symbolsByPackage = fixtureSymbols();
	const okHits = evaluateExportClaims({
		claims: extractExportClaims(
			"`getOpOriginType` exports from `@input/pen-core`. `generateId` still exports from `@input/pen-types`.\n",
		),
		symbolsByPackage,
	});
	assert(okHits.length === 0, "self-test: true export claims pass");

	const bogusSymbol = evaluateExportClaims({
		claims: extractExportClaims(
			"`collaborator` exports from `@input/pen-core`.\n",
		),
		symbolsByPackage,
	});
	assert(
		bogusSymbol.some((hit) => hit.symbol === "collaborator"),
		"self-test: bogus symbol claim fails",
	);

	const staleAbsent = evaluateExportClaims({
		claims: extractExportClaims(
			"`defineFacet` lives in `packages/core/src/facets/`. Not on the `@input/pen-core` index.\n",
		),
		symbolsByPackage,
	});
	assert(
		staleAbsent.some(
			(hit) => hit.symbol === "defineFacet" && hit.polarity === "absent",
		),
		"self-test: 'not on the index' fails when the symbol is public",
	);

	const hostHits = evaluateHostCalls({
		calls: extractHostCalls(
			"Fix: pass `notARealExport()` to createEditor.\n",
		),
		symbolsByPackage,
	});
	assert(
		hostHits.some((hit) => hit.symbol === "notARealExport"),
		"self-test: unknown Fix: identifier fails",
	);

	const origin = evaluateOriginUnion({
		guide: ["user", "ai"],
		actual: ["user", "ai", "collaborator"],
	});
	assert(
		!origin.ok && origin.missing.includes("collaborator"),
		"self-test: origin miss",
	);
	assert(
		evaluateOriginUnion({
			guide: ["user", "ai"],
			actual: ["user", "ai"],
		}).ok,
		"self-test: origin match",
	);
	assert(
		evaluateOriginUnion({ guide: null, actual: ["user"] }).ok === false,
		"self-test: missing origin union fails closed",
	);

	const yjs = evaluateYjsPeer({
		text: "Install `yjs@^13.6` next to `@input/pen-crdt-yjs`.",
		peerRange: "^13.6",
	});
	assert(yjs.ok, "self-test: matching yjs peer");
	assert(
		!evaluateYjsPeer({
			text: "Install `yjs@^14.0` next to `@input/pen-crdt-yjs`.",
			peerRange: "^13.6",
		}).ok,
		"self-test: drifted yjs peer fails",
	);
	assert(
		!evaluateYjsPeer({ text: "no version here", peerRange: "^13.6" }).ok,
		"self-test: missing yjs version fails closed",
	);

	assert(
		resolveGuidePath("spec/rules/api.md", "/repo").endsWith(
			"spec/rules/api.md",
		),
		"self-test: a repo-root-relative spec path resolves as written",
	);
	assert(
		resolveGuidePath("core/src/toZod.ts", "/repo").endsWith(
			"packages/core/src/toZod.ts",
		),
		"self-test: core/src resolves under packages",
	);

	const refs = extractPackageRefs(
		"use `@input/pen-does-not-exist` and `@input/pen-react/ai-suggestions`.",
	);
	assert(
		refs.some((ref) => ref.name === "@input/pen-does-not-exist"),
		"self-test: missing package is extracted",
	);
	assert(
		refs.some(
			(ref) =>
				ref.name === "@input/pen-react" &&
				ref.subpath === "/ai-suggestions",
		),
		"self-test: react export subpath",
	);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export async function loadReportSymbols(repoRoot) {
	const packages = await loadPublishedPackages(repoRoot);
	const byPackage = new Map();
	const missing = [];
	for (const pkg of packages) {
		const reportPath = path.join(pkg.dir, "api-report.md");
		let text;
		try {
			text = await fs.readFile(reportPath, "utf8");
		} catch (error) {
			if (error && error.code === "ENOENT") {
				missing.push(pkg.name);
				continue;
			}
			throw error;
		}
		const report = parseApiReport(text);
		byPackage.set(
			pkg.name,
			new Set(uniquePublicSymbols(report).map((entry) => entry.name)),
		);
	}
	return { byPackage, missing, packages };
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let guideRel = GUIDE_REL;
	let selfTestOnly = false;
	let skipTypecheck = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			selfTestOnly = true;
			continue;
		}
		if (arg === "--skip-typecheck") {
			skipTypecheck = true;
			continue;
		}
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--guide") {
			guideRel = argv[i + 1] ?? "";
			i += 1;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, guideRel, selfTestOnly, skipTypecheck };
}

export async function evaluateGuide({
	repoRoot,
	guideRel = GUIDE_REL,
	skipTypecheck = false,
}) {
	const guidePath = path.join(repoRoot, guideRel);
	let text = null;
	try {
		text = await fs.readFile(guidePath, "utf8");
	} catch (error) {
		if (error && error.code !== "ENOENT") {
			throw error;
		}
	}

	const { byPackage, missing: missingReportFiles } =
		await loadReportSymbols(repoRoot);
	const workspacePackages = await loadNamedPackages(repoRoot);

	if (text == null) {
		return {
			missingGuide: true,
			missingOriginSource: false,
			missingReports: missingReportFiles,
			missingRefs: [],
			claims: [],
			exportHits: [],
			pathHits: [],
			fidelityHits: [],
			origin: {
				ok: false,
				reason: `${guideRel} is missing`,
				missing: [],
				extra: [],
			},
			yjs: {
				ok: false,
				reason: `${guideRel} is missing`,
				guide: null,
				peer: null,
			},
			artifacts: [],
			typecheck: { errors: [], skipped: [], checked: 0 },
		};
	}

	const claims = extractExportClaims(text);
	const mentioned = new Set(extractPackageRefs(text).map((ref) => ref.name));
	const missingReports = missingReportFiles.filter((name) =>
		mentioned.has(name),
	);

	const refs = extractPackageRefs(text).map((ref) => ({
		...ref,
		file: guideRel,
	}));
	const missingRefs = evaluateRefs({ refs, packages: workspacePackages });

	let originSource = null;
	try {
		originSource = await fs.readFile(
			path.join(repoRoot, ORIGIN_SOURCE_REL),
			"utf8",
		);
	} catch (error) {
		if (error && error.code !== "ENOENT") {
			throw error;
		}
	}

	const yjsPkg = workspacePackages.find((pkg) => pkg.name === YJS_ADAPTER);
	const yjsPeer = yjsPkg?.manifest?.peerDependencies?.yjs ?? null;

	const exportHits = evaluateExportClaims({
		claims,
		symbolsByPackage: byPackage,
	});
	const origin = evaluateOriginUnion({
		guide: extractGuideOriginUnion(text),
		actual: originSource ? parseOpOriginTypes(originSource) : null,
	});
	const pathHits = evaluatePaths({
		claims: extractPathClaims(text),
		repoRoot,
	});
	const fidelityHits = evaluateFidelityFiles({ text, repoRoot });
	const yjs = evaluateYjsPeer({ text, peerRange: yjsPeer });

	const artifacts = skipTypecheck
		? []
		: await missingTypeArtifacts(workspacePackages, repoRoot);
	const samples = extractFencedSamples(text, guideRel);
	const typecheck = skipTypecheck
		? { errors: [], skipped: [], checked: 0 }
		: await typecheckSamples({
				samples,
				packages: workspacePackages,
				repoRoot,
			});

	return {
		missingGuide: false,
		missingOriginSource: originSource == null,
		missingReports,
		missingRefs,
		claims,
		exportHits,
		pathHits,
		fidelityHits,
		origin,
		yjs,
		artifacts,
		typecheck,
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	runSelfTests();
	console.log(
		"MIGRATION.md self-test ok (bogus symbol, stale not-on-index, missing package, origin miss, and yjs drift fail closed)",
	);
	if (args.selfTestOnly) {
		return;
	}

	const result = await evaluateGuide({
		repoRoot: args.repoRoot,
		guideRel: args.guideRel,
		skipTypecheck: args.skipTypecheck,
	});
	console.log("");
	console.log(formatReport(result, args.guideRel));
	if (hasFailures(result)) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	enclosingSymbol,
	posixFilename,
	propertyName,
	repoRelativeFilename,
} from "./lintPaths.js";

/**
 * SCH1 (`spec/rules/dom.md`): geometry reads stay inside a scheduled
 * measure. Allowlisted symbols are the GeometryReader and justified
 * pre-scheduler sites.
 */

const DEFAULT_ALLOWLIST_PATH = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../../scripts/unscheduled-measure-allowlist.json",
);

const MEASURE_NAMES = new Set([
	"getBoundingClientRect",
	"getClientRects",
	"elementFromPoint",
	"caretPositionFromPoint",
	"caretRangeFromPoint",
]);

function loadAllowlist(filePath) {
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8"));
		return Array.isArray(parsed.entries) ? parsed.entries : [];
	} catch {
		return [];
	}
}

const committedAllowlist = loadAllowlist(DEFAULT_ALLOWLIST_PATH);

export function missingAllowlistField(entry) {
	if (!entry || typeof entry !== "object") {
		return "file";
	}
	if (typeof entry.file !== "string" || entry.file.trim().length === 0) {
		return "file";
	}
	if (typeof entry.symbol !== "string" || entry.symbol.trim().length === 0) {
		return "symbol";
	}
	if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
		return "reason";
	}
	return null;
}

function isMemberProperty(node) {
	const parent = node.parent;
	return (
		parent &&
		(parent.type === "MemberExpression" ||
			parent.type === "OptionalMemberExpression") &&
		parent.property === node
	);
}

export const noUnscheduledMeasure = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban unscheduled DOM geometry reads outside a measure phase",
			specRule: "SCH1",
		},
		schema: [
			{
				type: "object",
				properties: { allowlist: { type: "array" } },
				additionalProperties: false,
			},
		],
		messages: {
			measure:
				"`{{kind}}` in `{{symbol}}` ({{file}}) is an unscheduled measure (SCH1). Move it onto GeometryReader / measureNow or add an allowlist entry that names why it cannot.",
			incompleteAllowlist:
				"SCH1 allowlist entry is missing `{{field}}`. Every entry must name file, symbol, and a reason.",
			unusedAllowlist:
				"SCH1 allowlist entry for `{{symbol}}` in {{file}} was not consumed. Remove it in the same change that deleted the last measure.",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		const relative = repoRelativeFilename(filename);
		const allowlist = context.options[0]?.allowlist ?? committedAllowlist;
		const slots = allowlist
			.filter((entry) => !missingAllowlistField(entry))
			.filter((entry) => posixFilename(entry.file) === relative)
			.map((entry) => ({ ...entry, used: false }));

		function consume(symbol) {
			const slot = slots.find((entry) => entry.symbol === symbol);
			if (!slot) {
				return false;
			}
			slot.used = true;
			return true;
		}

		function reportMeasure(node, kind) {
			const symbol = enclosingSymbol(node);
			if (consume(symbol)) {
				return;
			}
			context.report({
				node,
				messageId: "measure",
				data: { kind, symbol, file: relative },
			});
		}

		return {
			Program() {
				for (const entry of allowlist) {
					const field = missingAllowlistField(entry);
					if (!field) {
						continue;
					}
					if (
						typeof entry?.file === "string" &&
						posixFilename(entry.file) !== relative
					) {
						continue;
					}
					context.report({
						loc: { line: 1, column: 0 },
						messageId: "incompleteAllowlist",
						data: { field },
					});
				}
			},
			"Program:exit"() {
				for (const slot of slots) {
					if (!slot.used) {
						context.report({
							loc: { line: 1, column: 0 },
							messageId: "unusedAllowlist",
							data: { file: slot.file, symbol: slot.symbol },
						});
					}
				}
			},
			MemberExpression(node) {
				const kind = propertyName(node.property);
				if (MEASURE_NAMES.has(kind)) {
					reportMeasure(node, kind);
				}
			},
			Identifier(node) {
				if (
					MEASURE_NAMES.has(node.name) &&
					!isMemberProperty(node)
				) {
					reportMeasure(node, node.name);
				}
			},
		};
	},
};

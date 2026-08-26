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
 * SCALE2 (`spec/rules/scale.md`): JSON.stringify is not a change-detection
 * signature in core or rendering runtime. Wire-format / display / clone
 * sites live on the allowlist.
 */

const DEFAULT_ALLOWLIST_PATH = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../../scripts/json-stringify-allowlist.json",
);

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

function isJsonStringify(node) {
	if (
		node.type !== "MemberExpression" &&
		node.type !== "OptionalMemberExpression"
	) {
		return false;
	}
	if (propertyName(node.property) !== "stringify") {
		return false;
	}
	return node.object.type === "Identifier" && node.object.name === "JSON";
}

export const noJsonStringifySignatures = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban JSON.stringify as a change-detection signature in core and rendering runtime",
			specRule: "SCALE2",
		},
		schema: [
			{
				type: "object",
				properties: { allowlist: { type: "array" } },
				additionalProperties: false,
			},
		],
		messages: {
			stringify:
				"`JSON.stringify` in `{{symbol}}` ({{file}}) is banned as a change signature (SCALE2). Use summary identity / version counters, or allowlist a wire-format / display / clone site with a reason.",
			incompleteAllowlist:
				"SCALE2 allowlist entry is missing `{{field}}`. Every entry must name file, symbol, and a reason.",
			unusedAllowlist:
				"SCALE2 allowlist entry for `{{symbol}}` in {{file}} was not consumed. Remove it in the same change that deleted the last stringify.",
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
			CallExpression(node) {
				if (!isJsonStringify(node.callee)) {
					return;
				}
				const symbol = enclosingSymbol(node);
				if (consume(symbol)) {
					return;
				}
				context.report({
					node,
					messageId: "stringify",
					data: { symbol, file: relative },
				});
			},
		};
	},
};

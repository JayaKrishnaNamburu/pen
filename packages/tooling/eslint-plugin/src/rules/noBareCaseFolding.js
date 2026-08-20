const FOLD_METHODS = new Set(["toLowerCase", "toUpperCase"]);
const ALLOWED_OBJECTS = new Set(["key", "code", "platform"]);

function propertyName(node) {
	if (node.type === "Identifier") {
		return node.name;
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	return null;
}

function isAllowedObject(object) {
	if (object.type !== "MemberExpression") {
		return false;
	}
	const name = propertyName(object.property);
	return name != null && ALLOWED_OBJECTS.has(name);
}

/**
 * LOC5 (`spec-v2/16-localization.md`): matching paths fold with
 * `foldAndNormalize`, not `toLowerCase()`. Keyboard `event.key` / `event.code`
 * and `navigator.platform` folding stay allowed — those are identifiers, not
 * user copy.
 */
export const noBareCaseFolding = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban bare toLowerCase/toUpperCase in matching paths; use foldAndNormalize",
			specRule: "LOC5",
		},
		schema: [],
		messages: {
			bareFold:
				"`{{name}}()` is locale-unsafe for matching. Use `foldAndNormalize` (spec-v2 LOC5).",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				if (node.callee.type !== "MemberExpression") {
					return;
				}
				const name = propertyName(node.callee.property);
				if (!name || !FOLD_METHODS.has(name)) {
					return;
				}
				if (isAllowedObject(node.callee.object)) {
					return;
				}
				context.report({
					node,
					messageId: "bareFold",
					data: { name },
				});
			},
		};
	},
};

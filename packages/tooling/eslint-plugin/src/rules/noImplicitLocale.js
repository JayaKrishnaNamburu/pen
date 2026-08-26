const INTL_CTORS = new Set([
	"NumberFormat",
	"DateTimeFormat",
	"PluralRules",
	"Collator",
	"Segmenter",
	"RelativeTimeFormat",
	"ListFormat",
	"DisplayNames",
]);

function isUndefinedIdent(node) {
	return node.type === "Identifier" && node.name === "undefined";
}

function isIntlConstructor(node) {
	return (
		node.type === "MemberExpression" &&
		node.object.type === "Identifier" &&
		node.object.name === "Intl" &&
		node.property.type === "Identifier" &&
		INTL_CTORS.has(node.property.name)
	);
}

/**
 * LOC3 (`spec/rules/localization.md`): every `Intl.*` construction and every
 * `localeCompare` in library code takes an explicit locale. Passing `undefined`
 * and inheriting the environment is banned.
 */
export const noImplicitLocale = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require an explicit locale on Intl constructors and localeCompare",
			specRule: "LOC3",
		},
		schema: [],
		messages: {
			intl:
				"`Intl.{{name}}` must receive an explicit locale, not the environment default (LOC3).",
			localeCompare:
				"`localeCompare` must receive an explicit locale argument (LOC3).",
		},
	},
	create(context) {
		return {
			NewExpression(node) {
				if (!isIntlConstructor(node.callee)) {
					return;
				}
				const first = node.arguments[0];
				if (!first || isUndefinedIdent(first)) {
					context.report({
						node,
						messageId: "intl",
						data: { name: node.callee.property.name },
					});
				}
			},
			CallExpression(node) {
				if (
					node.callee.type !== "MemberExpression" ||
					node.callee.property.type !== "Identifier" ||
					node.callee.property.name !== "localeCompare"
				) {
					return;
				}
				if (node.arguments.length < 2) {
					context.report({ node, messageId: "localeCompare" });
				}
			},
		};
	},
};

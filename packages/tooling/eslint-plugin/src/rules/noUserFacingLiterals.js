const COPY_ATTRIBUTES = new Set([
	"aria-label",
	"aria-description",
	"title",
	"placeholder",
]);

const ANNOUNCE_CALLEES = new Set([
	"announce",
	"announcePolite",
	"announceAssertive",
]);

const MESSAGE_KEY = /^pen\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+$/;
const NON_COPY = /^[\s\d.,:;!?/\\|+\-*=<>#@&%$'"`~^()[\]{}]+$/u;

function literalText(node) {
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	if (node.type === "JSXText") {
		return node.value;
	}
	if (
		node.type === "TemplateLiteral" &&
		node.expressions.length === 0 &&
		node.quasis.length === 1
	) {
		return node.quasis[0]?.value.cooked ?? "";
	}
	return null;
}

function isUserCopy(text) {
	const trimmed = text.replace(/\s+/g, " ").trim();
	if (trimmed.length === 0) {
		return false;
	}
	if (MESSAGE_KEY.test(trimmed)) {
		return false;
	}
	if (NON_COPY.test(trimmed)) {
		return false;
	}
	return /[A-Za-z\u00C0-\u024F]/.test(trimmed);
}

function jsxName(node) {
	if (node.type === "JSXIdentifier") {
		return node.name;
	}
	return null;
}

function calleeName(node) {
	if (node.type === "Identifier") {
		return node.name;
	}
	if (node.type === "MemberExpression" && node.property.type === "Identifier") {
		return node.property.name;
	}
	return null;
}

/**
 * LOC1 (`spec-v2/16-localization.md`): library-rendered copy comes from the
 * catalog. A string literal in JSX text, chrome attributes, or announcement
 * calls is a bug the lint catches.
 */
export const noUserFacingLiterals = {
	meta: {
		type: "problem",
		docs: {
			description: "Ban user-facing string literals; resolve copy from the catalog",
			specRule: "LOC1",
		},
		schema: [],
		messages: {
			jsxText:
				"User-facing text must come from the message catalog (spec-v2 LOC1).",
			attribute:
				"`{{name}}` copy must come from the message catalog (spec-v2 LOC1).",
			announce:
				"Announcement text must come from the message catalog (spec-v2 LOC1).",
		},
	},
	create(context) {
		return {
			JSXText(node) {
				if (isUserCopy(node.value)) {
					context.report({ node, messageId: "jsxText" });
				}
			},
			JSXAttribute(node) {
				const name = jsxName(node.name);
				if (!name || !COPY_ATTRIBUTES.has(name) || !node.value) {
					return;
				}
				const value =
					node.value.type === "JSXExpressionContainer"
						? node.value.expression
						: node.value;
				const text = literalText(value);
				if (text != null && isUserCopy(text)) {
					context.report({
						node: node.value,
						messageId: "attribute",
						data: { name },
					});
				}
			},
			Property(node) {
				const name =
					node.key.type === "Identifier"
						? node.key.name
						: node.key.type === "Literal" && typeof node.key.value === "string"
							? node.key.value
							: null;
				if (!name || !COPY_ATTRIBUTES.has(name)) {
					return;
				}
				const text = literalText(node.value);
				if (text != null && isUserCopy(text)) {
					context.report({
						node: node.value,
						messageId: "attribute",
						data: { name },
					});
				}
			},
			CallExpression(node) {
				const name = calleeName(node.callee);
				if (!name || !ANNOUNCE_CALLEES.has(name)) {
					return;
				}
				const first = node.arguments[0];
				if (!first) {
					return;
				}
				const text = literalText(first);
				if (text != null && isUserCopy(text)) {
					context.report({ node: first, messageId: "announce" });
				}
			},
		};
	},
};

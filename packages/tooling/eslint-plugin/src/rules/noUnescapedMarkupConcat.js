const ESCAPE_CALLEES = new Set([
	"escapeHtml",
	"escapeMarkup",
	"escapeMarkupAttribute",
	"escapeMarkupText",
	"encodePenBlocksForHtml",
	"encodeURIComponent",
	"serializeAttributes",
	"serializeCloseTag",
	"serializeElement",
	"serializeMarkupCloseTag",
	"serializeMarkupElement",
	"serializeMarkupOpenTag",
	"serializeMarkupText",
	"serializeOpenTag",
	"serializeVoidElement",
	"renderListItemInnerHTML",
]);

const JUSTIFIED_IDENTIFIERS = new Set([
	"htmlContent",
	"innerSerialized",
	"tag",
	"text",
]);

const SANCTIONED = /SEC5|already-serialized|clamped|justified/i;

function calleeName(node) {
	if (node.type === "Identifier") {
		return node.name;
	}
	if (node.type === "MemberExpression" && node.property.type === "Identifier") {
		return node.property.name;
	}
	return null;
}

function cookedQuasis(node) {
	return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? "").join("");
}

function isMarkupTemplate(node) {
	if (node.type !== "TemplateLiteral") {
		return false;
	}
	const cooked = cookedQuasis(node);
	if (/<\/?[A-Za-z!]/.test(cooked) || /=\s*["']/.test(cooked) || /[<>]/.test(cooked)) {
		return true;
	}
	return node.quasis.some((quasi) => /^<\/?$/.test((quasi.value.cooked ?? quasi.value.raw ?? "").trim()));
}

function isSanctioned(sourceCode, node) {
	const comments = [
		...sourceCode.getCommentsBefore(node),
		...sourceCode.getCommentsInside(node),
		...sourceCode.getCommentsAfter(node),
	];
	if (comments.some((comment) => SANCTIONED.test(comment.value))) {
		return true;
	}
	const lines = sourceCode.getText().split(/\r?\n/);
	const line = node.loc?.start.line;
	if (!line) {
		return false;
	}
	const nearby = [lines[line - 2] ?? "", lines[line - 1] ?? ""].join("\n");
	return SANCTIONED.test(nearby);
}

function isObjectEntriesLoopKey(node, context) {
	if (node.type !== "Identifier") {
		return false;
	}
	for (const ancestor of context.sourceCode.getAncestors(node).toReversed()) {
		if (ancestor.type === "ForOfStatement") {
			return isEntriesBinding(ancestor, node.name);
		}
		if (
			ancestor.type === "FunctionDeclaration" ||
			ancestor.type === "FunctionExpression" ||
			ancestor.type === "ArrowFunctionExpression"
		) {
			break;
		}
	}
	return false;
}

function isEntriesBinding(forOf, name) {
	const { left, right } = forOf;
	if (right.type !== "CallExpression") {
		return false;
	}
	const callee = right.callee;
	if (
		callee.type !== "MemberExpression" ||
		callee.object.type !== "Identifier" ||
		callee.object.name !== "Object" ||
		callee.property.type !== "Identifier" ||
		callee.property.name !== "entries"
	) {
		return false;
	}
	const pattern = left.type === "VariableDeclaration" ? left.declarations[0]?.id : left;
	if (pattern?.type !== "ArrayPattern") {
		return false;
	}
	const first = pattern.elements[0];
	return first?.type === "Identifier" && first.name === name;
}

function isSafeExpression(node, context, seen) {
	if (!node) {
		return true;
	}
	if (isSanctioned(context.sourceCode, node)) {
		return true;
	}
	switch (node.type) {
		case "Literal":
			return true;
		case "Identifier":
			if (JUSTIFIED_IDENTIFIERS.has(node.name)) {
				return true;
			}
			if (isObjectEntriesLoopKey(node, context)) {
				return true;
			}
			return isSafeBinding(node, context, seen);
		case "MemberExpression":
			return (
				!node.computed &&
				node.property.type === "Identifier" &&
				node.property.name === "content"
			);
		case "CallExpression":
			if (ESCAPE_CALLEES.has(calleeName(node.callee))) {
				return true;
			}
			if (isJoinedMappedMarkup(node, context, seen)) {
				return true;
			}
			if (
				node.callee.type === "MemberExpression" &&
				node.callee.property.type === "Identifier" &&
				node.callee.property.name === "slice"
			) {
				return isSafeExpression(node.callee.object, context, seen);
			}
			return false;
		case "LogicalExpression":
		case "BinaryExpression":
			return (
				isSafeExpression(node.left, context, seen) &&
				isSafeExpression(node.right, context, seen)
			);
		case "ConditionalExpression":
			return (
				isSafeExpression(node.consequent, context, seen) &&
				isSafeExpression(node.alternate, context, seen)
			);
		case "UnaryExpression":
		case "SpreadElement":
			return isSafeExpression(node.argument, context, seen);
		case "ChainExpression":
			return isSafeExpression(node.expression, context, seen);
		case "TSNonNullExpression":
		case "TSAsExpression":
		case "TSSatisfiesExpression":
		case "TSTypeAssertion":
			return isSafeExpression(node.expression, context, seen);
		case "TemplateLiteral":
			return node.expressions.every((expression) =>
				isSafeExpression(expression, context, seen),
			);
		default:
			return false;
	}
}

function mappedCallbackBody(fn) {
	if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") {
		return null;
	}
	if (fn.body.type !== "BlockStatement") {
		return fn.body;
	}
	const returned = fn.body.body.find((statement) => statement.type === "ReturnStatement");
	return returned?.argument ?? null;
}

function isJoinedMappedMarkup(node, context, seen) {
	if (calleeName(node.callee) !== "join" || node.callee.type !== "MemberExpression") {
		return false;
	}
	const mapped = node.callee.object;
	if (mapped.type !== "CallExpression" || calleeName(mapped.callee) !== "map") {
		return false;
	}
	const body = mappedCallbackBody(mapped.arguments[0]);
	return body !== null && isSafeExpression(body, context, seen);
}

function isSafeBinding(id, context, seen) {
	if (seen.has(id.name)) {
		return false;
	}
	seen.add(id.name);
	let current = context.sourceCode.getScope(id);
	while (current) {
		const variable = current.set.get(id.name);
		if (variable) {
			if (variable.defs.length === 0) {
				return false;
			}
			return variable.defs.every((def) => {
				if (def.type === "Variable" && def.node.init) {
					return isSafeExpression(def.node.init, context, seen);
				}
				return false;
			});
		}
		current = current.upper;
	}
	return false;
}

/**
 * SEC5 (`spec/rules/security.md`): exporters and schema `toHTML` serializers
 * must not concatenate unescaped document content into markup. Interpolations
 * go through an escaping helper, are already-serialized inner HTML, or are
 * named in an adjacent SEC5 comment (clamped enums, encoded payloads).
 */
export const noUnescapedMarkupConcat = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban unescaped document content concatenated into markup templates",
			specRule: "SEC5",
		},
		schema: [],
		messages: {
			unescaped:
				"Unescaped value interpolated into markup. Escape it, use already-serialized content, or name SEC5 in a comment (SEC5).",
		},
	},
	create(context) {
		return {
			TemplateLiteral(node) {
				if (!isMarkupTemplate(node)) {
					return;
				}
				if (isSanctioned(context.sourceCode, node)) {
					return;
				}
				for (const expression of node.expressions) {
					if (!isSafeExpression(expression, context, new Set())) {
						context.report({ node: expression, messageId: "unescaped" });
					}
				}
			},
		};
	},
};

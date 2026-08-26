const FOLD_METHODS = new Set(["toLowerCase", "toUpperCase"]);
const IDENTIFIER_PROPERTIES = new Set([
	"key",
	"code",
	"platform",
	"protocol",
	"pathname",
	"hostname",
	"host",
	"tagName",
	"nodeName",
]);
const STRING_TRANSFORMS = new Set([
	"trim",
	"trimStart",
	"trimEnd",
	"slice",
	"substring",
	"substr",
	"replace",
	"replaceAll",
	"normalize",
]);
const TOKEN_SPLITTERS = new Set(["-", "+"]);
const EQUALITY = new Set(["===", "!==", "==", "!="]);
const FOLDED_MEMBERSHIP = new Set([
	"includes",
	"startsWith",
	"endsWith",
	"indexOf",
]);
const WRAPPERS = new Set([
	"ParenthesizedExpression",
	"ChainExpression",
	"TSAsExpression",
	"TSTypeAssertion",
	"TSNonNullExpression",
]);

function propertyName(node) {
	if (node.type === "Identifier") {
		return node.name;
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	return null;
}

function unwrap(node) {
	let current = node;
	while (current && WRAPPERS.has(current.type) && current.expression) {
		current = current.expression;
	}
	return current;
}

function skipToParent(node) {
	let current = node;
	let parent = node.parent;
	while (parent && WRAPPERS.has(parent.type)) {
		current = parent;
		parent = parent.parent;
	}
	return { node: current, parent };
}

function isStringLiteral(node) {
	const value = unwrap(node);
	return value?.type === "Literal" && typeof value.value === "string";
}

function isRegexLiteral(node) {
	const value = unwrap(node);
	return value?.type === "Literal" && value.regex != null;
}

function isMethodCall(node, name) {
	const call = unwrap(node);
	if (
		call?.type !== "CallExpression" ||
		call.callee.type !== "MemberExpression"
	) {
		return false;
	}
	return propertyName(call.callee.property) === name;
}

function calleeMethodName(call) {
	if (
		call?.type !== "CallExpression" ||
		call.callee.type !== "MemberExpression"
	) {
		return null;
	}
	return propertyName(call.callee.property);
}

function containsNode(outer, inner) {
	let current = outer;
	while (current) {
		if (current === inner) {
			return true;
		}
		if (WRAPPERS.has(current.type) && current.expression) {
			current = current.expression;
			continue;
		}
		return false;
	}
	return false;
}

function resolveBindingInit(context, id) {
	if (id?.type !== "Identifier") {
		return null;
	}
	const seen = new Set();
	let current = context.sourceCode.getScope(id);
	while (current) {
		const variable = current.set.get(id.name);
		if (variable) {
			if (variable.defs.length !== 1) {
				return null;
			}
			const def = variable.defs[0];
			if (def.type !== "Variable" || !def.node.init) {
				return null;
			}
			if (seen.has(id.name)) {
				return null;
			}
			return def.node.init;
		}
		current = current.upper;
	}
	return null;
}

function referencesOf(context, id) {
	let current = context.sourceCode.getScope(id);
	while (current) {
		const variable = current.set.get(id.name);
		if (variable) {
			return variable.references
				.map((ref) => ref.identifier)
				.filter((ident) => ident !== id);
		}
		current = current.upper;
	}
	return [];
}

function enclosingFunction(node) {
	let current = node.parent;
	while (current) {
		if (
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression" ||
			current.type === "ArrowFunctionExpression"
		) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function paramNames(fn) {
	return fn.params.flatMap((param) =>
		param.type === "Identifier" ? [param.name] : [],
	);
}

function unwrapStringTransforms(node) {
	let current = unwrap(node);
	while (current?.type === "CallExpression") {
		const name = calleeMethodName(current);
		if (!name || !STRING_TRANSFORMS.has(name)) {
			break;
		}
		current = unwrap(current.callee.object);
	}
	return current;
}

function unwrapLogicalFallback(node) {
	let current = unwrap(node);
	while (
		current?.type === "LogicalExpression" &&
		(current.operator === "??" || current.operator === "||") &&
		isStringLiteral(current.right)
	) {
		current = unwrap(current.left);
	}
	return current;
}

function isIdentifierPropertySource(context, foldCall) {
	let current = unwrapStringTransforms(foldCall.callee.object);
	const seen = new Set();
	while (current?.type === "Identifier") {
		if (seen.has(current.name)) {
			break;
		}
		seen.add(current.name);
		const init = resolveBindingInit(context, current);
		if (!init) {
			break;
		}
		current = unwrapStringTransforms(init);
	}
	if (current?.type === "MemberExpression") {
		const name = propertyName(current.property);
		return name != null && IDENTIFIER_PROPERTIES.has(name);
	}
	return isStringLiteral(current);
}

function isTokenSplit(node) {
	if (!isMethodCall(node, "split")) {
		return false;
	}
	const arg = unwrap(node.arguments[0]);
	return arg?.type === "Literal" && TOKEN_SPLITTERS.has(arg.value);
}

function isTokenSplitMap(node) {
	return (
		isMethodCall(node, "map") && isTokenSplit(unwrap(node.callee.object))
	);
}

function isTokenSplitFold(context, foldCall) {
	const object = unwrap(foldCall.callee.object);
	if (object?.type === "Identifier") {
		const fn = enclosingFunction(foldCall);
		if (fn && paramNames(fn)[0] === object.name) {
			const mapCall = skipToParent(fn).parent;
			if (
				isMethodCall(mapCall, "map") &&
				isTokenSplit(unwrap(mapCall.callee.object))
			) {
				return true;
			}
		}
	}
	if (!isMethodCall(object, "pop") && !isMethodCall(object, "shift")) {
		return false;
	}
	let array = unwrap(object.callee.object);
	if (array?.type === "Identifier") {
		const init = resolveBindingInit(context, array);
		if (init) {
			array = unwrap(init);
		}
	}
	return isTokenSplit(array) || isTokenSplitMap(array);
}

function regexFromMatchCall(context, node) {
	const call = unwrap(node);
	if (call?.type !== "CallExpression") {
		return null;
	}
	if (isMethodCall(call, "match")) {
		return regexLiteral(context, call.arguments[0]);
	}
	if (isMethodCall(call, "exec")) {
		return regexLiteral(context, call.callee.object);
	}
	return null;
}

function regexLiteral(context, node) {
	const value = unwrap(node);
	if (isRegexLiteral(value)) {
		return value;
	}
	if (value?.type === "Identifier") {
		return regexLiteral(context, resolveBindingInit(context, value));
	}
	return null;
}

function isRegexCaptureFold(context, foldCall) {
	const object = unwrapLogicalFallback(foldCall.callee.object);
	if (object?.type !== "MemberExpression" || !object.computed) {
		return false;
	}
	const index = unwrap(object.property);
	if (index?.type !== "Literal" || typeof index.value !== "number") {
		return false;
	}
	const matchObj = unwrap(object.object);
	if (matchObj?.type !== "Identifier") {
		return false;
	}
	return (
		regexFromMatchCall(context, resolveBindingInit(context, matchObj)) !=
		null
	);
}

function isReplaceCallback(fn) {
	const { parent } = skipToParent(fn);
	if (parent?.type !== "CallExpression" || parent.arguments[1] !== fn) {
		return false;
	}
	const name = calleeMethodName(parent);
	return name === "replace" || name === "replaceAll";
}

function isDisplayCasing(foldCall) {
	const object = unwrap(foldCall.callee.object);
	if (isMethodCall(object, "charAt")) {
		return true;
	}
	if (object?.type === "Identifier") {
		const fn = enclosingFunction(foldCall);
		if (
			fn &&
			paramNames(fn).includes(object.name) &&
			isReplaceCallback(fn)
		) {
			return true;
		}
	}
	return false;
}

function isStringLiteralArray(node) {
	const value = unwrap(node);
	return (
		value?.type === "ArrayExpression" &&
		value.elements.length > 0 &&
		value.elements.every((element) => isStringLiteral(element))
	);
}

function isClosedVocabularyCall(call, argNode) {
	if (!call.arguments.some((arg) => containsNode(arg, argNode))) {
		return false;
	}
	const name = calleeMethodName(call);
	if (name === "test" && isRegexLiteral(call.callee.object)) {
		return true;
	}
	if (
		(name === "includes" || name === "has" || name === "indexOf") &&
		isStringLiteralArray(call.callee.object)
	) {
		return true;
	}
	return false;
}

function isIdentifierUse(node) {
	const { node: inner, parent } = skipToParent(node);
	if (!parent) {
		return false;
	}
	if (parent.type === "BinaryExpression" && EQUALITY.has(parent.operator)) {
		const other = containsNode(parent.left, inner)
			? parent.right
			: parent.left;
		return isStringLiteral(other);
	}
	if (
		parent.type === "MemberExpression" &&
		parent.computed &&
		containsNode(parent.property, inner)
	) {
		return true;
	}
	if (parent.type === "CallExpression") {
		return isClosedVocabularyCall(parent, inner);
	}
	if (
		parent.type === "MemberExpression" &&
		!parent.computed &&
		containsNode(parent.object, inner)
	) {
		const call = skipToParent(parent).parent;
		const name = propertyName(parent.property);
		if (
			call?.type === "CallExpression" &&
			call.callee === parent &&
			name != null &&
			FOLDED_MEMBERSHIP.has(name) &&
			call.arguments.length > 0
		) {
			return isStringLiteral(call.arguments[0]);
		}
	}
	return false;
}

function useNodes(context, foldCall) {
	const { parent } = skipToParent(foldCall);
	if (
		parent?.type === "VariableDeclarator" &&
		parent.id.type === "Identifier" &&
		containsNode(parent.init, foldCall)
	) {
		return referencesOf(context, parent.id);
	}
	return [foldCall];
}

function isIdentifierOrDisplayFold(context, foldCall) {
	if (isDisplayCasing(foldCall)) {
		return true;
	}
	if (isIdentifierPropertySource(context, foldCall)) {
		return true;
	}
	if (isTokenSplitFold(context, foldCall)) {
		return true;
	}
	if (isRegexCaptureFold(context, foldCall)) {
		return true;
	}
	return useNodes(context, foldCall).some((node) => isIdentifierUse(node));
}

/**
 * LOC5 (`spec/rules/localization.md`): matching paths fold with
 * `foldAndNormalize`, not `toLowerCase()`. Identifier folds (MIME types,
 * attribute names, shortcut patterns, markdown keys, regex-captured tokens)
 * and single-character display casing stay allowed — those are not user-copy
 * matching.
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
				"`{{name}}()` is locale-unsafe for matching. Use `foldAndNormalize` (LOC5).",
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
				if (isIdentifierOrDisplayFold(context, node)) {
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

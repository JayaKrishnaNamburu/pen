/**
 * Hardening (`spec/rules/api.md`): delete the v1
 * `Extension` fields `keyBindings`, `inputRules`, and `decorations`. Facet
 * providers are the only contribution channel after that deletion. This rule
 * flags those fields when they are declared on an extension object.
 *
 * An object is an extension object when it is an argument to `defineExtension`,
 * or when it is returned / assigned / asserted with an `Extension` type.
 * Block-schema `keyBindings` (`defineBlock`), property reads, local bindings
 * of the same name, and facet-provider call sites are out of scope.
 */

const V1_FIELDS = new Map([
	["keyBindings", "keymapFacet"],
	["inputRules", "inputRulesFacet"],
	["decorations", "decorationsFacet"],
]);

const EXTENSION_TYPE_NAMES = new Set(["Extension", "DefineExtensionConfig"]);
const TYPE_WRAPPERS = new Set([
	"Partial",
	"Readonly",
	"Required",
	"Pick",
	"Omit",
]);
const SCHEMA_FACTORIES = new Set(["defineBlock", "defineInline"]);
const WRAPPERS = new Set([
	"ParenthesizedExpression",
	"ChainExpression",
	"TSAsExpression",
	"TSTypeAssertion",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
]);
const FUNCTION_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
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

function calleeName(node) {
	if (node.type === "Identifier") {
		return node.name;
	}
	if (
		node.type === "MemberExpression" ||
		node.type === "OptionalMemberExpression"
	) {
		return propertyName(node.property);
	}
	return null;
}

function skipWrappers(node) {
	let current = node;
	let parent = node.parent;
	while (
		parent &&
		WRAPPERS.has(parent.type) &&
		parent.expression === current
	) {
		current = parent;
		parent = parent.parent;
	}
	return { node: current, parent };
}

function tsTypeName(node) {
	if (!node) {
		return null;
	}
	if (node.type === "Identifier") {
		return node.name;
	}
	if (node.type === "TSQualifiedName") {
		return tsTypeName(node.right);
	}
	return null;
}

function typeArguments(node) {
	return node.typeArguments ?? node.typeParameters ?? null;
}

function isExtensionType(typeNode) {
	if (!typeNode) {
		return false;
	}
	if (typeNode.type === "TSTypeAnnotation") {
		return isExtensionType(typeNode.typeAnnotation);
	}
	if (typeNode.type === "TSTypeReference") {
		const name = tsTypeName(typeNode.typeName);
		if (name != null && EXTENSION_TYPE_NAMES.has(name)) {
			return true;
		}
		const args = typeArguments(typeNode);
		if (name != null && TYPE_WRAPPERS.has(name) && args?.params?.[0]) {
			return isExtensionType(args.params[0]);
		}
		return false;
	}
	if (typeNode.type === "TSImportType") {
		const name = tsTypeName(typeNode.qualifier);
		if (name != null && EXTENSION_TYPE_NAMES.has(name)) {
			return true;
		}
		const args = typeArguments(typeNode);
		if (name != null && TYPE_WRAPPERS.has(name) && args?.params?.[0]) {
			return isExtensionType(args.params[0]);
		}
		return false;
	}
	if (typeNode.type === "TSUnionType") {
		return typeNode.types.some((member) => isExtensionType(member));
	}
	return false;
}

function wrapperAssertsExtension(node) {
	let current = node;
	let parent = node.parent;
	while (
		parent &&
		WRAPPERS.has(parent.type) &&
		parent.expression === current
	) {
		if (
			(parent.type === "TSAsExpression" ||
				parent.type === "TSTypeAssertion" ||
				parent.type === "TSSatisfiesExpression") &&
			isExtensionType(parent.typeAnnotation)
		) {
			return true;
		}
		current = parent;
		parent = parent.parent;
	}
	return false;
}

function enclosingFunction(node) {
	let current = node.parent;
	while (current) {
		if (FUNCTION_TYPES.has(current.type)) {
			return current;
		}
		current = current.parent;
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

function isCallNamed(node, name) {
	return node?.type === "CallExpression" && calleeName(node.callee) === name;
}

function isArgumentOf(call, node) {
	return call?.type === "CallExpression" && call.arguments.includes(node);
}

function isSchemaFactoryCall(node) {
	if (node?.type !== "CallExpression") {
		return false;
	}
	const name = calleeName(node.callee);
	return name != null && SCHEMA_FACTORIES.has(name);
}

function identifierPassedToDefineExtension(context, id) {
	for (const ref of referencesOf(context, id)) {
		const { node, parent } = skipWrappers(ref);
		if (
			isCallNamed(parent, "defineExtension") &&
			isArgumentOf(parent, node)
		) {
			return true;
		}
	}
	return false;
}

function isExtensionObject(context, object) {
	if (wrapperAssertsExtension(object)) {
		return true;
	}

	const { node, parent } = skipWrappers(object);

	if (isCallNamed(parent, "defineExtension") && isArgumentOf(parent, node)) {
		return true;
	}
	if (isSchemaFactoryCall(parent) && isArgumentOf(parent, node)) {
		return false;
	}

	if (parent?.type === "ReturnStatement" && parent.argument === node) {
		const fn = enclosingFunction(parent);
		return Boolean(fn && isExtensionType(fn.returnType));
	}

	if (parent?.type === "VariableDeclarator" && parent.init === node) {
		if (
			parent.id.type === "Identifier" &&
			isExtensionType(parent.id.typeAnnotation)
		) {
			return true;
		}
		if (
			parent.id.type === "Identifier" &&
			identifierPassedToDefineExtension(context, parent.id)
		) {
			return true;
		}
	}

	return false;
}

export const noV1ExtensionFields = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban v1 Extension keyBindings/inputRules/decorations; use facet providers",
			specRule: "Wave 7.1",
		},
		schema: [],
		messages: {
			v1Field:
				"`Extension.{{field}}` is a v1 field. Provide it through `{{facet}}` instead (the v1-field hardening).",
		},
	},
	create(context) {
		return {
			Property(node) {
				if (node.parent?.type !== "ObjectExpression") {
					return;
				}
				if (node.kind !== "init") {
					return;
				}
				if (node.computed && node.key.type !== "Literal") {
					return;
				}
				const field = propertyName(node.key);
				if (!field || !V1_FIELDS.has(field)) {
					return;
				}
				if (!isExtensionObject(context, node.parent)) {
					return;
				}
				context.report({
					node: node.key,
					messageId: "v1Field",
					data: { field, facet: V1_FIELDS.get(field) },
				});
			},
		};
	},
};

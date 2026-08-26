/**
 * HOST2 (`spec/rules/host.md`): published modules must load in a
 * plain Node process (RSC, SSR, headless). A module-scope read of a browser
 * global — `const isMac = navigator.platform` — throws there, or worse, binds
 * a value that is wrong for the eventual client. Function bodies, effects, and
 * instance field initializers run later and are allowed; that distinction is
 * the whole rule.
 */
const BANNED = new Set([
	"window",
	"document",
	"navigator",
	"matchMedia",
	"localStorage",
	"getComputedStyle",
	"requestAnimationFrame",
]);

const FUNCTION_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
]);

const TYPE_POSITION_TYPES = new Set([
	"TSTypeAnnotation",
	"TSTypeReference",
	"TSTypeQuery",
	"TSTypeParameter",
	"TSTypeParameterInstantiation",
	"TSTypeAliasDeclaration",
	"TSInterfaceDeclaration",
	"TSInterfaceHeritage",
	"TSClassImplements",
	"TSImportType",
	"TSTypeLiteral",
	"TSIndexedAccessType",
	"TSAsExpression",
	"TSTypeAssertion",
	"TSSatisfiesExpression",
	"TSModuleDeclaration",
]);

function isTypePosition(node) {
	let current = node;
	while (current.parent) {
		const parent = current.parent;
		if (TYPE_POSITION_TYPES.has(parent.type)) {
			if (
				(parent.type === "TSAsExpression" ||
					parent.type === "TSTypeAssertion" ||
					parent.type === "TSSatisfiesExpression") &&
				parent.typeAnnotation !== current
			) {
				current = parent;
				continue;
			}
			return true;
		}
		if (parent.type === "Program" || FUNCTION_TYPES.has(parent.type)) {
			return false;
		}
		current = parent;
	}
	return false;
}

function isFunctionOrInstanceField(node) {
	let current = node.parent;
	while (current) {
		if (FUNCTION_TYPES.has(current.type)) {
			return true;
		}
		if (current.type === "MethodDefinition") {
			return true;
		}
		if (current.type === "PropertyDefinition" && !current.static) {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function isGlobalObject(node) {
	return (
		node.type === "Identifier" &&
		(node.name === "globalThis" || node.name === "global")
	);
}

function isBannedMember(node) {
	if (
		(node.type !== "MemberExpression" &&
			node.type !== "OptionalMemberExpression") ||
		node.computed ||
		node.property.type !== "Identifier" ||
		!BANNED.has(node.property.name)
	) {
		return false;
	}
	return isGlobalObject(node.object);
}

function isBannedIdentifier(node) {
	if (node.type !== "Identifier" || !BANNED.has(node.name)) {
		return false;
	}
	const parent = node.parent;
	if (!parent) {
		return true;
	}
	if (
		(parent.type === "MemberExpression" ||
			parent.type === "OptionalMemberExpression") &&
		parent.property === node &&
		!parent.computed
	) {
		return false;
	}
	if (
		(parent.type === "Property" ||
			parent.type === "PropertyDefinition" ||
			parent.type === "MethodDefinition") &&
		parent.key === node &&
		!parent.computed
	) {
		return false;
	}
	return true;
}

export const noModuleScopeBrowserGlobals = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban module-scope browser globals; access them inside functions",
			specRule: "HOST2",
		},
		schema: [],
		messages: {
			moduleScope:
				"Do not read `{{name}}` at module scope. Published modules must import in Node without DOM globals (HOST2). Move the access into a function, effect, or lazy accessor.",
		},
	},
	create(context) {
		function report(node, name) {
			if (isTypePosition(node) || isFunctionOrInstanceField(node)) {
				return;
			}
			context.report({ node, messageId: "moduleScope", data: { name } });
		}

		return {
			Identifier(node) {
				if (isBannedIdentifier(node)) {
					report(node, node.name);
				}
			},
			MemberExpression(node) {
				if (isBannedMember(node)) {
					report(node, node.property.name);
				}
			},
			OptionalMemberExpression(node) {
				if (isBannedMember(node)) {
					report(node, node.property.name);
				}
			},
		};
	},
};

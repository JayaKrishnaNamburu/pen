import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * HOST4 (`spec-v2/15-host-integration.md`): web APIs newer than the HOST3
 * floor are used behind a feature test with a documented degraded path.
 * This rule flags a bare use. Feature tests (`typeof x === "function"`,
 * `"EditContext" in globalThis`, `globalThis.structuredClone?.`) stay quiet.
 * An allowlist entry without fallback or degradation is itself a lint error.
 */

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../..",
);
const DEFAULT_ALLOWLIST_PATH = path.join(
	REPO_ROOT,
	"scripts/above-floor-api-allowlist.json",
);

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

const FUNCTION_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
]);

const BACKGROUND_KEYS = new Set([
	"background",
	"backgroundColor",
	"background-color",
]);

function loadAllowlist(filePath) {
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8"));
		return Array.isArray(parsed.apis) ? parsed.apis : [];
	} catch {
		return [];
	}
}

const committedAllowlist = loadAllowlist(DEFAULT_ALLOWLIST_PATH);

export function missingAllowlistField(entry) {
	if (!entry || typeof entry !== "object") {
		return "api";
	}
	if (typeof entry.api !== "string" || entry.api.trim().length === 0) {
		return "api";
	}
	if (typeof entry.fallback !== "string" || entry.fallback.trim().length === 0) {
		return "fallback";
	}
	if (
		typeof entry.degradation !== "string" ||
		entry.degradation.trim().length === 0
	) {
		return "degradation";
	}
	return null;
}

function posixFilename(filename) {
	return filename.replace(/\\/g, "/");
}

function matchesPath(filename, site) {
	const normalized = posixFilename(filename);
	const siteNorm = site.replace(/\\/g, "/");
	return normalized === siteNorm || normalized.endsWith(`/${siteNorm}`);
}

function isAllowlistedSite(filename, entry) {
	if (!Array.isArray(entry.sites)) {
		return false;
	}
	return entry.sites.some(
		(site) => typeof site === "string" && matchesPath(filename, site),
	);
}

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

function propertyName(node) {
	if (!node) {
		return null;
	}
	if (node.type === "Identifier") {
		return node.name;
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	return null;
}

function memberName(node) {
	if (
		node.type !== "MemberExpression" &&
		node.type !== "OptionalMemberExpression"
	) {
		return null;
	}
	return propertyName(node.property);
}

function isNamedIdentifier(node, name) {
	return node.type === "Identifier" && node.name === name;
}

function nodeMentionsName(node, name) {
	if (!node) {
		return false;
	}
	if (isNamedIdentifier(node, name)) {
		return true;
	}
	if (node.type === "Literal" && node.value === name) {
		return true;
	}
	if (
		node.type === "MemberExpression" ||
		node.type === "OptionalMemberExpression"
	) {
		return (
			propertyName(node.property) === name ||
			nodeMentionsName(node.object, name)
		);
	}
	if (node.type === "UnaryExpression") {
		return nodeMentionsName(node.argument, name);
	}
	if (
		node.type === "BinaryExpression" ||
		node.type === "LogicalExpression"
	) {
		return (
			nodeMentionsName(node.left, name) ||
			nodeMentionsName(node.right, name)
		);
	}
	if (node.type === "CallExpression") {
		return (
			nodeMentionsName(node.callee, name) ||
			node.arguments.some((argument) => nodeMentionsName(argument, name))
		);
	}
	if (node.type === "ChainExpression") {
		return nodeMentionsName(node.expression, name);
	}
	if (
		node.type === "TSAsExpression" ||
		node.type === "TSNonNullExpression" ||
		node.type === "TSSatisfiesExpression" ||
		node.type === "TSTypeAssertion"
	) {
		return nodeMentionsName(node.expression, name);
	}
	return false;
}

function isTypeofTest(node) {
	return node.type === "UnaryExpression" && node.operator === "typeof";
}

function isFeatureTestNode(node, name) {
	if (!node) {
		return false;
	}
	if (isTypeofTest(node) && nodeMentionsName(node.argument, name)) {
		return true;
	}
	if (
		node.type === "BinaryExpression" &&
		node.operator === "in" &&
		node.left.type === "Literal" &&
		node.left.value === name
	) {
		return true;
	}
	if (isNamedIdentifier(node, name) || memberName(node) === name) {
		return true;
	}
	if (
		(node.type === "MemberExpression" ||
			node.type === "OptionalMemberExpression") &&
		node.optional &&
		propertyName(node.property) === name
	) {
		return true;
	}
	if (node.type === "ChainExpression") {
		return isFeatureTestNode(node.expression, name);
	}
	if (
		node.type === "LogicalExpression" ||
		node.type === "BinaryExpression"
	) {
		return (
			isFeatureTestNode(node.left, name) ||
			isFeatureTestNode(node.right, name)
		);
	}
	if (node.type === "UnaryExpression" && node.operator === "!") {
		return isFeatureTestNode(node.argument, name);
	}
	if (
		node.type === "TSAsExpression" ||
		node.type === "TSNonNullExpression" ||
		node.type === "TSSatisfiesExpression" ||
		node.type === "TSTypeAssertion"
	) {
		return isFeatureTestNode(node.expression, name);
	}
	return false;
}

function enclosingScopeHasFeatureTest(node, name) {
	let scope = node.parent;
	while (scope && !FUNCTION_TYPES.has(scope.type)) {
		scope = scope.parent;
	}
	if (!scope) {
		return false;
	}
	const stack = [scope];
	const seen = new Set();
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || typeof current !== "object" || seen.has(current)) {
			continue;
		}
		seen.add(current);
		if (isTypeofTest(current) && nodeMentionsName(current.argument, name)) {
			return true;
		}
		if (
			current.type === "BinaryExpression" &&
			current.operator === "in" &&
			current.left?.type === "Literal" &&
			current.left.value === name
		) {
			return true;
		}
		for (const [key, value] of Object.entries(current)) {
			if (key === "parent") {
				continue;
			}
			if (value && typeof value === "object" && value.type) {
				stack.push(value);
			} else if (Array.isArray(value)) {
				for (const item of value) {
					if (item && typeof item === "object" && item.type) {
						stack.push(item);
					}
				}
			}
		}
	}
	return false;
}

function isGuardedByFeatureTest(node, name) {
	let current = node.parent;
	while (current) {
		if (current.type === "IfStatement" && isFeatureTestNode(current.test, name)) {
			return true;
		}
		if (
			current.type === "ConditionalExpression" &&
			isFeatureTestNode(current.test, name)
		) {
			return true;
		}
		if (
			current.type === "LogicalExpression" &&
			current.operator === "&&" &&
			isFeatureTestNode(current.left, name)
		) {
			return true;
		}
		if (isTypeofTest(current) && nodeMentionsName(current.argument, name)) {
			return true;
		}
		if (
			current.type === "BinaryExpression" &&
			current.operator === "in" &&
			current.left.type === "Literal" &&
			current.left.value === name
		) {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function isOptionalAccess(node) {
	let current = node;
	while (current) {
		if (
			(current.type === "MemberExpression" ||
				current.type === "OptionalMemberExpression" ||
				current.type === "CallExpression") &&
			current.optional
		) {
			return true;
		}
		if (current.type === "ChainExpression") {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function stringText(node) {
	if (!node) {
		return null;
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	if (node.type === "TemplateLiteral") {
		return node.quasis.map((quasi) => quasi.value.cooked ?? "").join("");
	}
	if (node.type === "JSXExpressionContainer") {
		return stringText(node.expression);
	}
	return null;
}

function hasColorMix(text) {
	return typeof text === "string" && /color-mix\s*\(/i.test(text);
}

function sameStringHasBackgroundFallback(text) {
	if (!hasColorMix(text)) {
		return false;
	}
	const before = text.slice(0, text.search(/color-mix\s*\(/i));
	return /background(?:-color)?\s*:/i.test(before);
}

function objectPropertyName(node) {
	if (node.type !== "Property" && node.type !== "JSXAttribute") {
		return null;
	}
	if (node.type === "JSXAttribute") {
		return node.name.type === "JSXIdentifier" ? node.name.name : null;
	}
	if (node.key.type === "Identifier" && !node.computed) {
		return node.key.name;
	}
	if (node.key.type === "Literal" && typeof node.key.value === "string") {
		return node.key.value;
	}
	return null;
}

function isBackgroundProperty(node) {
	const name = objectPropertyName(node);
	return name != null && BACKGROUND_KEYS.has(name);
}

function isPrecededBySolidBackground(node) {
	const text = stringText(node);
	if (sameStringHasBackgroundFallback(text)) {
		return true;
	}

	let current = node;
	while (current.parent) {
		const parent = current.parent;
		if (parent.type === "ArrayExpression") {
			const index = parent.elements.indexOf(current);
			return parent.elements.slice(0, index).some((element) => {
				const previous = stringText(element);
				return (
					previous != null &&
					/background(?:-color)?\s*:/i.test(previous) &&
					!hasColorMix(previous)
				);
			});
		}
		if (parent.type === "Property" || parent.type === "JSXAttribute") {
			if (!isBackgroundProperty(parent)) {
				current = parent;
				continue;
			}
			const owner = parent.parent;
			if (owner?.type === "ObjectExpression") {
				const index = owner.properties.indexOf(parent);
				return owner.properties.slice(0, index).some((property) => {
					if (
						property.type !== "Property" ||
						!isBackgroundProperty(property)
					) {
						return false;
					}
					const previous = stringText(property.value);
					return previous != null && !hasColorMix(previous);
				});
			}
			if (owner?.type === "JSXOpeningElement") {
				const attributes = owner.attributes;
				const index = attributes.indexOf(parent);
				return attributes.slice(0, index).some((attribute) => {
					if (
						attribute.type !== "JSXAttribute" ||
						!isBackgroundProperty(attribute)
					) {
						return false;
					}
					const previous = stringText(attribute.value);
					return previous != null && !hasColorMix(previous);
				});
			}
		}
		current = parent;
	}
	return false;
}

function isObjectHasOwn(node) {
	return (
		(node.type === "MemberExpression" ||
			node.type === "OptionalMemberExpression") &&
		!node.computed &&
		isNamedIdentifier(node.object, "Object") &&
		propertyName(node.property) === "hasOwn"
	);
}

function isIntlSegmenter(node) {
	return (
		(node.type === "MemberExpression" ||
			node.type === "OptionalMemberExpression") &&
		!node.computed &&
		isNamedIdentifier(node.object, "Intl") &&
		propertyName(node.property) === "Segmenter"
	);
}

function isEditContextConstructor(node) {
	if (isNamedIdentifier(node, "EditContext")) {
		return true;
	}
	return memberName(node) === "EditContext";
}

function isResizeObserverConstructor(node) {
	if (isNamedIdentifier(node, "ResizeObserver")) {
		return true;
	}
	return memberName(node) === "ResizeObserver";
}

function isStructuredCloneCallee(node) {
	if (isNamedIdentifier(node, "structuredClone")) {
		return true;
	}
	return memberName(node) === "structuredClone";
}

export const noAboveFloorApi = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban bare above-floor web APIs; feature-detect or allowlist with a fallback",
			specRule: "HOST4",
		},
		schema: [
			{
				type: "object",
				properties: {
					allowlist: { type: "array" },
				},
				additionalProperties: false,
			},
		],
		messages: {
			bareUse:
				"Bare `{{api}}` is above the HOST3 floor. Feature-detect it and degrade via the documented fallback, or add an allowlist entry that names the fallback and user-visible degradation (spec-v2 HOST4).",
			incompleteAllowlist:
				"Above-floor allowlist entry `{{api}}` is missing `{{field}}`. Every HOST4 entry must name api, fallback, and degradation (spec-v2 HOST4).",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		const allowlist = context.options[0]?.allowlist ?? committedAllowlist;
		const byApi = new Map(
			allowlist
				.filter((entry) => entry && typeof entry.api === "string")
				.map((entry) => [entry.api, entry]),
		);

		function reportBare(node, api) {
			const name = apiName(api);
			if (
				isTypePosition(node) ||
				isGuardedByFeatureTest(node, name) ||
				enclosingScopeHasFeatureTest(node, name)
			) {
				return;
			}
			if (isOptionalAccess(node)) {
				return;
			}
			const entry = byApi.get(api);
			if (entry && !missingAllowlistField(entry) && isAllowlistedSite(filename, entry)) {
				return;
			}
			context.report({ node, messageId: "bareUse", data: { api } });
		}

		function apiName(api) {
			if (api === "Array.prototype.at") {
				return "at";
			}
			if (api === "Intl.Segmenter") {
				return "Segmenter";
			}
			if (api === "color-mix") {
				return "color-mix";
			}
			return api;
		}

		return {
			Program() {
				for (const entry of allowlist) {
					const field = missingAllowlistField(entry);
					if (field) {
						context.report({
							loc: { line: 1, column: 0 },
							messageId: "incompleteAllowlist",
							data: {
								api:
									entry && typeof entry.api === "string"
										? entry.api
										: "(missing)",
								field,
							},
						});
					}
				}
			},
			NewExpression(node) {
				if (isEditContextConstructor(node.callee)) {
					reportBare(node, "EditContext");
					return;
				}
				if (isResizeObserverConstructor(node.callee)) {
					reportBare(node, "ResizeObserver");
					return;
				}
				if (isIntlSegmenter(node.callee)) {
					reportBare(node, "Intl.Segmenter");
				}
			},
			CallExpression(node) {
				if (isStructuredCloneCallee(node.callee)) {
					reportBare(node, "structuredClone");
					return;
				}
				if (isObjectHasOwn(node.callee)) {
					reportBare(node, "Object.hasOwn");
					return;
				}
				if (
					(node.callee.type === "MemberExpression" ||
						node.callee.type === "OptionalMemberExpression") &&
					propertyName(node.callee.property) === "at"
				) {
					reportBare(node, "Array.prototype.at");
					return;
				}
				if (
					(node.callee.type === "MemberExpression" ||
						node.callee.type === "OptionalMemberExpression") &&
					propertyName(node.callee.property) === "replaceChildren"
				) {
					reportBare(node, "replaceChildren");
				}
			},
			Literal(node) {
				if (typeof node.value !== "string" || !hasColorMix(node.value)) {
					return;
				}
				if (isPrecededBySolidBackground(node)) {
					return;
				}
				reportBare(node, "color-mix");
			},
			TemplateLiteral(node) {
				const text = stringText(node);
				if (!hasColorMix(text) || isPrecededBySolidBackground(node)) {
					return;
				}
				reportBare(node, "color-mix");
			},
		};
	},
};

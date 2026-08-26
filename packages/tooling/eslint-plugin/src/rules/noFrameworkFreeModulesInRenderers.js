import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * API6 (`spec/rules/api.md`): renderer packages are framework
 * bindings. A module under react/src or vue/src that imports neither its
 * framework nor a framework type belongs in `@input/pen-dom`. Pure stubs that
 * re-export a `utils` subpath of `@input/pen-dom` are the P.6 end state and
 * stay. A justified leftover names API6 plus a reason, in an eslint-disable
 * comment or `scripts/renderer-framework-free-allowlist.json`.
 */

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../..",
);
const DEFAULT_ALLOWLIST_PATH = path.join(
	REPO_ROOT,
	"scripts/renderer-framework-free-allowlist.json",
);

const REACT_SPECIFIERS = [/^react$/, /^react\//, /^react-dom$/, /^react-dom\//];
const VUE_SPECIFIERS = [/^vue$/, /^vue\//, /^@vue\//];

const RENDERERS = [
	{
		id: "react",
		marker: "/packages/rendering/react/",
		specifiers: REACT_SPECIFIERS,
	},
	{
		id: "vue",
		marker: "/packages/rendering/vue/",
		specifiers: VUE_SPECIFIERS,
	},
];

const API6_JUSTIFICATION = /API6\b/;

function loadAllowlist(filePath) {
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8"));
		return Array.isArray(parsed.modules) ? parsed.modules : [];
	} catch {
		return [];
	}
}

const committedAllowlist = loadAllowlist(DEFAULT_ALLOWLIST_PATH);

function posixFilename(filename) {
	return filename.replace(/\\/g, "/");
}

function matchesPath(filename, site) {
	const normalized = posixFilename(filename);
	const siteNorm = site.replace(/\\/g, "/");
	return normalized === siteNorm || normalized.endsWith(`/${siteNorm}`);
}

function resolveRenderer(filename) {
	const normalized = posixFilename(filename);
	return (
		RENDERERS.find(
			(renderer) =>
				normalized.includes(renderer.marker) ||
				normalized.startsWith(renderer.marker.slice(1)),
		) ?? null
	);
}

function isFrameworkSpecifier(specifier, patterns) {
	return (
		typeof specifier === "string" &&
		patterns.some((pattern) => pattern.test(specifier))
	);
}

function specifierFromNode(node) {
	if (!node) {
		return null;
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	if (
		node.type === "TSLiteralType" &&
		node.literal.type === "Literal" &&
		typeof node.literal.value === "string"
	) {
		return node.literal.value;
	}
	return null;
}

function isReexportStatement(node) {
	if (node.type === "ExportAllDeclaration" && node.source) {
		return true;
	}
	if (node.type === "ExportNamedDeclaration" && node.source) {
		return true;
	}
	if (node.type === "EmptyStatement") {
		return true;
	}
	if (node.type === "ExpressionStatement") {
		const expression = node.expression;
		return (
			expression.type === "Literal" && expression.value === "use client"
		);
	}
	return false;
}

function isPureReexport(program) {
	return program.body.length > 0 && program.body.every(isReexportStatement);
}

function leftoverReason(comment) {
	const stripped = comment.value
		.replace(/eslint-[\w-]+/g, " ")
		.replace(/pen\/no-framework-free-modules-in-renderers/g, " ")
		.replace(/API6\b/g, " ")
		.replace(/[-—:*/]/g, " ")
		.trim();
	return stripped.length > 0;
}

function hasApi6Justification(sourceCode) {
	return sourceCode.getAllComments().some((comment) => {
		if (!API6_JUSTIFICATION.test(comment.value)) {
			return false;
		}
		return leftoverReason(comment);
	});
}

function isAllowlisted(filename, modules) {
	return modules.some(
		(entry) =>
			typeof entry?.file === "string" &&
			typeof entry.reason === "string" &&
			entry.reason.trim().length > 0 &&
			matchesPath(filename, entry.file),
	);
}

export const noFrameworkFreeModulesInRenderers = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban framework-free modules in renderer packages; they belong in pen-dom",
			specRule: "API6",
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
			frameworkFree:
				"This renderer module imports neither its framework nor a framework type. Move the implementation to `@input/pen-dom` and re-export it, or justify the exception with API6 and a reason (API6).",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		const renderer = resolveRenderer(filename);
		if (!renderer) {
			return {};
		}

		const modules = context.options[0]?.allowlist ?? committedAllowlist;
		if (isAllowlisted(filename, modules)) {
			return {};
		}

		const sourceCode = context.sourceCode ?? context.getSourceCode();
		if (hasApi6Justification(sourceCode)) {
			return {};
		}

		let usedFramework = false;

		function markSpecifier(node) {
			const specifier = specifierFromNode(node);
			if (isFrameworkSpecifier(specifier, renderer.specifiers)) {
				usedFramework = true;
			}
		}

		return {
			ImportDeclaration(node) {
				markSpecifier(node.source);
			},
			ExportNamedDeclaration(node) {
				markSpecifier(node.source);
			},
			ExportAllDeclaration(node) {
				markSpecifier(node.source);
			},
			ImportExpression(node) {
				markSpecifier(node.source);
			},
			TSImportType(node) {
				markSpecifier(node.argument);
			},
			JSXElement() {
				usedFramework = true;
			},
			JSXFragment() {
				usedFramework = true;
			},
			"Program:exit"(node) {
				if (usedFramework || isPureReexport(node)) {
					return;
				}
				context.report({ node, messageId: "frameworkFree" });
			},
		};
	},
};

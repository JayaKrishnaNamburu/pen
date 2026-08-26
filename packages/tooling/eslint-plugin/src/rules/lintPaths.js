import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../..",
);

const FUNCTION_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
]);

export function posixFilename(filename) {
	return filename.replace(/\\/g, "/");
}

export function repoRelativeFilename(filename) {
	const normalized = posixFilename(filename);
	const root = posixFilename(REPO_ROOT);
	if (normalized.startsWith(`${root}/`)) {
		return normalized.slice(root.length + 1);
	}
	const packagesAt = normalized.lastIndexOf("/packages/");
	if (packagesAt !== -1) {
		return normalized.slice(packagesAt + 1);
	}
	if (
		normalized.startsWith("packages/") ||
		normalized.startsWith("examples/") ||
		normalized.startsWith("playground/")
	) {
		return normalized;
	}
	return normalized;
}

export function propertyName(node) {
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

export function enclosingSymbol(node) {
	const named = [];
	let current = node.parent;
	while (current) {
		if (
			current.type === "FunctionDeclaration" &&
			current.id?.type === "Identifier"
		) {
			named.push({ name: current.id.name, kind: "function" });
		} else if (
			(current.type === "MethodDefinition" ||
				current.type === "PropertyDefinition" ||
				current.type === "Property") &&
			FUNCTION_TYPES.has(current.value?.type)
		) {
			named.push({
				name: propertyName(current.key) ?? "(anonymous)",
				kind: "method",
			});
		} else if (
			current.type === "VariableDeclarator" &&
			current.id?.type === "Identifier" &&
			FUNCTION_TYPES.has(current.init?.type)
		) {
			named.push({ name: current.id.name, kind: "variable" });
		}
		current = current.parent;
	}
	const innerFunction = named.find((entry) => entry.kind === "function");
	if (innerFunction) {
		return innerFunction.name;
	}
	const outer = named[named.length - 1];
	return outer?.name ?? "(module)";
}

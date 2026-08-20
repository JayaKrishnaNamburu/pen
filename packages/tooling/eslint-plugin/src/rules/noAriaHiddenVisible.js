const SANCTIONED = /AX7|focus sink|Justified/i;

function jsxAttributeName(node) {
	if (node.type === "JSXIdentifier") {
		return node.name;
	}
	return null;
}

function propertyName(node) {
	if (node.key.type === "Identifier" && !node.computed) {
		return node.key.name;
	}
	if (node.key.type === "Literal" && typeof node.key.value === "string") {
		return node.key.value;
	}
	return null;
}

function isHiddenTrue(valueNode) {
	if (!valueNode) {
		return true;
	}
	if (valueNode.type === "Literal") {
		return valueNode.value === true || valueNode.value === "true";
	}
	if (valueNode.type === "JSXExpressionContainer") {
		return isHiddenTrue(valueNode.expression);
	}
	return false;
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
	const line = node.loc.start.line;
	const nearby = [lines[line - 2] ?? "", lines[line - 1] ?? ""].join("\n");
	return SANCTIONED.test(nearby);
}

/**
 * AX4 / AX7 (`spec-v2/13-accessibility.md`): `aria-hidden` is banned on
 * visible content in rendering packages. Overlay chrome (AX7) and the focus
 * sink are the sanctioned exceptions — mark them with a comment naming AX7,
 * "focus sink", or "Justified".
 */
export const noAriaHiddenVisible = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban aria-hidden on visible content; overlay and focus-sink only",
			specRule: "AX4",
		},
		schema: [],
		messages: {
			hidden:
				"`aria-hidden` hides visible content. Keep it for AX7 overlays or the focus sink, and name that reason in an adjacent comment (spec-v2 AX4).",
		},
	},
	create(context) {
		const sourceCode = context.sourceCode;

		function report(node) {
			if (isSanctioned(sourceCode, node)) {
				return;
			}
			context.report({ node, messageId: "hidden" });
		}

		return {
			JSXAttribute(node) {
				if (jsxAttributeName(node.name) !== "aria-hidden") {
					return;
				}
				if (!isHiddenTrue(node.value)) {
					return;
				}
				report(node);
			},
			Property(node) {
				const name = propertyName(node);
				if (name !== "aria-hidden" && name !== "ariaHidden") {
					return;
				}
				if (!isHiddenTrue(node.value)) {
					return;
				}
				report(node);
			},
			CallExpression(node) {
				if (calleeName(node.callee) !== "setAttribute") {
					return;
				}
				const [nameNode, valueNode] = node.arguments;
				if (
					nameNode?.type !== "Literal" ||
					nameNode.value !== "aria-hidden"
				) {
					return;
				}
				if (!isHiddenTrue(valueNode)) {
					return;
				}
				report(node);
			},
		};
	},
};

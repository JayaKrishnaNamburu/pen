const HTML_PROPERTY_SINKS = new Set(["innerHTML", "outerHTML"]);
const HTML_METHOD_SINKS = new Set(["insertAdjacentHTML", "createContextualFragment"]);
const DOCUMENT_WRITE_SINKS = new Set(["write", "writeln"]);

function isDocumentObject(node) {
	if (node.type === "Identifier") {
		return node.name === "document";
	}
	return node.type === "MemberExpression" && node.property.type === "Identifier" && node.property.name === "document";
}

/**
 * SEC2 (`spec/rules/security.md`): the document is untrusted input forever, so no
 * library code may turn a string into markup. Rendering builds DOM through
 * `createElement` / `textContent` / attribute setters instead.
 *
 * Reads of `innerHTML`/`outerHTML` are allowed — assignment is the sink. Parsing
 * untrusted HTML into a detached document via `DOMParser` stays allowed by design.
 */
export const noHtmlInjectionSinks = {
	meta: {
		type: "problem",
		docs: {
			description: "Ban HTML injection sinks; build DOM instead of serializing markup",
			specRule: "SEC2",
		},
		schema: [],
		messages: {
			propertyAssignment:
				"Assigning `{{name}}` injects markup. Build DOM with createElement/textContent (SEC2).",
			method: "`{{name}}` parses a string into live DOM. Build DOM instead (SEC2).",
			documentWrite: "`document.{{name}}` injects markup. Build DOM instead (SEC2).",
			jsxAttribute:
				"`dangerouslySetInnerHTML` injects markup. Render children instead (SEC2).",
		},
	},
	create(context) {
		return {
			AssignmentExpression(node) {
				const { left } = node;
				if (left.type !== "MemberExpression" || left.property.type !== "Identifier") {
					return;
				}
				if (HTML_PROPERTY_SINKS.has(left.property.name)) {
					context.report({
						node: left,
						messageId: "propertyAssignment",
						data: { name: left.property.name },
					});
				}
			},
			MemberExpression(node) {
				if (node.property.type !== "Identifier") {
					return;
				}
				if (HTML_METHOD_SINKS.has(node.property.name)) {
					context.report({
						node,
						messageId: "method",
						data: { name: node.property.name },
					});
					return;
				}
				if (DOCUMENT_WRITE_SINKS.has(node.property.name) && isDocumentObject(node.object)) {
					context.report({
						node,
						messageId: "documentWrite",
						data: { name: node.property.name },
					});
				}
			},
			JSXAttribute(node) {
				if (node.name.type === "JSXIdentifier" && node.name.name === "dangerouslySetInnerHTML") {
					context.report({ node, messageId: "jsxAttribute" });
				}
			},
		};
	},
};

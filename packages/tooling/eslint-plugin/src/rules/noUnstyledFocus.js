const HIT_RE = /outline:\s*(?:none\b|["']none["'])/;
const FOCUS_VISIBLE_RE = /:focus-visible\b/;
const OUTLINE_VALUE_RE = /outline:\s*(?:["']([^"']+)["']|([^;,\n}]+))/g;
const NEARBY_RADIUS = 24;

function propertyName(node) {
	if (node.key.type === "Identifier" && !node.computed) {
		return node.key.name;
	}
	if (node.key.type === "Literal" && typeof node.key.value === "string") {
		return node.key.value;
	}
	return null;
}

function outlineValueIsNone(value) {
	return /^\s*none\b/.test(value.trim());
}

function hasFocusVisibleReplacement(text, hitLine) {
	const lines = text.split(/\r?\n/);
	const hitIndex = hitLine - 1;
	const start = Math.max(0, hitIndex - NEARBY_RADIUS);
	const end = Math.min(lines.length, hitIndex + NEARBY_RADIUS + 1);
	const windowText = lines.slice(start, end).join("\n");
	if (!FOCUS_VISIBLE_RE.test(windowText)) {
		return false;
	}
	OUTLINE_VALUE_RE.lastIndex = 0;
	for (const match of windowText.matchAll(OUTLINE_VALUE_RE)) {
		const value = (match[1] ?? match[2] ?? "").trim();
		if (value.length > 0 && !outlineValueIsNone(value)) {
			return true;
		}
	}
	return false;
}

/**
 * AX5 (`spec-v2/13-accessibility.md`): `outline: none` must ship with a
 * nearby `:focus-visible` replacement that sets a non-none outline.
 */
export const noUnstyledFocus = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban outline:none unless a nearby :focus-visible rule restores a ring",
			specRule: "AX5",
		},
		schema: [],
		messages: {
			outlineNone:
				"`outline: none` needs a nearby `:focus-visible` replacement with a non-none outline (spec-v2 AX5).",
		},
	},
	create(context) {
		const sourceCode = context.sourceCode;
		const fileText = sourceCode.getText();

		function reportUnlessReplaced(node) {
			if (hasFocusVisibleReplacement(fileText, node.loc.start.line)) {
				return;
			}
			context.report({ node, messageId: "outlineNone" });
		}

		return {
			Property(node) {
				if (propertyName(node) !== "outline") {
					return;
				}
				const value = node.value;
				if (value.type === "Literal" && value.value === "none") {
					reportUnlessReplaced(node);
				}
			},
			Literal(node) {
				if (typeof node.value !== "string") {
					return;
				}
				if (!HIT_RE.test(node.value)) {
					return;
				}
				reportUnlessReplaced(node);
			},
			TemplateElement(node) {
				if (!HIT_RE.test(node.value.cooked ?? node.value.raw ?? "")) {
					return;
				}
				reportUnlessReplaced(node);
			},
		};
	},
};

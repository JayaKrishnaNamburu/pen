import DOMPurify from "isomorphic-dompurify";

const ALLOWED_INLINE_STYLE_PROPS = new Set([
	"color",
	"background-color",
	"text-align",
]);

const ALLOWED_TEXT_ALIGN_VALUES = new Set([
	"left",
	"right",
	"center",
	"justify",
	"start",
	"end",
]);

const ALLOWED_HTML_ALIGN_VALUES = new Set([
	"left",
	"right",
	"center",
	"justify",
]);

const HOSTILE_STYLE_VALUE = /\/\*|\burl\s*\(|\bexpression\s*\(|\\/i;

/**
 * `data-pen-*` names `domToBlocks` / `inlineParser` actually read.
 * Conversion uses tags, class, href, src, style, align, and a few HTML attrs — no
 * `data-pen-*` today. Keep this list exact; do not add a `data-*` wildcard.
 */
export const ALLOWED_DATA_PEN_ATTRS: readonly string[] = Object.freeze([]);

const PURIFY_CONFIG = {
	ALLOWED_TAGS: [
		"p",
		"br",
		"hr",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"ul",
		"ol",
		"li",
		"a",
		"strong",
		"b",
		"em",
		"i",
		"u",
		"s",
		"del",
		"strike",
		"code",
		"pre",
		"blockquote",
		"table",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
		"img",
		"mark",
		"span",
		"div",
		"details",
		"summary",
		"input",
	],
	ALLOWED_ATTR: [
		"href",
		"src",
		"alt",
		"title",
		"width",
		"height",
		"class",
		"colspan",
		"rowspan",
		"type",
		"checked",
		"disabled",
		"style",
		"align",
		"start",
		"open",
		...ALLOWED_DATA_PEN_ATTRS,
	],
	ALLOW_DATA_ATTR: false,
	FORBID_TAGS: [
		"script",
		"style",
		"iframe",
		"object",
		"embed",
		"applet",
		"form",
		"noscript",
		"template",
		"math",
		"svg",
	],
	FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover"],
	RETURN_TRUSTED_TYPE: false,
};

type SanitizeAttributeHookEvent = {
	attrName: string;
	attrValue: string;
	keepAttr: boolean;
};

function admitKeywordValue(
	raw: string,
	allowed: ReadonlySet<string>,
): string | null {
	if (HOSTILE_STYLE_VALUE.test(raw)) {
		return null;
	}
	const normalized = raw.replace(/\s*!important\s*$/i, "").trim().toLowerCase();
	if (!allowed.has(normalized)) {
		return null;
	}
	return normalized;
}

function admitStylePropertyValue(
	property: string,
	propertyValue: string,
): string | null {
	if (property === "text-align") {
		return admitKeywordValue(propertyValue, ALLOWED_TEXT_ALIGN_VALUES);
	}
	return propertyValue;
}

function filterInlineStyleDeclarations(value: string): string {
	return value
		.split(";")
		.map((declaration) => declaration.trim())
		.filter(Boolean)
		.map((declaration) => {
			const separatorIndex = declaration.indexOf(":");
			if (separatorIndex < 0) {
				return null;
			}
			const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
			const propertyValue = declaration.slice(separatorIndex + 1).trim();
			if (
				!ALLOWED_INLINE_STYLE_PROPS.has(property) ||
				propertyValue.length === 0
			) {
				return null;
			}
			const admitted = admitStylePropertyValue(property, propertyValue);
			if (admitted === null) {
				return null;
			}
			return `${property}: ${admitted}`;
		})
		.filter((declaration): declaration is string => declaration !== null)
		.join("; ");
}

function uponSanitizeAttribute(
	_node: Node,
	data: SanitizeAttributeHookEvent,
): void {
	if (data.attrName === "align") {
		const admitted = admitKeywordValue(
			data.attrValue,
			ALLOWED_HTML_ALIGN_VALUES,
		);
		if (admitted === null) {
			data.keepAttr = false;
			data.attrValue = "";
			return;
		}
		data.attrValue = admitted;
		return;
	}
	if (data.attrName !== "style") {
		return;
	}
	const nextStyle = filterInlineStyleDeclarations(data.attrValue);
	if (nextStyle.length === 0) {
		data.keepAttr = false;
		data.attrValue = "";
		return;
	}
	data.attrValue = nextStyle;
}

export function sanitizeHTML(html: string): string {
	DOMPurify.addHook("uponSanitizeAttribute", uponSanitizeAttribute);
	try {
		return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
	} finally {
		DOMPurify.removeHook("uponSanitizeAttribute");
	}
}

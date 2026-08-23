import type { SchemaRegistry } from "@input/pen-types";
import { urlPolicy, type UrlPolicy } from "../security/urlPolicy";
import { INLINE_DECORATION_ATTRIBUTE_KEY } from "../utils/inlineDecorations";

export function wrapWithMarks(
	node: Node,
	attributes: Record<string, unknown>,
	registry: SchemaRegistry,
	policy: UrlPolicy = urlPolicy,
): Node {
	let wrapped = node;
	const decorationAttributes = isDecorationAttributesValue(
		attributes[INLINE_DECORATION_ATTRIBUTE_KEY],
	)
		? attributes[INLINE_DECORATION_ATTRIBUTE_KEY]
		: null;

	const entries = Object.entries(attributes)
		.filter(([key]) => key !== INLINE_DECORATION_ATTRIBUTE_KEY)
		.filter(([_, value]) => value !== null && value !== false)
		.sort(([a], [b]) => {
			const schemaA = registry.resolveInline(a);
			const schemaB = registry.resolveInline(b);
			return (schemaA?.priority ?? 0) - (schemaB?.priority ?? 0);
		});

	for (const [markType, markProps] of entries) {
		const element = createMarkElement(markType, markProps, policy);
		element.appendChild(wrapped);
		wrapped = element;
	}

	if (decorationAttributes) {
		const element = createMarkElement(
			INLINE_DECORATION_ATTRIBUTE_KEY,
			decorationAttributes,
			policy,
		);
		element.appendChild(wrapped);
		wrapped = element;
	}

	return wrapped;
}

export function createMarkedNode(
	text: string,
	attributes: Record<string, unknown>,
	registry: SchemaRegistry,
	policy: UrlPolicy = urlPolicy,
): Node {
	const node: Node = document.createTextNode(text);
	return wrapWithMarks(node, attributes, registry, policy);
}

function createMarkElement(
	markType: string,
	props: unknown,
	policy: UrlPolicy,
): HTMLElement {
	switch (markType) {
		case INLINE_DECORATION_ATTRIBUTE_KEY: {
			const span = document.createElement("span");
			applyElementAttributes(span, props, policy);
			return span;
		}
		case "bold":
			return document.createElement("strong");
		case "italic":
			return document.createElement("em");
		case "underline":
			return document.createElement("u");
		case "strikethrough":
			return document.createElement("s");
		case "code":
			return document.createElement("code");
		case "link": {
			const anchor = document.createElement("a");
			if (typeof props === "object" && props !== null) {
				const record = props as Record<string, unknown>;
				if (record.href) {
					const href = policy.resolve(record.href, "link");
					if (href === null) {
						anchor.setAttribute("data-pen-blocked-url", "");
					} else {
						anchor.href = href;
					}
				}
				if (record.title) anchor.title = record.title as string;
			}
			return anchor;
		}
		case "highlight": {
			const mark = document.createElement("mark");
			if (typeof props === "object" && props !== null) {
				const record = props as Record<string, unknown>;
				if (record.color)
					mark.style.backgroundColor = record.color as string;
			}
			return mark;
		}
		case "suggestion": {
			const span = document.createElement("span");
			span.dataset.markType = markType;

			if (typeof props === "object" && props !== null) {
				const record = props as Record<string, unknown>;
				const suggestionId =
					typeof record.id === "string" && record.id.length > 0
						? record.id
						: null;
				const suggestionAction =
					record.action === "delete" ? "delete" : "insert";

				if (suggestionId) {
					span.dataset.suggestionId = suggestionId;
				}

				span.dataset.suggestionAction = suggestionAction;
				span.classList.add(
					suggestionAction === "delete"
						? "pen-suggestion-delete"
						: "pen-suggestion-insert",
				);
			}

			return span;
		}
		default: {
			const span = document.createElement("span");
			span.dataset.markType = markType;
			return span;
		}
	}
}

/**
 * Writes decoration-supplied attributes onto a rendered element, dropping any
 * that fail the URL policy so untrusted decoration props cannot inject a
 * navigable or script-bearing value.
 *
 * @param element - The element receiving the attributes.
 * @param props - Candidate attribute values; ignored unless they are a valid
 * decoration attributes object.
 * @param policy - URL policy used to vet attribute values.
 */
export function applyElementAttributes(
	element: HTMLElement,
	props: unknown,
	policy: UrlPolicy = urlPolicy,
): void {
	if (!isDecorationAttributesValue(props)) {
		return;
	}

	for (const [key, value] of Object.entries(props)) {
		if (value === null || value === false || value === undefined) {
			continue;
		}
		// SEC2: event handlers and stylesheets are not data
		if (/^on/i.test(key) || key.toLowerCase() === "style") {
			continue;
		}
		const attributeName = key.toLowerCase();
		if (
			attributeName === "href" ||
			attributeName === "src" ||
			attributeName === "xlink:href"
		) {
			const resolved = policy.resolve(
				value,
				attributeName === "src" ? "image" : "link",
			);
			if (resolved === null) {
				element.setAttribute("data-pen-blocked-url", "");
			} else {
				element.setAttribute(attributeName, resolved);
			}
			continue;
		}
		if (key === "class" && typeof value === "string") {
			element.className = value;
			continue;
		}
		if (value === true) {
			element.setAttribute(key, "");
			continue;
		}
		element.setAttribute(key, String(value));
	}
}

function isDecorationAttributesValue(
	value: unknown,
): value is Record<string, string | number | boolean> {
	return typeof value === "object" && value !== null;
}

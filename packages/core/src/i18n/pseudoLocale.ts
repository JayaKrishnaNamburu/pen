import {
	isPluralMessage,
	DEFAULT_MESSAGE_CATALOG,
	type MessageCatalog,
	type MessageKey,
	type MessageValue,
} from "@input/pen-types";

export const PSEUDO_LOCALE_OPEN = "[[";
export const PSEUDO_LOCALE_CLOSE = " ···]]";

export function toPseudoLocaleText(text: string): string {
	if (
		text.startsWith(PSEUDO_LOCALE_OPEN) &&
		text.endsWith(PSEUDO_LOCALE_CLOSE.trim())
	) {
		return text;
	}
	return `${PSEUDO_LOCALE_OPEN}${text}${PSEUDO_LOCALE_CLOSE}`;
}

export function toPseudoLocaleValue(value: MessageValue): MessageValue {
	if (!isPluralMessage(value)) {
		return toPseudoLocaleText(value);
	}
	const next: Record<string, string> = { other: toPseudoLocaleText(value.other) };
	for (const [category, text] of Object.entries(value)) {
		if (typeof text === "string") {
			next[category] = toPseudoLocaleText(text);
		}
	}
	return next as MessageValue;
}

export function createPseudoLocaleCatalog(
	catalog: MessageCatalog = DEFAULT_MESSAGE_CATALOG,
): MessageCatalog {
	const next = {} as MessageCatalog;
	for (const key of Object.keys(catalog) as MessageKey[]) {
		next[key] = toPseudoLocaleValue(catalog[key]);
	}
	return next;
}

export function isPseudoLocaleText(text: string): boolean {
	return (
		text.startsWith(PSEUDO_LOCALE_OPEN) && text.endsWith(PSEUDO_LOCALE_CLOSE)
	);
}

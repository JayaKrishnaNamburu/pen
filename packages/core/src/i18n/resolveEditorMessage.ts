import {
	isPluralMessage,
	type Editor,
	type MessageArgs,
	type MessageKey,
	type MessageValue,
} from "@input/pen-types";

import { localeFacet, messagesFacet } from "../facets/i18nFacets";
import { createFormatterCache } from "./formatters";
import { interpolateMessage } from "./messages";

const formatterCache = createFormatterCache();
const missingKeysByEditor = new WeakMap<Editor, Set<string>>();

export function resolveEditorMessage<K extends MessageKey>(
	editor: Editor,
	key: K,
	...args: MessageArgs<K>
): string {
	const catalog = editor.facet(messagesFacet);
	const value = catalog[key] as MessageValue | undefined;
	if (value == null) {
		emitMissingOnce(editor, key);
		return "";
	}
	const locale = editor.facet(localeFacet);
	const params = args[0] as Record<string, unknown> | undefined;
	return interpolateMessage(selectTemplate(value, locale, params), params);
}

function selectTemplate(
	value: MessageValue,
	locale: string,
	params: Record<string, unknown> | undefined,
): string {
	if (!isPluralMessage(value)) {
		return value;
	}
	const count = params?.count;
	if (typeof count !== "number") {
		return value.other;
	}
	const category = formatterCache.getPluralRules(locale).select(count);
	return value[category] ?? value.other;
}

function emitMissingOnce(editor: Editor, key: string): void {
	const seen = missingKeysByEditor.get(editor);
	if (seen?.has(key)) {
		return;
	}
	const next = seen ?? new Set<string>();
	next.add(key);
	missingKeysByEditor.set(editor, next);
	editor.internals.emit("diagnostic", {
		code: "message-missing",
		level: "warn",
		source: "i18n",
		message: `message key "${key}" is missing`,
		key,
	});
}

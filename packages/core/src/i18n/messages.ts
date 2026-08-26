import {
	DEFAULT_MESSAGE_CATALOG,
	isPluralMessage,
	type MessageArgs,
	type MessageCatalog,
	type MessageKey,
} from "@input/pen-types";

export function interpolateMessage(
	template: string,
	params?: Record<string, unknown>,
): string {
	if (!params) {
		return template;
	}
	return template.replace(
		/\{([a-zA-Z][a-zA-Z0-9]*)\}/g,
		(match, name: string) => {
			if (!(name in params)) {
				return match;
			}
			const value = params[name];
			return value == null ? "" : String(value);
		},
	);
}

export function resolveMessage<K extends MessageKey>(
	catalog: Partial<MessageCatalog>,
	key: K,
	...args: MessageArgs<K>
): string {
	const raw = catalog[key] ?? DEFAULT_MESSAGE_CATALOG[key];
	if (raw == null) {
		return "";
	}
	if (isPluralMessage(raw)) {
		return interpolateMessage(raw.other, args[0]);
	}
	return interpolateMessage(raw, args[0]);
}

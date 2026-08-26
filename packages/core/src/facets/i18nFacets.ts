import {
	DEFAULT_MESSAGE_CATALOG,
	type MessageCatalog,
	type MessageValue,
} from "@input/pen-types";

import { defineFacet } from "./defineFacet";

export function resolveEnvironmentLocale(): string {
	if (typeof navigator === "object" && navigator !== null) {
		const language = navigator.language;
		if (typeof language === "string" && language.length > 0) {
			return language;
		}
	}
	return "en";
}

export const localeFacet = defineFacet<string, string>({
	name: "pen.locale",
	combine: (inputs) => inputs[0] ?? "en",
});

export const messagesFacet = defineFacet<
	Partial<MessageCatalog>,
	MessageCatalog
>({
	name: "pen.messages",
	combine: (inputs) => {
		const catalog: { [K in keyof MessageCatalog]?: MessageValue } = {
			...DEFAULT_MESSAGE_CATALOG,
		};
		for (let index = inputs.length - 1; index >= 0; index -= 1) {
			Object.assign(catalog, inputs[index]);
		}
		return catalog as MessageCatalog;
	},
});

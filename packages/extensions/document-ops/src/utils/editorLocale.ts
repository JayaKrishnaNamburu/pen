import { localeFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";

const DEFAULT_DOCUMENT_OPS_LOCALE = "en";

export function resolveEditorLocale(editor: Editor): string {
	const locale = editor.facet(localeFacet);
	return typeof locale === "string" && locale.length > 0
		? locale
		: DEFAULT_DOCUMENT_OPS_LOCALE;
}

// Same body as core `foldAndNormalize` (LOC5). A package import would cycle:
// `@input/pen-core` already loads `documentOpsExtension`.
export function foldAndNormalize(text: string, locale: string): string {
	return text
		.toLocaleLowerCase(locale)
		.replaceAll("\u03C2", "\u03C3")
		.normalize("NFC");
}

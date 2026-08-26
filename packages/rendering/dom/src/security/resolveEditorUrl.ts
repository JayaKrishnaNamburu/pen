import { urlPolicyFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { urlPolicy, type UrlContext, type UrlPolicy } from "./urlPolicy";

export function urlPolicyFromEditor(editor?: Editor | null): UrlPolicy {
	return editor?.facet(urlPolicyFacet) ?? urlPolicy;
}

export function resolveEditorUrl(
	editor: Editor | null | undefined,
	rawValue: unknown,
	context: UrlContext,
): string | null {
	return urlPolicyFromEditor(editor).resolve(rawValue, context);
}

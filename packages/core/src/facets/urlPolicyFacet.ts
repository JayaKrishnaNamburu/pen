import { defineFacet } from "./defineFacet";

export type UrlContext = "link" | "image" | "media" | "download";

export interface UrlPolicy {
	resolve(rawValue: unknown, context: UrlContext): string | null;
}

// core cannot import @input/pen-dom; empty combine is undefined until the host/dom binding wraps urlPolicy.resolve
export const urlPolicyFacet = defineFacet<UrlPolicy, UrlPolicy | undefined>({
	name: "pen.urlPolicy",
	combine: (inputs) => inputs.at(-1),
});

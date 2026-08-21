import type { UrlPolicy } from "../security/urlPolicy";
import { defineFacet } from "./defineFacet";

// empty combine is undefined until a host or renderer binding provides a policy; sinks fall back to urlPolicy.
export const urlPolicyFacet = defineFacet<UrlPolicy, UrlPolicy | undefined>({
	name: "pen.urlPolicy",
	combine: (inputs) => inputs[inputs.length - 1],
});

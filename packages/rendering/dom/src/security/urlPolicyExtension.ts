import { urlPolicyFacet } from "@input/pen-core";
import { defineExtension } from "@input/pen-core";
import { urlPolicy, type UrlPolicy } from "./urlPolicy";

/**
 * Binds the default `urlPolicy` to `pen.urlPolicy`. The wrap function
 * receives that default so a host can delegate after admitting extra schemes.
 */
export function urlPolicyExtension(
	wrap?: (defaultPolicy: UrlPolicy) => UrlPolicy,
) {
	return defineExtension({
		name: "pen-url-policy",
		version: "0.0.1",
		facets: [urlPolicyFacet.of(wrap ? wrap(urlPolicy) : urlPolicy)],
	});
}

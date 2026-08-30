import { clipboardFacet } from "@input/pen-core";
import { htmlImporter } from "@input/pen-interop/html";
import type { Extension } from "@input/pen-types";

export function htmlClipboardExtension(): Extension {
	return {
		name: "html-clipboard",
		version: "0.0.0",
		facets: [clipboardFacet.of({ html: htmlImporter })],
	};
}

import { htmlImporter } from "@input/pen-interop/html";
import type { Editor, Extension } from "@input/pen-types";

const HTML_PASTE_IMPORTERS = { html: htmlImporter };

export function htmlClipboardExtension(): Extension {
	let activeEditor: Editor | null = null;

	return {
		name: "html-clipboard",
		version: "0.0.0",
		// Not a `clipboardFacet` provider: the facet combines to a list and the
		// paste reader rejects lists, so `assignSlot` is the only channel it sees.
		activateClient: async (ctx) => {
			activeEditor = ctx.editor;
			ctx.editor.internals.assignSlot(
				"paste:importers",
				HTML_PASTE_IMPORTERS,
			);
		},
		deactivateClient: async () => {
			activeEditor?.internals.assignSlot("paste:importers", undefined);
			activeEditor = null;
		},
	};
}

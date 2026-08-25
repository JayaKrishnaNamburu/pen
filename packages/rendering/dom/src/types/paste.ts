import type { AssetProvider, Importer } from "@input/pen-types";
import type { PendingBlock } from "@input/pen-core";

export interface PasteImporters {
	html?: Importer<string, PendingBlock[]>;
	markdown?: Importer<string, PendingBlock[]>;
	assets?: AssetProvider;
}

import type { AssetProvider, Importer } from "@pen/types";
import type { PendingBlock } from "@pen/core";

export interface PasteImporters {
  html?: Importer<string, PendingBlock[]>;
  markdown?: Importer<string, PendingBlock[]>;
  assets?: AssetProvider;
}

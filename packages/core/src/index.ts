// Re-export the entire @pen/types surface
export * from "@pen/types";

// Schema engine runtime
export {
  SchemaRegistryImpl,
  mergeSchemas,
} from "./schema/registry.js";
export type { SchemaRegistryConfig } from "./schema/registry.js";

export {
  SchemaEngineImpl,
  deepEqual,
  sortDeltaAttributes,
} from "./schema/normalize.js";

export {
  createBlockHandle,
  createAppHandle,
} from "./schema/handles.js";

export { suggestion } from "./schema/system-marks/suggestion.js";

// Editor runtime
export { createEditor } from "./editor/editor.js";
export { EventEmitter } from "./editor/events.js";
export {
  createDecorationSet,
  emptyDecorationSet,
  mergeDecorationSets,
} from "./editor/decorations.js";
export { DocumentStateImpl } from "./editor/documentState.js";
export { DocumentRangeImpl } from "./editor/range.js";
export { SelectionManagerImpl } from "./editor/selection.js";
export { ExtensionManagerImpl } from "./editor/extensionManager.js";
export { ApplyPipeline } from "./editor/apply.js";

// Importer utilities (used by Wave 4 importers)
export { blocksToOps } from "./importerUtils.js";
export type { PendingBlock, ImportOptions as ImporterOptions } from "./importerUtils.js";

// Stub (to be implemented in later waves)
export { toZod } from "./toZod.js";

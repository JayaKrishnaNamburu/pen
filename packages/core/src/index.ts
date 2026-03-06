// Re-export the entire @pen/types surface
export * from "@pen/types";

// Stubs (to be implemented in later waves)
export { createEditor } from "./create-editor.js";
export { createDecorationSet, emptyDecorationSet } from "./decorations.js";
export { mergeSchemas } from "./merge-schemas.js";
export { toZod } from "./to-zod.js";

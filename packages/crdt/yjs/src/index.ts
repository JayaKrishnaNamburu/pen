export { yjsAdapter } from "./adapter.js";
export type { YjsAdapterOptions, CRDTDiagnostic } from "./adapter.js";
export {
  initBlockMap,
  isYjsCRDTDocument,
  wrapYjsDocument,
  validateDocument,
} from "./document.js";
export type {
  BlockContentType,
  YjsCRDTDocument,
  YjsPenDocument,
  DocumentValidationResult,
  DocumentValidationError,
} from "./document.js";

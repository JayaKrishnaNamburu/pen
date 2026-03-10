export { yjsAdapter } from "./adapter";
export type { YjsAdapterOptions, CRDTDiagnostic } from "./adapter";
export {
  initBlockMap,
  isYjsCRDTDocument,
  wrapYjsDocument,
  validateDocument,
} from "./document";
export type {
  BlockContentType,
  YjsCRDTDocument,
  YjsPenDocument,
  DocumentValidationResult,
  DocumentValidationError,
} from "./document";

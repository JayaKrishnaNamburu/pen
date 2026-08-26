export const PEN_DOCUMENT_JSON_VERSION = 1;

export function isSupportedPenDocumentVersion(
  value: unknown,
): value is typeof PEN_DOCUMENT_JSON_VERSION {
  return value === PEN_DOCUMENT_JSON_VERSION;
}

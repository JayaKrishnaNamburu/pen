/**
 * Ingest envelope (IOP5 / SEC4). Same numbers as the HTML / markdown /
 * JSON importers — a local copy because the shared-constant extract is
 * out of this package's fence.
 *
 * XML cannot slice to a valid document, so an oversize source is refused
 * before parse. Parse work is then O(cap), not O(input).
 */

export const INGEST_MAX_TEXT_SIZE = 1_048_576;

/**
 * Advisory IOP5 wall-clock ceiling. Not a unit-suite gate — the
 * cap-before-parse refusal is why a pathological paste finishes.
 */
export const INGEST_TIME_BUDGET_MS = 1_000;

export function capRawXmlSource(input: string): string | null {
  if (input.length <= INGEST_MAX_TEXT_SIZE) {
    return input;
  }
  return null;
}

export function assertXmlSourceWithinCap(source: string): void {
  if (source.length > INGEST_MAX_TEXT_SIZE) {
    throw new Error(
      `XML parse received ${source.length} code units; INGEST_MAX_TEXT_SIZE is ${INGEST_MAX_TEXT_SIZE}`,
    );
  }
}

/** Splits plain text into trimmed non-empty line blocks (autocomplete / AI replacement semantics). */
export function splitPlainTextLineBlocks(text: string): string[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((block) => block.trim());

  return blocks.slice(
    findFirstNonEmptyBlockIndex(blocks),
    findLastNonEmptyBlockIndex(blocks) + 1,
  );
}

/** @deprecated Use {@link splitPlainTextLineBlocks} for explicit line-block semantics. */
export const splitPlainTextBlocks = splitPlainTextLineBlocks;

function findFirstNonEmptyBlockIndex(blocks: readonly string[]): number {
  const index = blocks.findIndex((block) => block.length > 0);
  return index < 0 ? 0 : index;
}

function findLastNonEmptyBlockIndex(blocks: readonly string[]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if ((blocks[index] ?? "").length > 0) {
      return index;
    }
  }

  return -1;
}

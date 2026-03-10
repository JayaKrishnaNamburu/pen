import type { BlockHandle } from "@pen/types";

const NUMBERED_LIST_BLOCK_TYPE = "numberedListItem";

export function getNumberedListItemValue(
  block: BlockHandle | null | undefined,
): number | null {
  if (!block || block.type !== NUMBERED_LIST_BLOCK_TYPE) {
    return null;
  }

  const startOverride = getStartOverride(block);
  if (startOverride !== undefined) {
    return startOverride;
  }

  const indent = getIndent(block);
  let count = 1;
  let previousBlock = block.prev;

  while (previousBlock) {
    if (previousBlock.type !== NUMBERED_LIST_BLOCK_TYPE) {
      break;
    }

    const previousIndent = getIndent(previousBlock);
    if (previousIndent < indent) {
      break;
    }

    if (previousIndent === indent) {
      const previousStart = getStartOverride(previousBlock);
      if (previousStart !== undefined) {
        count += previousStart;
        break;
      }
      count++;
    }

    previousBlock = previousBlock.prev;
  }

  return count;
}

function getIndent(block: BlockHandle): number {
  const rawIndent = block.props?.indent;
  return typeof rawIndent === "number" && rawIndent >= 0 ? rawIndent : 0;
}

function getStartOverride(block: BlockHandle): number | undefined {
  const rawStart = block.props?.start;
  return typeof rawStart === "number" && rawStart > 0 ? rawStart : undefined;
}

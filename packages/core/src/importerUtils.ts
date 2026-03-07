import type { DocumentOp, Position } from "@pen/types";

export interface PendingBlock {
  type: string;
  props: Record<string, unknown>;
  content?: string;
  marks?: Array<{
    type: string;
    props?: Record<string, unknown>;
    start: number;
    end: number;
  }>;
  children?: PendingBlock[];
}

export interface ImportOptions {
  position?: Position;
}

/**
 * Converts PendingBlock[] into DocumentOp[] suitable for editor.apply().
 * Shared across @pen/import-markdown and @pen/import-html.
 *
 * For each block: emits insert-block, then insert-text (if content),
 * then format-text ops for each mark range. This correctly handles
 * overlapping marks (e.g. bold [0-10] with italic [3-7]).
 *
 * Table blocks with __table_row / __table_cell children are materialized
 * into the CRDT tableContent structure by the caller before reaching here,
 * so placeholder types are skipped.
 */
export function blocksToOps(
  blocks: PendingBlock[],
  options?: ImportOptions,
): DocumentOp[] {
  const ops: DocumentOp[] = [];
  let position: Position = options?.position ?? "last";

  for (const block of blocks) {
    if (block.type.startsWith("__table")) continue;

    const blockId = crypto.randomUUID();

    ops.push({
      type: "insert-block",
      blockId,
      blockType: block.type,
      props: cleanProps(block.props),
      position,
    });

    if (block.content) {
      ops.push({
        type: "insert-text",
        blockId,
        offset: 0,
        text: block.content,
      });

      for (const mark of block.marks ?? []) {
        if (mark.start >= mark.end) continue;
        ops.push({
          type: "format-text",
          blockId,
          offset: mark.start,
          length: mark.end - mark.start,
          marks: { [mark.type]: mark.props ?? true },
        });
      }
    }

    if (block.children) {
      for (let i = 0; i < block.children.length; i++) {
        const child = block.children[i];
        const childOps = blocksToOps([child], {
          position: { parent: blockId, index: i },
        });
        ops.push(...childOps);
      }
    }

    position = { after: blockId };
  }

  return ops;
}

function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

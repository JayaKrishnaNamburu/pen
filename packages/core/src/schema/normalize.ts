import type {
  Block,
  BlockSchema,
  CRDTDocument,
  InlineSchema,
  PenDocument,
  SchemaEngine,
  SchemaRegistry,
} from "@pen/types";
import type { YjsPenDocument } from "@pen/crdt-yjs";

// ── Internal Utilities ──────────────────────────────────────

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

export function sortDeltaAttributes(
  attributes: Record<string, unknown>,
  registry: SchemaRegistry,
): Record<string, unknown> {
  const keys = Object.keys(attributes);
  if (keys.length < 2) return attributes;

  const sorted = [...keys].sort((a, b) => {
    const schemaA = registry.resolveInline(a);
    const schemaB = registry.resolveInline(b);
    if (schemaA?.system || schemaB?.system) return 0;
    return (schemaA?.priority ?? 0) - (schemaB?.priority ?? 0);
  });

  const result: Record<string, unknown> = {};
  for (const key of sorted) {
    result[key] = attributes[key];
  }
  return result;
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ── SchemaEngineImpl ────────────────────────────────────────

const MAX_ITERATIONS = 1000;

export class SchemaEngineImpl implements SchemaEngine {
  private readonly registry: SchemaRegistry;
  private readonly doc: PenDocument;
  private readonly crdtDoc: CRDTDocument;
  private readonly dirtyBlockIds = new Set<string>();
  private readonly deferredBlockIds = new Set<string>();

  constructor(
    registry: SchemaRegistry,
    doc: PenDocument,
    crdtDoc: CRDTDocument,
  ) {
    this.registry = registry;
    this.doc = doc;
    this.crdtDoc = crdtDoc;
  }

  markDirty(blockId: string): void {
    this.dirtyBlockIds.add(blockId);
  }

  deferBlock(blockId: string): void {
    this.deferredBlockIds.add(blockId);
  }

  undeferBlock(blockId: string): void {
    this.deferredBlockIds.delete(blockId);
    if (this.dirtyBlockIds.has(blockId)) {
      this.normalizeBlock(blockId);
      this.dirtyBlockIds.delete(blockId);
    }
  }

  normalizeDirty(): void {
    let iterations = 0;

    while (this.dirtyBlockIds.size > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
      const snapshot = [...this.dirtyBlockIds];
      this.dirtyBlockIds.clear();

      this.doc.adapter.transact(this.crdtDoc, () => {
        for (const blockId of snapshot) {
          if (this.deferredBlockIds.has(blockId)) {
            this.dirtyBlockIds.add(blockId);
            continue;
          }
          this.normalizeBlock(blockId);
        }
      });
    }

    if (iterations >= MAX_ITERATIONS) {
      console.warn(
        "SchemaEngine: normalizeDirty exceeded max iterations. " +
          "Possible infinite normalization loop.",
      );
    }
  }

  normalizeAll(): void {
    const yjsDoc = this.doc as YjsPenDocument;
    for (const blockId of yjsDoc.blocks.keys()) {
      this.dirtyBlockIds.add(blockId);
    }
    this.normalizeDirty();
  }

  // ── normalizeBlock Pipeline ─────────────────────────────

  private normalizeBlock(blockId: string): void {
    const yjsDoc = this.doc as YjsPenDocument;
    const blockMap = yjsDoc.blocks.get(blockId);
    if (!blockMap) {
      this.handleDeletedBlock(blockId);
      return;
    }

    const type = (blockMap as any).get("type") as string;
    const schema = this.registry.resolve(type);
    if (!schema) return;

    // Phase 1: Structural rules
    this.deduplicateBlockIds(blockId);
    this.enforceCrossArrayMembership(blockId);

    // Phase 2: Block-level rules
    this.stripDefaultProps(blockId, schema);
    this.runBlockNormalize(blockId, schema);

    if (this.normalizeLayout(blockId, schema)) return;

    this.ensureNonEmptyContent(blockId, schema);

    // Phase 3: Inline content rules
    if (schema.content === "inline") {
      this.stripSuperfluousMarks(blockId);
    }
  }

  // ── Rule 2: Strip Superfluous Wrappers ──────────────────

  private stripSuperfluousMarks(blockId: string): void {
    const yjsDoc = this.doc as YjsPenDocument;
    const blockMap = yjsDoc.blocks.get(blockId);
    if (!blockMap) return;

    const content = (blockMap as any).get("content");
    if (!content || typeof content.toDelta !== "function") return;

    const deltas = content.toDelta();
    if (deltas.length < 2) return;

    let offset = 0;
    for (const delta of deltas) {
      const len =
        typeof delta.insert === "string" ? delta.insert.length : 1;
      if (delta.attributes) {
        for (const [mark, value] of Object.entries(delta.attributes)) {
          const schema = this.registry.resolveInline(mark);
          if (schema?.system) continue;
          if (value === null || value === false) {
            content.format(offset, len, { [mark]: null });
          }
        }
      }
      offset += len;
    }
  }

  // ── Rule 3: No Empty Containers ─────────────────────────

  private ensureNonEmptyContent(
    blockId: string,
    schema: BlockSchema,
  ): void {
    if (schema.content !== "inline") return;

    const yjsDoc = this.doc as YjsPenDocument;
    const blockMap = yjsDoc.blocks.get(blockId);
    if (!blockMap) return;

    let content = (blockMap as any).get("content");

    if (!content || typeof content.toDelta !== "function") {
      const ytext = this.doc.adapter.createText();
      (blockMap as any).set("content", ytext);
      content = ytext;
    }

    if (content.length > 0) return;

    content.insert(0, "\u200B");
  }

  // ── Rule 4: Strip Default Props ─────────────────────────

  private stripDefaultProps(
    blockId: string,
    schema: BlockSchema,
  ): void {
    const yjsDoc = this.doc as YjsPenDocument;
    const blockMap = yjsDoc.blocks.get(blockId);
    if (!blockMap) return;

    const props = (blockMap as any).get("props");
    if (!props) return;

    for (const [key, propSchema] of Object.entries(schema.propSchema)) {
      if (!props.has(key)) continue;
      const value = props.get(key);
      const defaultValue = (propSchema as Record<string, unknown>).default;
      if (defaultValue !== undefined && deepEqual(value, defaultValue)) {
        props.delete(key);
      }
    }
  }

  // ── Rule 5: Block-Type-Specific Normalization ───────────

  private runBlockNormalize(
    blockId: string,
    schema: BlockSchema,
  ): void {
    if (!schema.normalize) return;

    const yjsDoc = this.doc as YjsPenDocument;
    const blockMap = yjsDoc.blocks.get(blockId);
    if (!blockMap) return;

    const type = (blockMap as any).get("type") as string;
    const props = this.readPropsWithDefaults(blockMap as any, schema);
    const content = (blockMap as any).get("content");

    const block: Block = {
      id: blockId,
      type,
      props,
      content:
        content && typeof content.toString === "function"
          ? content.toString()
          : "",
    };

    const normalized = schema.normalize(block);
    if (normalized === block) return;

    const propsMap = (blockMap as any).get("props");
    if (propsMap && normalized.props !== block.props) {
      for (const [key, value] of Object.entries(normalized.props)) {
        if (!deepEqual(value, block.props[key])) {
          propsMap.set(key, value);
        }
      }
    }
  }

  // ── Rule 6: Layout Normalization ────────────────────────

  private normalizeLayout(
    blockId: string,
    schema: BlockSchema,
  ): boolean {
    if (!schema.layout) return false;

    const yjsDoc = this.doc as YjsPenDocument;
    const blockMap = yjsDoc.blocks.get(blockId);
    if (!blockMap) return false;

    const children = (blockMap as any).get("children");
    if (!children) return false;

    // Empty layout container -> collapse
    if (children.length === 0) {
      yjsDoc.blocks.delete(blockId);
      this.removeFromBlockOrder(blockId);
      return true;
    }

    // Single-child row/column -> unwrap
    const layoutMap = (blockMap as any).get("layout");
    const layoutDir = (layoutMap?.get("direction") as string) ?? "column";
    if (
      children.length === 1 &&
      (layoutDir === "row" || layoutDir === "column")
    ) {
      const childId = children.get(0);
      const idx = this.getBlockOrderIndex(blockId);
      this.removeFromBlockOrder(blockId);
      if (idx >= 0) this.insertIntoBlockOrder(childId, idx);
      yjsDoc.blocks.delete(blockId);
      this.dirtyBlockIds.add(childId);
      return true;
    }

    // Strip layout props that match defaults
    const layoutProps = (blockMap as any).get("layout");
    if (layoutProps) {
      for (const [key, value] of [...layoutProps.entries()]) {
        const defaultValue = (schema.layout as unknown as Record<string, unknown>)?.[key];
        if (defaultValue !== undefined && deepEqual(value, defaultValue)) {
          layoutProps.delete(key);
        }
      }
    }

    return false;
  }

  // ── Rule 9: No Duplicate Block IDs ──────────────────────

  private deduplicateBlockIds(blockId: string): void {
    const yjsDoc = this.doc as YjsPenDocument;
    this.deduplicateArray(yjsDoc.blockOrder, blockId);

    const blockMap = yjsDoc.blocks.get(blockId);
    const children = (blockMap as any)?.get("children");
    if (children) {
      this.deduplicateArray(children, blockId);
    }
  }

  private deduplicateArray(arr: any, targetId: string): void {
    const indices: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr.get(i) === targetId) {
        indices.push(i);
      }
    }
    if (indices.length <= 1) return;

    for (let i = indices.length - 2; i >= 0; i--) {
      arr.delete(indices[i], 1);
    }
  }

  // ── Rule 10: Orphan Promotion ───────────────────────────

  private handleDeletedBlock(blockId: string): void {
    const yjsDoc = this.doc as YjsPenDocument;
    for (const [id, blockMap] of yjsDoc.blocks.entries()) {
      const props = (blockMap as any).get("props");
      if (!props) continue;
      const parentId = props.get("parentId");
      if (parentId === blockId) {
        props.delete("parentId");
        this.dirtyBlockIds.add(id);
      }
    }
  }

  // ── Rule 11: No Cross-Array Membership ──────────────────

  private enforceCrossArrayMembership(blockId: string): void {
    const inBlockOrder = this.isInBlockOrder(blockId);
    const parentEntry = this.findParentWithChild(blockId);

    if (inBlockOrder && parentEntry) {
      this.removeFromBlockOrder(blockId);
    }
  }

  private isInBlockOrder(blockId: string): boolean {
    const yjsDoc = this.doc as YjsPenDocument;
    for (let i = 0; i < yjsDoc.blockOrder.length; i++) {
      if (yjsDoc.blockOrder.get(i) === blockId) return true;
    }
    return false;
  }

  private findParentWithChild(blockId: string): string | null {
    const yjsDoc = this.doc as YjsPenDocument;
    for (const [id, blockMap] of yjsDoc.blocks.entries()) {
      const children = (blockMap as any).get("children");
      if (!children) continue;
      for (let i = 0; i < children.length; i++) {
        if (children.get(i) === blockId) return id;
      }
    }
    return null;
  }

  // ── Block Order Helpers ─────────────────────────────────

  private removeFromBlockOrder(blockId: string): void {
    const yjsDoc = this.doc as YjsPenDocument;
    const arr = yjsDoc.blockOrder;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr.get(i) === blockId) {
        (arr as any).delete(i, 1);
        return;
      }
    }
  }

  private insertIntoBlockOrder(blockId: string, index: number): void {
    const yjsDoc = this.doc as YjsPenDocument;
    (yjsDoc.blockOrder as any).insert(index, [blockId]);
  }

  private getBlockOrderIndex(blockId: string): number {
    const yjsDoc = this.doc as YjsPenDocument;
    const arr = yjsDoc.blockOrder;
    for (let i = 0; i < arr.length; i++) {
      if (arr.get(i) === blockId) return i;
    }
    return -1;
  }

  // ── Read Helpers ────────────────────────────────────────

  private readPropsWithDefaults(
    blockMap: any,
    schema: BlockSchema,
  ): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    if (schema.propSchema) {
      for (const [key, propDef] of Object.entries(schema.propSchema)) {
        props[key] = (propDef as Record<string, unknown>).default;
      }
    }

    const raw = blockMap.get("props");
    if (raw) {
      for (const [key, value] of raw.entries()) {
        props[key] = value;
      }
    }

    return props;
  }
}

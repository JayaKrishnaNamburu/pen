import type {
  Block,
  BlockSchema,
  CRDTDocument,
  InlineSchema,
  LayoutSchema,
  PenDocument,
  SchemaEngine,
  SchemaRegistry,
} from "@pen/types";
import {
  getArrayProp,
  getMapProp,
  getTextProp,
  isCRDTMap,
  type CRDTTextLike,
  type CRDTUnknownArray,
  type CRDTUnknownMap,
} from "../editor/crdtShapes";

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

function getMapEntries(map: CRDTUnknownMap | null): Iterable<[string, unknown]> {
  return map?.entries?.() ?? [];
}

function getLayoutDefaultValue(
  layout: LayoutSchema | undefined,
  key: string,
): unknown {
  if (!layout) return undefined;

  switch (key) {
    case "modes":
      return layout.modes;
    case "defaultMode":
      return layout.defaultMode;
    case "allowedChildren":
      return layout.allowedChildren;
    case "minChildren":
      return layout.minChildren;
    case "maxChildren":
      return layout.maxChildren;
    default:
      return undefined;
  }
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
    for (const blockId of this.doc.blocks.keys()) {
      this.dirtyBlockIds.add(blockId);
    }
    this.normalizeDirty();
  }

  // ── normalizeBlock Pipeline ─────────────────────────────

  private normalizeBlock(blockId: string): void {
    const blockMap = this.getBlockMap(blockId);
    if (!blockMap) {
      this.handleDeletedBlock(blockId);
      return;
    }

    const type = blockMap.get("type") as string;
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
    const blockMap = this.getBlockMap(blockId);
    if (!blockMap) return;

    const content = getTextProp(blockMap, "content");
    if (typeof content?.toDelta !== "function") return;

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

    const blockMap = this.getBlockMap(blockId);
    if (!blockMap) return;

    let content = getTextProp(blockMap, "content");

    if (!content) {
      const ytext = this.doc.adapter.createText();
      blockMap.set("content", ytext);
      content = this.asTextLike(ytext);
    }

    if (!content || content.length > 0) return;

    content.insert(0, "\u200B");
  }

  // ── Rule 4: Strip Default Props ─────────────────────────

  private stripDefaultProps(
    blockId: string,
    schema: BlockSchema,
  ): void {
    const blockMap = this.getBlockMap(blockId);
    if (!blockMap) return;

    const props = getMapProp(blockMap, "props");
    if (!props) return;

    for (const [key, propSchema] of Object.entries(schema.propSchema)) {
      if (typeof props.has === "function") {
        if (!props.has(key)) continue;
      } else if (props.get(key) === undefined) {
        continue;
      }
      const value = props.get(key);
      const defaultValue = (propSchema as Record<string, unknown>).default;
      if (defaultValue !== undefined && deepEqual(value, defaultValue)) {
        props.delete?.(key);
      }
    }
  }

  // ── Rule 5: Block-Type-Specific Normalization ───────────

  private runBlockNormalize(
    blockId: string,
    schema: BlockSchema,
  ): void {
    if (!schema.normalize) return;

    const blockMap = this.getBlockMap(blockId);
    if (!blockMap) return;

    const type = blockMap.get("type") as string;
    const props = this.readPropsWithDefaults(blockMap, schema);
    const content = getTextProp(blockMap, "content");

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

    const propsMap = getMapProp(blockMap, "props");
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

    const blockMap = this.getBlockMap(blockId);
    if (!blockMap) return false;

    const children = getArrayProp<string>(blockMap, "children");
    if (!children) return false;

    // Empty layout container -> collapse
    if (children.length === 0) {
      this.deleteBlock(blockId);
      this.removeFromBlockOrder(blockId);
      return true;
    }

    // Single-child row/column -> unwrap
    const layoutMap = getMapProp(blockMap, "layout");
    const layoutDir = (layoutMap?.get("direction") as string) ?? "column";
    if (
      children.length === 1 &&
      (layoutDir === "row" || layoutDir === "column")
    ) {
      const childId = children.get(0);
      const idx = this.getBlockOrderIndex(blockId);
      this.removeFromBlockOrder(blockId);
      if (idx >= 0) this.insertIntoBlockOrder(childId, idx);
      this.deleteBlock(blockId);
      this.dirtyBlockIds.add(childId);
      return true;
    }

    // Strip layout props that match defaults
    const layoutProps = getMapProp(blockMap, "layout");
    if (layoutProps) {
      for (const [key, value] of [...getMapEntries(layoutProps)]) {
        const defaultValue = getLayoutDefaultValue(schema.layout, key);
        if (defaultValue !== undefined && deepEqual(value, defaultValue)) {
          layoutProps.delete?.(key);
        }
      }
    }

    return false;
  }

  // ── Rule 9: No Duplicate Block IDs ──────────────────────

  private deduplicateBlockIds(blockId: string): void {
    this.deduplicateArray(this.blockOrder, blockId);

    const blockMap = this.getBlockMap(blockId);
    const children = blockMap ? getArrayProp<string>(blockMap, "children") : null;
    if (children) {
      this.deduplicateArray(children, blockId);
    }
  }

  private deduplicateArray(arr: CRDTUnknownArray<string>, targetId: string): void {
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
    for (const [id, rawBlockMap] of this.doc.blocks.entries()) {
      if (!isCRDTMap(rawBlockMap)) continue;
      const props = getMapProp(rawBlockMap, "props");
      if (!props) continue;
      const parentId = props.get("parentId");
      if (parentId === blockId) {
        props.delete?.("parentId");
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
    for (let i = 0; i < this.blockOrder.length; i++) {
      if (this.blockOrder.get(i) === blockId) return true;
    }
    return false;
  }

  private findParentWithChild(blockId: string): string | null {
    for (const [id, rawBlockMap] of this.doc.blocks.entries()) {
      if (!isCRDTMap(rawBlockMap)) continue;
      const children = getArrayProp<string>(rawBlockMap, "children");
      if (!children) continue;
      for (let i = 0; i < children.length; i++) {
        if (children.get(i) === blockId) return id;
      }
    }
    return null;
  }

  // ── Block Order Helpers ─────────────────────────────────

  private removeFromBlockOrder(blockId: string): void {
    for (let i = this.blockOrder.length - 1; i >= 0; i--) {
      if (this.blockOrder.get(i) === blockId) {
        this.blockOrder.delete(i, 1);
        return;
      }
    }
  }

  private insertIntoBlockOrder(blockId: string, index: number): void {
    this.blockOrder.insert(index, [blockId]);
  }

  private getBlockOrderIndex(blockId: string): number {
    for (let i = 0; i < this.blockOrder.length; i++) {
      if (this.blockOrder.get(i) === blockId) return i;
    }
    return -1;
  }

  // ── Read Helpers ────────────────────────────────────────

  private readPropsWithDefaults(
    blockMap: CRDTUnknownMap,
    schema: BlockSchema,
  ): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    if (schema.propSchema) {
      for (const [key, propDef] of Object.entries(schema.propSchema)) {
        props[key] = (propDef as Record<string, unknown>).default;
      }
    }

    for (const [key, value] of getMapEntries(getMapProp(blockMap, "props"))) {
      props[key] = value;
    }

    return props;
  }

  private get blockOrder(): CRDTUnknownArray<string> {
    return this.doc.blockOrder as unknown as CRDTUnknownArray<string>;
  }

  private get blocksMap(): CRDTUnknownMap {
    return this.doc.blocks as unknown as CRDTUnknownMap;
  }

  private getBlockMap(blockId: string): CRDTUnknownMap | null {
    const blockMap = this.doc.blocks.get(blockId);
    return isCRDTMap(blockMap) ? blockMap : null;
  }

  private deleteBlock(blockId: string): void {
    this.blocksMap.delete?.(blockId);
  }

  private asTextLike(value: unknown): CRDTTextLike | null {
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { insert?: unknown }).insert === "function" &&
      typeof (value as { delete?: unknown }).delete === "function" &&
      typeof (value as { toString?: unknown }).toString === "function"
    ) {
      return value as CRDTTextLike;
    }
    return null;
  }
}

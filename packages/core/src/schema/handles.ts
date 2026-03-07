import type {
  AppPlacement,
  BlockHandle,
  AppHandle,
  CRDTDocument,
  LayoutProps,
  PenDocument,
  SchemaRegistry,
} from "@pen/types";
import type { YjsPenDocument } from "@pen/crdt-yjs";

// ── Factory Functions ───────────────────────────────────────

export function createBlockHandle(
  blockId: string,
  doc: PenDocument,
  crdtDoc: CRDTDocument,
  registry: SchemaRegistry,
): BlockHandle {
  return new BlockHandleImpl(blockId, doc, crdtDoc, registry);
}

export function createAppHandle(
  appId: string,
  doc: PenDocument,
  crdtDoc: CRDTDocument,
  registry: SchemaRegistry,
): AppHandle {
  return new AppHandleImpl(appId, doc, crdtDoc, registry);
}

// ── BlockHandleImpl ─────────────────────────────────────────

class BlockHandleImpl implements BlockHandle {
  constructor(
    private readonly _id: string,
    private readonly _doc: PenDocument,
    private readonly _crdtDoc: CRDTDocument,
    private readonly _registry: SchemaRegistry,
  ) {}

  get id(): string {
    return this._id;
  }

  get type(): string {
    return this.blockMap.get("type") as string;
  }

  get props(): Readonly<Record<string, unknown>> {
    const schema = this._registry.resolve(this.type);
    const raw = this.blockMap.get("props") as
      | Map<string, unknown>
      | undefined;
    const props: Record<string, unknown> = {};

    if (schema?.propSchema) {
      for (const [key, propDef] of Object.entries(schema.propSchema)) {
        props[key] = (propDef as Record<string, unknown>).default;
      }
    }
    if (raw) {
      for (const [key, value] of (raw as any).entries()) {
        props[key] = value;
      }
    }
    return props;
  }

  get index(): number {
    const yjsDoc = this._doc as YjsPenDocument;
    for (let i = 0; i < yjsDoc.blockOrder.length; i++) {
      if (yjsDoc.blockOrder.get(i) === this._id) return i;
    }
    return -1;
  }

  get prev(): BlockHandle | null {
    const idx = this.index;
    if (idx <= 0) return null;
    const yjsDoc = this._doc as YjsPenDocument;
    return new BlockHandleImpl(
      yjsDoc.blockOrder.get(idx - 1),
      this._doc,
      this._crdtDoc,
      this._registry,
    );
  }

  get next(): BlockHandle | null {
    const yjsDoc = this._doc as YjsPenDocument;
    const idx = this.index;
    if (idx < 0 || idx >= yjsDoc.blockOrder.length - 1) return null;
    return new BlockHandleImpl(
      yjsDoc.blockOrder.get(idx + 1),
      this._doc,
      this._crdtDoc,
      this._registry,
    );
  }

  get parent(): BlockHandle | null {
    const parentId = (this.props as Record<string, unknown>)
      .parentId as string | undefined;
    if (parentId && this._doc.blocks.has(parentId)) {
      return new BlockHandleImpl(
        parentId,
        this._doc,
        this._crdtDoc,
        this._registry,
      );
    }

    const yjsDoc = this._doc as YjsPenDocument;
    for (const [id, blockMap] of yjsDoc.blocks.entries()) {
      const children = (blockMap as any).get("children");
      if (!children) continue;
      for (let i = 0; i < children.length; i++) {
        if (children.get(i) === this._id) {
          return new BlockHandleImpl(
            id,
            this._doc,
            this._crdtDoc,
            this._registry,
          );
        }
      }
    }

    return null;
  }

  get children(): readonly BlockHandle[] {
    const result: BlockHandle[] = [];
    const yjsDoc = this._doc as YjsPenDocument;

    // parentId-based children (toggle/callout/blockquote)
    for (let i = 0; i < yjsDoc.blockOrder.length; i++) {
      const childId = yjsDoc.blockOrder.get(i);
      const childMap = yjsDoc.blocks.get(childId);
      const childProps = (childMap as any)?.get("props");
      if (childProps?.get("parentId") === this._id) {
        result.push(
          new BlockHandleImpl(
            childId,
            this._doc,
            this._crdtDoc,
            this._registry,
          ),
        );
      }
    }

    // children Y.Array (layout containers)
    const blockMap = this.blockMap;
    const childrenArr = (blockMap as any).get("children");
    if (childrenArr) {
      for (let i = 0; i < childrenArr.length; i++) {
        result.push(
          new BlockHandleImpl(
            childrenArr.get(i),
            this._doc,
            this._crdtDoc,
            this._registry,
          ),
        );
      }
    }

    return result;
  }

  // ── Traversal ─────────────────────────────────────────

  *descendants(type?: string): Iterable<BlockHandle> {
    for (const child of this.children) {
      if (!type || child.type === type) yield child;
      yield* child.descendants(type);
    }
  }

  *ancestors(): Iterable<BlockHandle> {
    let current: BlockHandle | null = this.parent;
    while (current) {
      yield current;
      current = current.parent;
    }
  }

  *siblings(): Iterable<BlockHandle> {
    const par = this.parent;
    const yjsDoc = this._doc as YjsPenDocument;
    if (par) {
      for (const child of par.children) {
        if (child.id !== this._id) yield child;
      }
    } else {
      for (let i = 0; i < yjsDoc.blockOrder.length; i++) {
        const sibId = yjsDoc.blockOrder.get(i);
        if (sibId === this._id) continue;
        const sibMap = yjsDoc.blocks.get(sibId);
        const sibProps = (sibMap as any)?.get("props");
        if (!sibProps?.get("parentId")) {
          yield new BlockHandleImpl(
            sibId,
            this._doc,
            this._crdtDoc,
            this._registry,
          );
        }
      }
    }
  }

  // ── Layout queries ────────────────────────────────────

  get layout(): LayoutProps | null {
    const blockMap = this.blockMap;
    const layoutMap = (blockMap as any).get("layout");
    if (!layoutMap) return null;
    const result: Record<string, unknown> = {};
    for (const [key, value] of layoutMap.entries()) {
      result[key] = value;
    }
    return result as unknown as LayoutProps;
  }

  get isLayoutChild(): boolean {
    return this.layoutParent() !== null;
  }

  layoutParent(): BlockHandle | null {
    const yjsDoc = this._doc as YjsPenDocument;
    for (const [id, blockMap] of yjsDoc.blocks.entries()) {
      const children = (blockMap as any).get("children");
      if (!children) continue;
      for (let i = 0; i < children.length; i++) {
        if (children.get(i) === this._id) {
          return new BlockHandleImpl(
            id,
            this._doc,
            this._crdtDoc,
            this._registry,
          );
        }
      }
    }
    return null;
  }

  // ── App queries ───────────────────────────────────────

  anchoredApps(): readonly AppHandle[] {
    const result: AppHandle[] = [];
    const yjsDoc = this._doc as YjsPenDocument;
    for (const [appId, appMap] of yjsDoc.apps.entries()) {
      const placement = (appMap as any).get("placement") as
        | AppPlacement
        | undefined;
      if (placement && "blockId" in placement && placement.blockId === this._id) {
        result.push(
          new AppHandleImpl(
            appId,
            this._doc,
            this._crdtDoc,
            this._registry,
          ),
        );
      }
    }
    return result;
  }

  // ── Content access ────────────────────────────────────

  textContent(options?: { resolved?: boolean }): string {
    const blockMap = this.blockMap;
    const content = (blockMap as any).get("content");
    if (content && typeof content.toString === "function" && typeof content.toDelta === "function") {
      const text = content.toString();
      if (text === "\u200B") return "";
      if (options?.resolved) {
        return this.resolveText(content);
      }
      return text;
    }
    return "";
  }

  textDeltas(): Array<{
    insert: string;
    attributes?: Record<string, unknown>;
  }> {
    const blockMap = this.blockMap;
    const content = (blockMap as any).get("content");
    if (content && typeof content.toDelta === "function") {
      return content.toDelta().map((d: any) => ({
        insert: typeof d.insert === "string" ? d.insert : "",
        ...(d.attributes ? { attributes: d.attributes } : {}),
      }));
    }
    return [];
  }

  length(): number {
    return this.textContent().length;
  }

  // ── Metadata ──────────────────────────────────────────

  meta(namespace: string): Readonly<Record<string, unknown>> | null {
    const metaMap = (this.blockMap as any).get("meta");
    if (!metaMap) return null;
    const nsData = metaMap.get(namespace);
    if (!nsData) return null;
    if (nsData && typeof nsData.entries === "function") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of nsData.entries()) {
        result[key] = value;
      }
      return result;
    }
    return nsData as Record<string, unknown>;
  }

  setMeta(_namespace: string, _data: Record<string, unknown>): void {
    throw new Error(
      'BlockHandle.setMeta() has been removed. Use editor.apply({ type: "set-meta", blockId, namespace, data }) instead.',
    );
  }

  // ── Internal ──────────────────────────────────────────

  private resolveText(content: any): string {
    const deltas = content.toDelta();
    let result = "";
    for (const d of deltas) {
      if (typeof d.insert !== "string") continue;
      const suggestion = d.attributes?.suggestion as
        | { action?: string }
        | undefined;
      if (suggestion?.action === "delete") continue;
      result += d.insert;
    }
    return result;
  }

  private get blockMap(): any {
    const yjsDoc = this._doc as YjsPenDocument;
    const map = yjsDoc.blocks.get(this._id);
    if (!map) throw new Error(`Block not found: ${this._id}`);
    return map;
  }
}

// ── AppHandleImpl ───────────────────────────────────────────

class AppHandleImpl implements AppHandle {
  constructor(
    private readonly _id: string,
    private readonly _doc: PenDocument,
    private readonly _crdtDoc: CRDTDocument,
    private readonly _registry: SchemaRegistry,
  ) {}

  get id(): string {
    return this._id;
  }

  get type(): string {
    return this.appMap.get("type") as string;
  }

  get placement(): AppPlacement {
    return this.appMap.get("placement") as AppPlacement;
  }

  get config(): Readonly<Record<string, unknown>> {
    const configMap = this.appMap.get("config");
    if (!configMap) return {};
    if (typeof (configMap as any).entries === "function") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of (configMap as any).entries()) {
        result[key] = value;
      }
      return result;
    }
    return {};
  }

  get anchorBlock(): BlockHandle | null {
    const placement = this.placement;
    if (placement && "blockId" in placement && placement.blockId) {
      return createBlockHandle(
        placement.blockId as string,
        this._doc,
        this._crdtDoc,
        this._registry,
      );
    }
    return null;
  }

  private get appMap(): any {
    const yjsDoc = this._doc as YjsPenDocument;
    const map = yjsDoc.apps.get(this._id);
    if (!map) throw new Error(`App not found: ${this._id}`);
    return map;
  }
}

import type {
	AppPlacement,
	BlockHandle,
	AppHandle,
	TableCellHandle,
	TableColumnSchema,
	TableRowHandle,
	DatabaseViewState,
	CRDTDocument,
	LayoutProps,
	PenDocument,
	SchemaRegistry,
} from "@pen/types";
import type { YjsPenDocument } from "@pen/crdt-yjs";
import { crdtMapToPlainRecord, crdtValueToPlain } from "../editor/crdtShapes";

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

const EMPTY_TABLE_COLUMNS: readonly TableColumnSchema[] = [];
const EMPTY_DATABASE_VIEWS: readonly DatabaseViewState[] = [];

class TableRowHandleImpl implements TableRowHandle {
	constructor(
		readonly id: string,
		readonly index: number,
	) { }
}

class BlockHandleImpl implements BlockHandle {
	constructor(
		private readonly _id: string,
		private readonly _doc: PenDocument,
		private readonly _crdtDoc: CRDTDocument,
		private readonly _registry: SchemaRegistry,
	) { }

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

	// ── Table access ──────────────────────────────────────

	tableRowCount(): number {
		if (!this.isGridBlock()) return 0;
		const tc = (this.blockMap as any).get("tableContent");
		return tc ? tc.length : 0;
	}

	tableColumnCount(): number {
		if (!this.isGridBlock()) return 0;
		const tc = (this.blockMap as any).get("tableContent");
		const structuredColumnCount = this.tableColumns().length;
		if (!tc || tc.length === 0) return structuredColumnCount;
		let rowCellCount = 0;
		for (let rowIndex = 0; rowIndex < tc.length; rowIndex++) {
			const rowMap = tc.get(rowIndex) as any;
			const cells = rowMap?.get?.("cells");
			const cellCount = cells ? cells.length : 0;
			rowCellCount = Math.max(rowCellCount, cellCount);
		}
		return Math.max(rowCellCount, structuredColumnCount);
	}

	tableRow(row: number): TableRowHandle | null {
		if (!this.isGridBlock()) return null;
		const tc = (this.blockMap as any).get("tableContent");
		if (!tc || row < 0 || row >= tc.length) return null;
		const rowMap = tc.get(row) as any;
		const id = rowMap?.get?.("id");
		if (typeof id !== "string" || id.length === 0) return null;
		return new TableRowHandleImpl(id, row);
	}

	tableCell(row: number, col: number): TableCellHandle | null {
		if (!this.isGridBlock()) return null;
		const tc = (this.blockMap as any).get("tableContent");
		if (!tc || row < 0 || row >= tc.length) return null;
		const rowMap = tc.get(row) as any;
		if (!rowMap) return null;
		const cells = rowMap.get("cells");
		if (!cells || col < 0 || col >= cells.length) return null;
		const cellMap = cells.get(col) as any;
		if (!cellMap) return null;
		return new TableCellHandleImpl(cellMap, row, col);
	}

	tableColumns(): readonly TableColumnSchema[] {
		if (this.type !== "database") return EMPTY_TABLE_COLUMNS;
		const raw = (this.blockMap as any).get("tableColumns") as unknown;
		if (!raw) return EMPTY_TABLE_COLUMNS;
		if (typeof raw === "string") {
			try {
				return JSON.parse(raw) as TableColumnSchema[];
			} catch {
				return EMPTY_TABLE_COLUMNS;
			}
		}
		if (typeof (raw as { toArray?: () => unknown[] }).toArray === "function") {
			return (raw as { toArray: () => unknown[] })
				.toArray()
				.map((column) => this.toTableColumnSchema(column))
				.filter((column): column is TableColumnSchema => column !== null);
		}
		return EMPTY_TABLE_COLUMNS;
	}

	databaseViews(): readonly DatabaseViewState[] {
		if (this.type !== "database") return EMPTY_DATABASE_VIEWS;
		const raw = (this.blockMap as any).get("databaseViews") as unknown;
		if (!raw || typeof (raw as { toArray?: () => unknown[] }).toArray !== "function") {
			return EMPTY_DATABASE_VIEWS;
		}
		return (raw as { toArray: () => unknown[] })
			.toArray()
			.map((view) => this.toDatabaseViewState(view))
			.filter((view): view is DatabaseViewState => view !== null);
	}

	databasePrimaryViewId(): string | null {
		if (this.type !== "database") return null;
		const value = (this.blockMap as any).get("databasePrimaryViewId");
		return typeof value === "string" && value.length > 0 ? value : null;
	}

	databaseActiveView(): DatabaseViewState | null {
		const primaryViewId = this.databasePrimaryViewId();
		const views = this.databaseViews();
		if (!primaryViewId) {
			return views[0] ?? null;
		}
		return views.find((view) => view.id === primaryViewId) ?? views[0] ?? null;
	}

	// ── Internal ──────────────────────────────────────────

	private isGridBlock(): boolean {
		return this.type === "table" || this.type === "database";
	}

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

	private toTableColumnSchema(column: unknown): TableColumnSchema | null {
		if (!column || typeof column !== "object") return null;
		const mapLike = column as {
			get?: (key: string) => unknown;
			entries?: () => IterableIterator<[string, unknown]>;
		};
		const id = mapLike.get?.("id");
		const title = mapLike.get?.("title");
		const type = mapLike.get?.("type");
		if (typeof id !== "string" || typeof title !== "string" || typeof type !== "string") {
			return null;
		}
		const options = this.toPlainArray(mapLike.get?.("options"));
		return {
			id,
			title,
			type: type as TableColumnSchema["type"],
			width: this.toNumber(mapLike.get?.("width")),
			hidden: this.toBoolean(mapLike.get?.("hidden")),
			pinned: this.toPinned(mapLike.get?.("pinned")),
			options,
			format: (this.toPlainObject(mapLike.get?.("format")) ?? undefined) as TableColumnSchema["format"],
			readonly: this.toBoolean(mapLike.get?.("readonly")),
		};
	}

	private toDatabaseViewState(view: unknown): DatabaseViewState | null {
		if (!view || typeof view !== "object") return null;
		const mapLike = view as {
			get?: (key: string) => unknown;
		};
		const id = mapLike.get?.("id");
		const type = mapLike.get?.("type");
		if (typeof id !== "string" || typeof type !== "string") {
			return null;
		}

		const filterValue = this.toPlainObject(mapLike.get?.("filter"));

		return {
			id,
			title: this.toString(mapLike.get?.("title")),
			type: type as DatabaseViewState["type"],
			visibleColumnIds: this.toStringArray(mapLike.get?.("visibleColumnIds")),
			columnOrder: this.toStringArray(mapLike.get?.("columnOrder")),
			sort: this.toPlainArray(mapLike.get?.("sort")) as DatabaseViewState["sort"],
			filter: (filterValue as DatabaseViewState["filter"] | null) ?? null,
			groupBy: this.toNullableString(mapLike.get?.("groupBy")),
			rowPinning: this.toDatabaseRowPinning(mapLike.get?.("rowPinning")),
			pageIndex: this.toNumber(mapLike.get?.("pageIndex")),
			pageSize: this.toNumber(mapLike.get?.("pageSize")),
		};
	}

	private toDatabaseRowPinning(value: unknown): DatabaseViewState["rowPinning"] {
		if (!value || typeof value !== "object") {
			return undefined;
		}
		const mapLike = value as {
			get?: (key: string) => unknown;
		};
		const topValues = this.toStringArray(mapLike.get?.("top"));
		const bottomValues = this.toStringArray(mapLike.get?.("bottom"));
		const top = topValues && topValues.length > 0 ? topValues : undefined;
		const bottom = bottomValues && bottomValues.length > 0 ? bottomValues : undefined;
		if (!top && !bottom) {
			return undefined;
		}
		return {
			top,
			bottom,
		};
	}

	private toPlainArray(value: unknown): TableColumnSchema["options"] {
		if (!value || typeof (value as { toArray?: () => unknown[] }).toArray !== "function") {
			return undefined;
		}
		const items = (value as { toArray: () => unknown[] }).toArray();
		return items
			.map((item) => this.toPlainValue(item))
			.filter((item): item is Record<string, unknown> => item !== null)
			.map((item) => item as unknown as NonNullable<TableColumnSchema["options"]>[number]);
	}

	private toPlainObject(value: unknown): Record<string, unknown> | null {
		return crdtMapToPlainRecord(value);
	}

	private toPlainValue(value: unknown): unknown {
		return crdtValueToPlain(value);
	}

	private toNumber(value: unknown): number | undefined {
		return typeof value === "number" ? value : undefined;
	}

	private toString(value: unknown): string | undefined {
		return typeof value === "string" ? value : undefined;
	}

	private toNullableString(value: unknown): string | null | undefined {
		if (value === null) return null;
		return typeof value === "string" ? value : undefined;
	}

	private toStringArray(value: unknown): string[] | undefined {
		if (!value || typeof (value as { toArray?: () => unknown[] }).toArray !== "function") {
			return undefined;
		}
		return (value as { toArray: () => unknown[] })
			.toArray()
			.filter((entry): entry is string => typeof entry === "string");
	}

	private toBoolean(value: unknown): boolean | undefined {
		return typeof value === "boolean" ? value : undefined;
	}

	private toPinned(value: unknown): "left" | "right" | undefined {
		return value === "left" || value === "right" ? value : undefined;
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
	) { }

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

// ── TableCellHandleImpl ────────────────────────────────────

class TableCellHandleImpl implements TableCellHandle {
	constructor(
		private readonly _cellMap: any,
		private readonly _row: number,
		private readonly _col: number,
	) { }

	get id(): string {
		return this._cellMap.get("id") as string;
	}

	get row(): number {
		return this._row;
	}

	get col(): number {
		return this._col;
	}

	textContent(): string {
		const content = this._cellMap.get("content");
		if (content && typeof content.toString === "function") {
			const text = content.toString();
			if (text === "\u200B") return "";
			return text;
		}
		return "";
	}

	length(): number {
		const content = this._cellMap.get("content");
		if (content && typeof content.toDelta === "function") {
			return content.toDelta().reduce((total: number, delta: any) => {
				if (typeof delta.insert === "string") {
					return total + delta.insert.length;
				}
				return total + 1;
			}, 0);
		}
		return this.textContent().length;
	}

	textDeltas(): Array<{
		insert: string;
		attributes?: Record<string, unknown>;
	}> {
		const content = this._cellMap.get("content");
		if (content && typeof content.toDelta === "function") {
			return content.toDelta().map((d: any) => ({
				insert: typeof d.insert === "string" ? d.insert : "",
				...(d.attributes ? { attributes: d.attributes } : {}),
			}));
		}
		return [];
	}
}


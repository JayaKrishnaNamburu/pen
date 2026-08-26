export type OverlayAffinity = "upstream" | "downstream";

export type OverlayPoint = {
	readonly blockId: string;
	readonly offset: number;
};

export type OverlayRect = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export type OverlayFlushCommit = {
	readonly commitId: number;
};

export type OverlayGeometryReader = {
	readonly generation: number;
	caretRect(point: OverlayPoint, affinity: OverlayAffinity): OverlayRect | null;
	rangeRects(range: {
		anchor: OverlayPoint;
		focus: OverlayPoint;
	}): readonly OverlayRect[];
	blockRect(blockId: string): OverlayRect | null;
};

export type OverlayTextSelection = {
	readonly type: "text";
	readonly anchor: OverlayPoint;
	readonly focus: OverlayPoint;
	readonly affinity?: OverlayAffinity;
};

export type OverlayBlockSelection = {
	readonly type: "block";
	readonly blockIds: readonly string[];
};

export type OverlaySelectionState =
	| OverlayTextSelection
	| OverlayBlockSelection
	| null;

export type OverlaySelectionRecord = {
	readonly state: OverlaySelectionState;
	readonly version?: number;
	readonly commitId?: number;
};

export type PaintPlanItemKind = "caret" | "range" | "outline";

export type PaintPlanItem = OverlayRect & {
	readonly id: string;
	readonly kind: PaintPlanItemKind;
};

export type PaintPlan = {
	readonly generation: number;
	readonly items: readonly PaintPlanItem[];
};

export type OverlayLayerOptions = {
	readonly root: HTMLElement;
};

export type OverlayLayer = {
	readonly element: HTMLElement;
	readPaintPlan(
		commits: readonly OverlayFlushCommit[],
		selection: OverlaySelectionRecord,
		reader: OverlayGeometryReader,
	): PaintPlan;
	applyPaintPlan(plan: PaintPlan): void;
	onPaintPlan(listener: (plan: PaintPlan) => void): () => void;
};

export type OverlayFlushScheduler = {
	read<T>(fn: () => T): Promise<T>;
	write(fn: () => void): Promise<void>;
	readonly phase: "idle" | "read" | "write";
};

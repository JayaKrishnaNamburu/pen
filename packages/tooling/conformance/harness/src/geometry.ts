import {
	createGeometryReader,
	DomScheduler,
	verticalCaretTarget,
	type GeometryReaderHost,
} from "@input/pen-dom";
import type { CommitEvent, Editor, Unsubscribe } from "@input/pen-types";
import {
	createOverlayLayer,
	OVERLAY_ITEM_ATTR,
	OVERLAY_LAYER_ATTR,
	type OverlayLayer,
	type PaintPlan,
} from "../../../../rendering/dom/src/overlays";
import type {
	GeometryBlockInfo,
	GeometryCaretCompare,
	GeometryCaretCompareResult,
	GeometryEightCaretBudget,
	GeometryLineBox,
	GeometryPoint,
	GeometryPointRef,
	GeometryVerticalMotion,
} from "../../src/types";
import {
	geometryBlocksFromEditor,
	normalizePoint,
	rectsEqual,
	serializeRect,
} from "./geometryCompare";

const CONTENT_SELECTOR = "[data-pen-editor-content]";
const ROOT_SELECTOR = "[data-pen-editor-root]";

type PendingInvalidation = {
	blockIds: readonly string[];
	commitId: number;
};

type GeometryHost = {
	reader: GeometryReaderHost;
	scheduler: DomScheduler;
	overlay: OverlayLayer;
	pendingCommits: CommitEvent[];
	pendingInvalidations: PendingInvalidation[];
	unsubscribers: Unsubscribe[];
};

let host: GeometryHost | null = null;

function editorRoot(): HTMLElement {
	const root = document.querySelector(ROOT_SELECTOR);
	if (!(root instanceof HTMLElement)) {
		throw new Error("geometry: editor root is not mounted");
	}
	return root;
}

function contentRoot(root: HTMLElement): HTMLElement {
	const content = root.querySelector(CONTENT_SELECTOR);
	return content instanceof HTMLElement ? content : root;
}

function serializeLineBoxes(
	blockId: string,
	reader: GeometryReaderHost,
): GeometryLineBox[] {
	return reader.lineBoxes(blockId).map((line) => ({
		top: line.top,
		bottom: line.bottom,
		startOffset: line.startOffset,
		endOffset: line.endOffset,
	}));
}

function supportedEntryTypes(): string[] {
	const observer = (
		globalThis as typeof globalThis & {
			PerformanceObserver?: { supportedEntryTypes?: readonly string[] };
		}
	).PerformanceObserver;
	return observer?.supportedEntryTypes
		? [...observer.supportedEntryTypes]
		: [];
}

function observeEntries(type: string): {
	records: PerformanceEntry[];
	take(): PerformanceEntry[];
	disconnect(): void;
} | null {
	if (typeof PerformanceObserver === "undefined") {
		return null;
	}
	if (!supportedEntryTypes().includes(type)) {
		return null;
	}
	const records: PerformanceEntry[] = [];
	const observer = new PerformanceObserver((list) => {
		records.push(...list.getEntries());
	});
	observer.observe({ type, buffered: false });
	return {
		records,
		take() {
			records.push(...observer.takeRecords());
			return records;
		},
		disconnect() {
			observer.disconnect();
		},
	};
}

function placeOverlay(layer: OverlayLayer, root: HTMLElement): void {
	if (layer.element.isConnected) {
		return;
	}
	const content = contentRoot(root);
	content.insertAdjacentElement("afterend", layer.element);
}

function attachHost(editor: Editor): GeometryHost {
	const root = editorRoot();
	const reader = createGeometryReader({
		root,
		observeResize: false,
		observeFonts: false,
	});
	const scheduler = new DomScheduler(root.id || "conformance-root", {
		geometry: reader,
	});
	const overlay = createOverlayLayer({ root });
	placeOverlay(overlay, root);

	const pendingCommits: CommitEvent[] = [];
	const pendingInvalidations: PendingInvalidation[] = [];
	const unsubscribers: Unsubscribe[] = [
		editor.on("commit", (event) => {
			pendingCommits.push(event);
		}),
		editor.on("documentCommit", (event) => {
			pendingInvalidations.push({
				blockIds: event.affectedBlocks,
				commitId: event.commitId,
			});
		}),
	];

	return {
		reader,
		scheduler,
		overlay,
		pendingCommits,
		pendingInvalidations,
		unsubscribers,
	};
}

export function disposeGeometry(): void {
	if (!host) {
		return;
	}
	for (const unsubscribe of host.unsubscribers) {
		unsubscribe();
	}
	host.reader.dispose();
	host.overlay.element.remove();
	host = null;
}

export function ensureGeometry(editor: Editor): GeometryHost {
	if (host) {
		placeOverlay(host.overlay, editorRoot());
		return host;
	}
	host = attachHost(editor);
	return host;
}

function drainCommits(current: GeometryHost): void {
	for (const event of current.pendingCommits) {
		current.scheduler.acceptCommit(event);
	}
	current.pendingCommits.length = 0;
	for (const invalidation of current.pendingInvalidations) {
		current.reader.invalidateBlocks(
			invalidation.blockIds,
			invalidation.commitId,
		);
	}
	current.pendingInvalidations.length = 0;
}

export function geometryGeneration(): number {
	return host?.reader.generation ?? 0;
}

export function invalidateGeometry(editor: Editor): void {
	ensureGeometry(editor).reader.invalidateAll();
}

export function geometryBlocks(editor: Editor): GeometryBlockInfo[] {
	return geometryBlocksFromEditor(editor);
}

export function geometryLineBoxes(
	editor: Editor,
	blockId: string,
): GeometryLineBox[] {
	const current = ensureGeometry(editor);
	return serializeLineBoxes(blockId, current.reader);
}

export function warmCaretCache(
	editor: Editor,
	points: readonly GeometryPointRef[],
): void {
	const current = ensureGeometry(editor);
	for (const ref of points) {
		const { point, affinity } = normalizePoint(ref);
		current.reader.caretRect(point, affinity);
	}
}

export async function compareCaretCache(
	editor: Editor,
	points: readonly GeometryPointRef[],
): Promise<GeometryCaretCompareResult> {
	const current = ensureGeometry(editor);
	const root = editorRoot();
	drainCommits(current);

	return current.scheduler.read(() => {
		const fresh = createGeometryReader({
			root,
			observeResize: false,
			observeFonts: false,
		});
		try {
			const compares: GeometryCaretCompare[] = points.map((ref) => {
				const { point, affinity } = normalizePoint(ref);
				const cached = serializeRect(
					current.reader.caretRect(point, affinity),
				);
				const fromScratch = serializeRect(
					fresh.caretRect(point, affinity),
				);
				return {
					point,
					affinity,
					cached,
					fromScratch,
					stale: !rectsEqual(cached, fromScratch),
				};
			});
			return {
				generation: current.reader.generation,
				rootHeight: root.getBoundingClientRect().height,
				compares,
				staleCount: compares.filter((entry) => entry.stale).length,
				missingCount: compares.filter(
					(entry) =>
						entry.cached == null || entry.fromScratch == null,
				).length,
			};
		} finally {
			fresh.dispose();
		}
	});
}

export function runVerticalMotion(
	editor: Editor,
	args: {
		situation: string;
		from: GeometryPoint;
		direction: "up" | "down";
		goalX?: number | null;
	},
): GeometryVerticalMotion {
	const current = ensureGeometry(editor);
	const first = verticalCaretTarget(
		current.reader,
		args.from,
		args.direction,
		args.goalX,
	);
	const second = verticalCaretTarget(
		current.reader,
		args.from,
		args.direction,
		args.goalX,
	);
	const fresh = createGeometryReader({
		root: editorRoot(),
		observeResize: false,
		observeFonts: false,
	});
	try {
		const fromFresh = verticalCaretTarget(
			fresh,
			args.from,
			args.direction,
			args.goalX,
		);
		return {
			situation: args.situation,
			direction: args.direction,
			from: args.from,
			goalX: args.goalX ?? null,
			first: first
				? { point: { ...first.point }, goalX: first.goalX }
				: null,
			second: second
				? { point: { ...second.point }, goalX: second.goalX }
				: null,
			fresh: fromFresh
				? { point: { ...fromFresh.point }, goalX: fromFresh.goalX }
				: null,
			lineBoxes: serializeLineBoxes(args.from.blockId, current.reader),
		};
	} finally {
		fresh.dispose();
	}
}

function paintPlanForCarets(
	reader: GeometryReaderHost,
	points: readonly GeometryPoint[],
): PaintPlan {
	return {
		generation: reader.generation,
		items: points.flatMap((point, index) => {
			const rect = reader.caretRect(point, "downstream");
			if (!rect) {
				return [];
			}
			return [
				{
					id: `remote-caret:${index}`,
					kind: "caret" as const,
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height,
				},
			];
		}),
	};
}

function countLayoutReads(
	scheduler: DomScheduler,
	onRead: (phase: DomScheduler["phase"]) => void,
): () => void {
	const restorers: Array<() => void> = [];
	const wrap = (target: object, key: string): void => {
		const original = (target as Record<string, unknown>)[key];
		if (typeof original !== "function") {
			return;
		}
		const method = original as (
			this: unknown,
			...args: unknown[]
		) => unknown;
		(target as Record<string, unknown>)[key] = function (
			this: unknown,
			...args: unknown[]
		) {
			onRead(scheduler.phase);
			return method.apply(this, args);
		};
		restorers.push(() => {
			(target as Record<string, unknown>)[key] = original;
		});
	};
	wrap(Element.prototype, "getBoundingClientRect");
	wrap(Element.prototype, "getClientRects");
	wrap(Range.prototype, "getBoundingClientRect");
	wrap(Range.prototype, "getClientRects");
	return () => {
		for (const restore of restorers) {
			restore();
		}
	};
}

export async function flushEightRemoteCarets(
	editor: Editor,
	points: readonly GeometryPoint[],
): Promise<GeometryEightCaretBudget> {
	const current = ensureGeometry(editor);
	placeOverlay(current.overlay, editorRoot());
	drainCommits(current);

	const types = supportedEntryTypes();
	const missingObserverTypes = ["layout-shift", "longtask"].filter(
		(type) => !types.includes(type),
	);
	const layoutShift = observeEntries("layout-shift");
	const longTask = observeEntries("longtask");

	let readPhase = current.scheduler.phase;
	let writePhase = current.scheduler.phase;
	let plan: PaintPlan = { generation: current.reader.generation, items: [] };
	let readPhaseMeasureCount = 0;
	let writePhaseMeasureCount = 0;
	const restoreReads = countLayoutReads(current.scheduler, (phase) => {
		if (phase === "read") {
			readPhaseMeasureCount += 1;
		} else if (phase === "write") {
			writePhaseMeasureCount += 1;
		}
	});

	try {
		const readDone = current.scheduler.read(() => {
			readPhase = current.scheduler.phase;
			plan = paintPlanForCarets(current.reader, points);
		});
		const writeDone = current.scheduler.write(() => {
			writePhase = current.scheduler.phase;
			current.overlay.applyPaintPlan(plan);
		});
		await Promise.all([readDone, writeDone]);
	} finally {
		restoreReads();
	}

	// layout-shift / longtask entries are delivered after the current task
	// and the next presented frame. same-turn takeRecords() always returns [].
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});

	const layoutShiftEntries = layoutShift?.take() ?? [];
	const longTaskEntries = longTask?.take() ?? [];
	layoutShift?.disconnect();
	longTask?.disconnect();

	return {
		caretCount: points.length,
		paintedCount: current.overlay.element.querySelectorAll(
			`[${OVERLAY_ITEM_ATTR}="caret"]`,
		).length,
		overlayConnected: current.overlay.element.isConnected,
		overlayAttr: current.overlay.element.getAttribute(OVERLAY_LAYER_ATTR),
		readPhase,
		writePhase,
		items: plan.items.map((item) => ({
			id: item.id,
			kind: item.kind,
			x: item.x,
			y: item.y,
			width: item.width,
			height: item.height,
		})),
		readPhaseMeasureCount,
		writePhaseMeasureCount,
		supportedEntryTypes: types,
		layoutShiftSupported: layoutShift != null,
		longTaskSupported: longTask != null,
		layoutShiftCount: layoutShiftEntries.length,
		longTaskCount: longTaskEntries.length,
		layoutShiftValues: layoutShiftEntries.map((entry) =>
			"value" in entry && typeof entry.value === "number"
				? entry.value
				: 0,
		),
		missingObserverTypes,
	};
}

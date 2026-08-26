import {
	createGeometryReader,
	DomScheduler,
	getRootGeometry,
	verticalCaretTarget,
	type GeometryReaderHost,
} from "@input/pen-dom";
import type { Editor } from "@input/pen-types";
import {
	createOverlayLayer,
	OVERLAY_ITEM_ATTR,
	OVERLAY_LAYER_ATTR,
	type OverlayLayer,
	type PaintPlan,
} from "./overlays";
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
	tallyCaretCompares,
} from "./geometryCompare";

const CONTENT_SELECTOR = "[data-pen-editor-content]";
const ROOT_SELECTOR = "[data-pen-editor-root]";

type GeometryHost = {
	reader: GeometryReaderHost;
	scheduler: DomScheduler;
	overlay: OverlayLayer;
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

function attachHost(): GeometryHost {
	const root = editorRoot();
	// Measure the reader and scheduler the mounted editor actually drives
	// (FE4), not a private copy of them. The field editor feeds every commit
	// to this scheduler, and its flush invalidates this reader, so there is
	// nothing for the harness to replay.
	const { reader, scheduler } = getRootGeometry(root);
	const overlay = createOverlayLayer({ root });
	placeOverlay(overlay, root);

	return { reader, scheduler, overlay };
}

export function disposeGeometry(): void {
	if (!host) {
		return;
	}
	// The reader and scheduler belong to the editor root, so the mount that
	// created them disposes them; the harness only owns the overlay.
	host.overlay.element.remove();
	host = null;
}

export function ensureGeometry(): GeometryHost {
	if (host) {
		placeOverlay(host.overlay, editorRoot());
		return host;
	}
	host = attachHost();
	return host;
}

export function geometryGeneration(): number {
	return host?.reader.generation ?? 0;
}

export function invalidateGeometry(): void {
	ensureGeometry().reader.invalidateAll();
}

export function geometryBlocks(editor: Editor): GeometryBlockInfo[] {
	return geometryBlocksFromEditor(editor);
}

export function geometryLineBoxes(blockId: string): GeometryLineBox[] {
	const current = ensureGeometry();
	return serializeLineBoxes(blockId, current.reader);
}

export function warmCaretCache(points: readonly GeometryPointRef[]): void {
	const current = ensureGeometry();
	for (const ref of points) {
		const { point, affinity } = normalizePoint(ref);
		current.reader.caretRect(point, affinity);
	}
}

export async function compareCaretCache(
	points: readonly GeometryPointRef[],
): Promise<GeometryCaretCompareResult> {
	const current = ensureGeometry();
	const root = editorRoot();

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
				...tallyCaretCompares(compares),
			};
		} finally {
			fresh.dispose();
		}
	});
}

export function runVerticalMotion(args: {
		situation: string;
		from: GeometryPoint;
		direction: "up" | "down";
		goalX?: number | null;
}): GeometryVerticalMotion {
	const current = ensureGeometry();
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
	points: readonly GeometryPoint[],
): Promise<GeometryEightCaretBudget> {
	const current = ensureGeometry();
	placeOverlay(current.overlay, editorRoot());

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

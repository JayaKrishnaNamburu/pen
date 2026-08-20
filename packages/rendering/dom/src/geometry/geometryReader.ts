import type { BlockDirection } from "../bidi";
import {
	domPointToLogicalOffset,
	findLogicalDOMPoint,
	getLogicalNodeLength,
	getLogicalTextContent,
	isInlineAtomHostNode,
	isInlineAtomNode,
} from "../field-editor/inlineAtomDom";
import { pointToEditorSelectionPoint } from "../field-editor/selectionBridge";
import { getTextSelectionClientRects } from "../field-editor/selectionBridgeOffsets";
import {
	findBlockElement,
	findInlineContentElement,
	queryBlockElement,
	queryInlineElement,
} from "../field-editor/selectionDomQueries";
import { getDistanceToRect } from "../field-editor/selectionGeometry";
import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	attachBidiRunsToLines,
	caretRectAtBidiBoundary,
	rangeRectsFromLineBoxes,
} from "./bidiRunGeometry";
import type {
	Affinity,
	BidiRun,
	GeometryReader,
	LineBox,
	Point,
	Rect,
} from "./types";
import {
	collapsedRect,
	isUsefulRect,
	rectFromDOMRect,
	unionRects,
} from "./types";

export type {
	Affinity,
	BidiRun,
	BidiRunGeometry,
	GeometryReader,
	LineBox,
	Point,
	Rect,
} from "./types";
export { verticalCaretTarget } from "./verticalCaretTarget";
export type {
	GeometryReaderWithBlocks,
	VerticalCaretTarget,
	VerticalDirection,
} from "./verticalCaretTarget";

export type GeometryMeasureAdapter = {
	caretRect?(point: Point, affinity: Affinity): Rect | null;
	rangeRects?(range: { anchor: Point; focus: Point }): readonly Rect[];
	lineBoxes?(blockId: string): readonly LineBox[];
	pointAt?(x: number, y: number): Point | null;
	blockRect?(blockId: string): Rect | null;
	blockIds?(): readonly string[];
};

export type GeometryReaderOptions = {
	root: HTMLElement;
	/** Last document commit id; per-block ids override this in the G2 key. */
	commitId?: number;
	getBlockCommitId?: (blockId: string) => number;
	measure?: GeometryMeasureAdapter;
	observeResize?: boolean;
	observeFonts?: boolean;
};

export type GeometryReaderHost = GeometryReader & {
	setCommitId(commitId: number): void;
	setBlockCommitId(blockId: string, commitId: number): void;
	/** Read-phase invalidation scan: drop entries whose blocks appear in the flush summaries. */
	invalidateBlocks(blockIds: readonly string[], commitId?: number): void;
	invalidateAll(): void;
	bumpResizeGeneration(): void;
	bumpFontGeneration(): void;
	blockIds(): readonly string[];
	dispose(): void;
};

type BlockCacheKey = {
	commitId: number;
	resizeGeneration: number;
	fontGeneration: number;
};

type BlockCacheEntry = {
	key: BlockCacheKey;
	lineBoxes?: readonly LineBox[];
	blockRect?: Rect | null;
	caretRects: Map<string, Rect | null>;
	rangeRects: Map<string, readonly Rect[]>;
};

const LINE_TOP_EPSILON = 1;

/**
 * Standalone Wave 3.2 GeometryReader. Not wired to DomScheduler or overlays.
 */
export function createGeometryReader(
	options: GeometryReaderOptions,
): GeometryReaderHost {
	return new GeometryReaderImpl(options);
}

class GeometryReaderImpl implements GeometryReaderHost {
	private readonly root: HTMLElement;
	private readonly getBlockCommitId?: (blockId: string) => number;
	private readonly measure?: GeometryMeasureAdapter;
	private readonly cache = new Map<string, BlockCacheEntry>();
	private readonly blockCommitIds = new Map<string, number>();
	private readonly resizeObserver: ResizeObserver | null = null;
	private commitId: number;
	private resizeGeneration = 0;
	private fontGeneration = 0;
	private _generation = 0;
	private disposed = false;

	constructor(options: GeometryReaderOptions) {
		this.root = options.root;
		this.commitId = options.commitId ?? 0;
		this.getBlockCommitId = options.getBlockCommitId;
		this.measure = options.measure;

		const observeResize = options.observeResize ?? true;
		if (observeResize && typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(() => {
				if (!this.disposed) {
					this.bumpResizeGeneration();
				}
			});
			this.resizeObserver.observe(this.root);
		}

		const observeFonts = options.observeFonts ?? true;
		const fonts = this.root.ownerDocument.fonts;
		if (observeFonts && fonts?.ready) {
			void fonts.ready.then(() => {
				if (!this.disposed) {
					this.bumpFontGeneration();
				}
			});
		}
	}

	get generation(): number {
		return this._generation;
	}

	caretRect(point: Point, affinity: Affinity): Rect | null {
		const entry = this.entryFor(point.blockId);
		const cacheKey = `${point.offset}:${affinity}`;
		if (entry.caretRects.has(cacheKey)) {
			return entry.caretRects.get(cacheKey) ?? null;
		}
		if (this.measure?.caretRect) {
			const rect = this.measure.caretRect(point, affinity);
			entry.caretRects.set(cacheKey, rect);
			return rect;
		}
		const fromRuns = caretRectAtBidiBoundary(
			this.lineBoxes(point.blockId),
			point.offset,
			affinity,
		);
		const rect =
			fromRuns ?? measureCaretRect(this.root, point, affinity);
		entry.caretRects.set(cacheKey, rect);
		return rect;
	}

	rangeRects(range: { anchor: Point; focus: Point }): readonly Rect[] {
		if (range.anchor.blockId !== range.focus.blockId) {
			return this.measure?.rangeRects
				? this.measure.rangeRects(range)
				: measureRangeRects(this.root, range);
		}
		const entry = this.entryFor(range.anchor.blockId);
		const cacheKey = `${range.anchor.offset}>${range.focus.offset}`;
		const cached = entry.rangeRects.get(cacheKey);
		if (cached) {
			return cached;
		}
		if (this.measure?.rangeRects) {
			const rects = this.measure.rangeRects(range);
			entry.rangeRects.set(cacheKey, rects);
			return rects;
		}
		const rects = rangeRectsFromLineBoxes(
			this.lineBoxes(range.anchor.blockId),
			range.anchor.offset,
			range.focus.offset,
			(start, end) =>
				measureRangeSlice(this.root, range.anchor.blockId, start, end),
		);
		entry.rangeRects.set(cacheKey, rects);
		return rects;
	}

	lineBoxes(blockId: string): readonly LineBox[] {
		const entry = this.entryFor(blockId);
		if (entry.lineBoxes) {
			return entry.lineBoxes;
		}
		const boxes = this.measure?.lineBoxes
			? this.measure.lineBoxes(blockId)
			: measureLineBoxes(this.root, blockId);
		entry.lineBoxes = boxes;
		return boxes;
	}

	pointAt(x: number, y: number): Point | null {
		if (this.measure?.pointAt) {
			return this.measure.pointAt(x, y);
		}
		return measurePointAt(this.root, x, y);
	}

	blockRect(blockId: string): Rect | null {
		const entry = this.entryFor(blockId);
		if (entry.blockRect !== undefined) {
			return entry.blockRect;
		}
		const rect = this.measure?.blockRect
			? this.measure.blockRect(blockId)
			: measureBlockRect(this.root, blockId);
		entry.blockRect = rect;
		return rect;
	}

	blockIds(): readonly string[] {
		if (this.measure?.blockIds) {
			return this.measure.blockIds();
		}
		return listDomBlockIds(this.root);
	}

	setCommitId(commitId: number): void {
		if (this.commitId === commitId) {
			return;
		}
		this.commitId = commitId;
		this.clearCache();
	}

	setBlockCommitId(blockId: string, commitId: number): void {
		if (this.blockCommitIds.get(blockId) === commitId) {
			return;
		}
		this.blockCommitIds.set(blockId, commitId);
		this.cache.delete(blockId);
		this._generation += 1;
	}

	invalidateBlocks(blockIds: readonly string[], commitId?: number): void {
		for (const blockId of blockIds) {
			if (commitId !== undefined) {
				this.blockCommitIds.set(blockId, commitId);
			}
			this.cache.delete(blockId);
		}
		this._generation += 1;
	}

	invalidateAll(): void {
		this.clearCache();
	}

	bumpResizeGeneration(): void {
		this.resizeGeneration += 1;
		this.clearCache();
	}

	bumpFontGeneration(): void {
		this.fontGeneration += 1;
		this.clearCache();
	}

	dispose(): void {
		this.disposed = true;
		this.resizeObserver?.disconnect();
		this.cache.clear();
	}

	private entryFor(blockId: string): BlockCacheEntry {
		const key = this.keyFor(blockId);
		const existing = this.cache.get(blockId);
		if (existing && cacheKeysEqual(existing.key, key)) {
			return existing;
		}
		if (existing) {
			this._generation += 1;
		}
		const next: BlockCacheEntry = {
			key,
			caretRects: new Map(),
			rangeRects: new Map(),
		};
		this.cache.set(blockId, next);
		return next;
	}

	private keyFor(blockId: string): BlockCacheKey {
		return {
			commitId:
				this.blockCommitIds.get(blockId) ??
				this.getBlockCommitId?.(blockId) ??
				this.commitId,
			resizeGeneration: this.resizeGeneration,
			fontGeneration: this.fontGeneration,
		};
	}

	private clearCache(): void {
		this.cache.clear();
		this._generation += 1;
	}
}

function cacheKeysEqual(left: BlockCacheKey, right: BlockCacheKey): boolean {
	return (
		left.commitId === right.commitId &&
		left.resizeGeneration === right.resizeGeneration &&
		left.fontGeneration === right.fontGeneration
	);
}

function measureCaretRect(
	root: HTMLElement,
	point: Point,
	affinity: Affinity,
): Rect | null {
	const blockEl = queryBlockElement(root, point.blockId);
	if (!blockEl) {
		return null;
	}

	const inlineEl =
		findInlineContentElement(blockEl) ??
		queryInlineElement(root, point.blockId);
	if (!inlineEl) {
		return caretFromElementRect(blockEl, affinity);
	}

	const length = getLogicalNodeLength(inlineEl);
	if (length <= 0) {
		return caretFromElementRect(inlineEl, affinity);
	}

	const offset = clampOffset(point.offset, length);
	// wave-5: swap to offsetDomain.ts
	const domPoint = findLogicalDOMPoint(inlineEl, offset);
	const atomHost = findAtomHost(domPoint.node);
	if (atomHost) {
		return caretFromElementRect(atomHost, affinity);
	}

	const collapsed = clientRectsAtPoint(root, domPoint);
	if (collapsed.length > 0 && offset > 0 && offset < length) {
		return collapsedCaretFromRects(collapsed, affinity);
	}

	const previous = offset > 0 ? characterRect(root, inlineEl, offset - 1) : null;
	const next = offset < length ? characterRect(root, inlineEl, offset) : null;
	const fromAffinity = caretFromAffinity(previous, next, affinity);
	if (fromAffinity) {
		return fromAffinity;
	}
	if (collapsed.length > 0) {
		return collapsedCaretFromRects(collapsed, affinity);
	}
	return caretFromElementRect(inlineEl, affinity);
}

function measureRangeRects(
	root: HTMLElement,
	range: { anchor: Point; focus: Point },
): readonly Rect[] {
	return getTextSelectionClientRects(root, range).map(rectFromDOMRect);
}

function measureRangeSlice(
	root: HTMLElement,
	blockId: string,
	start: number,
	end: number,
): Rect | null {
	const rects = getTextSelectionClientRects(root, {
		anchor: { blockId, offset: start },
		focus: { blockId, offset: end },
	}).map(rectFromDOMRect);
	if (rects.length === 0) {
		return null;
	}
	return unionRects(rects);
}

function readBlockDirection(
	blockEl: HTMLElement,
	inlineEl: HTMLElement | null,
): BlockDirection {
	if (inlineEl?.getAttribute("dir") === "rtl") {
		return "rtl";
	}
	if (blockEl.getAttribute("dir") === "rtl") {
		return "rtl";
	}
	return "ltr";
}

function measureLineBoxes(root: HTMLElement, blockId: string): readonly LineBox[] {
	const blockEl = queryBlockElement(root, blockId);
	if (!blockEl) {
		return [];
	}

	const inlineEl =
		findInlineContentElement(blockEl) ??
		queryInlineElement(root, blockId);
	const base = readBlockDirection(blockEl, inlineEl);
	if (!inlineEl) {
		const rect = elementRect(blockEl);
		return rect
			? attachBidiRunsToLines(
					[{ top: rect.top, bottom: rect.bottom, start: 0, end: 0, rect }],
					"",
					base,
				)
			: [];
	}

	const text = getLogicalTextContent(inlineEl);
	const length = getLogicalNodeLength(inlineEl);
	const measureRun = (run: BidiRun): Rect | null =>
		measureLogicalRange(root, inlineEl, run.from, run.to);
	const fragments = collectLineFragments(root, inlineEl);
	if (fragments.length === 0) {
		const rect = elementRect(inlineEl) ?? elementRect(blockEl);
		return rect
			? attachBidiRunsToLines(
					[
						{
							top: rect.top,
							bottom: rect.bottom,
							start: 0,
							end: length,
							rect,
						},
					],
					text,
					base,
					measureRun,
				)
			: [];
	}

	return groupFragmentsIntoLineBoxes(fragments, text, base, measureRun);
}

function measureLogicalRange(
	root: HTMLElement,
	inlineEl: HTMLElement,
	from: number,
	to: number,
): Rect | null {
	if (from >= to) {
		return null;
	}
	const start = findLogicalDOMPoint(inlineEl, from);
	const end = findLogicalDOMPoint(inlineEl, to);
	const doc = root.ownerDocument;
	const range = doc.createRange();
	try {
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
	} catch {
		// detached or out-of-range DOM points.
		return null;
	}
	const rects = readClientRects(range);
	if (rects.length === 0) {
		return null;
	}
	return unionRects(rects.map(rectFromDOMRect));
}

function measurePointAt(root: HTMLElement, x: number, y: number): Point | null {
	if (!isInsideAnyBlock(root, x, y)) {
		return nearestBlockEdge(root, x, y);
	}

	const fromCaret = hitTestCaretFromPoint(root, x, y);
	if (fromCaret) {
		// wave-5: snap through nextNormalPosition
		return fromCaret;
	}

	const fallback = pointToEditorSelectionPoint(root, x, y);
	if (fallback) {
		// wave-5: snap through nextNormalPosition
		return { blockId: fallback.blockId, offset: fallback.offset };
	}

	return nearestBlockEdge(root, x, y);
}

function measureBlockRect(root: HTMLElement, blockId: string): Rect | null {
	const blockEl = queryBlockElement(root, blockId);
	return blockEl ? elementRect(blockEl) : null;
}

function characterRect(
	root: HTMLElement,
	inlineEl: HTMLElement,
	charOffset: number,
): Rect | null {
	// wave-5: swap to offsetDomain.ts
	const start = findLogicalDOMPoint(inlineEl, charOffset);
	const end = findLogicalDOMPoint(inlineEl, charOffset + 1);
	const atomHost = findAtomHost(start.node) ?? findAtomHost(end.node);
	if (atomHost) {
		return elementRect(atomHost);
	}
	return firstClientRect(root, start, end);
}

function clientRectsAtPoint(
	root: HTMLElement,
	domPoint: { node: Node; offset: number },
): DOMRect[] {
	const doc = root.ownerDocument;
	const range = doc.createRange();
	try {
		range.setStart(domPoint.node, domPoint.offset);
		range.collapse(true);
	} catch {
		// detached or out-of-range caret point.
		return [];
	}
	return readClientRects(range);
}

function firstClientRect(
	root: HTMLElement,
	start: { node: Node; offset: number },
	end: { node: Node; offset: number },
): Rect | null {
	const doc = root.ownerDocument;
	const range = doc.createRange();
	try {
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
	} catch {
		// detached or out-of-range DOM points.
		return null;
	}
	const rects = readClientRects(range);
	const first = rects[0];
	return first ? rectFromDOMRect(first) : null;
}

function readClientRects(range: Range): DOMRect[] {
	const getter = (
		range as Range & { getClientRects?: () => DOMRectList | DOMRect[] }
	).getClientRects;
	if (typeof getter !== "function") {
		return [];
	}
	return Array.from(getter.call(range)).filter(isUsefulRect);
}

function caretFromAffinity(
	previous: Rect | null,
	next: Rect | null,
	affinity: Affinity,
): Rect | null {
	const wrapped = Boolean(
		previous && next && next.top > previous.top + LINE_TOP_EPSILON,
	);
	if (wrapped) {
		switch (affinity) {
			case "downstream":
				return next ? collapsedRect(next.left, next.top, next.height) : null;
			case "upstream":
				return previous
					? collapsedRect(previous.right, previous.top, previous.height)
					: null;
			default: {
				const _exhaustive: never = affinity;
				return _exhaustive;
			}
		}
	}

	switch (affinity) {
		case "upstream":
			if (previous) {
				return collapsedRect(previous.right, previous.top, previous.height);
			}
			return next ? collapsedRect(next.left, next.top, next.height) : null;
		case "downstream":
			if (next) {
				return collapsedRect(next.left, next.top, next.height);
			}
			return previous
				? collapsedRect(previous.right, previous.top, previous.height)
				: null;
		default: {
			const _exhaustive: never = affinity;
			return _exhaustive;
		}
	}
}

function collapsedCaretFromRects(rects: readonly DOMRect[], affinity: Affinity): Rect {
	const chosen = pickAffinityRect(rects, affinity);
	return collapsedRect(chosen.left, chosen.top, chosen.height);
}

function pickAffinityRect(rects: readonly DOMRect[], affinity: Affinity): DOMRect {
	const first = rects[0];
	const last = rects[rects.length - 1];
	if (!first) {
		return {
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			toJSON() {
				return {};
			},
		} as DOMRect;
	}
	switch (affinity) {
		case "upstream":
			return first;
		case "downstream":
			return last ?? first;
		default: {
			const _exhaustive: never = affinity;
			return _exhaustive;
		}
	}
}

function caretFromElementRect(element: HTMLElement, affinity: Affinity): Rect {
	const rect = element.getBoundingClientRect();
	const x = affinity === "upstream" ? rect.right : rect.left;
	return collapsedRect(x, rect.top, rect.height);
}

function elementRect(element: HTMLElement): Rect {
	return rectFromDOMRect(element.getBoundingClientRect());
}

function findAtomHost(node: Node): HTMLElement | null {
	let current: Node | null = node;
	while (current) {
		if (isInlineAtomHostNode(current)) {
			return current;
		}
		if (isInlineAtomNode(current)) {
			const host = current.closest(`[${DATA_ATTRS.inlineAtomHost}]`);
			return host instanceof HTMLElement ? host : current;
		}
		current = current.parentNode;
	}
	return null;
}

type LineFragment = {
	rect: Rect;
	start: number;
	end: number;
};

function collectLineFragments(
	root: HTMLElement,
	inlineEl: HTMLElement,
): LineFragment[] {
	const fragments: LineFragment[] = [];
	let offset = 0;

	const visit = (node: Node): void => {
		if (isInlineAtomHostNode(node) || isInlineAtomNode(node)) {
			const length = getLogicalNodeLength(node);
			const host = isInlineAtomHostNode(node)
				? node
				: (findAtomHost(node) ?? node);
			const rect = elementRect(host);
			if (rect) {
				fragments.push({ rect, start: offset, end: offset + length });
			}
			offset += length;
			return;
		}

		if (node.nodeType === Node.TEXT_NODE) {
			const length = getLogicalNodeLength(node);
			if (length > 0 && node instanceof Text) {
				fragments.push(
					...fragmentsForTextNode(root, inlineEl, node, offset, offset + length),
				);
			}
			offset += length;
			return;
		}

		for (const child of Array.from(node.childNodes)) {
			visit(child);
		}
	};

	visit(inlineEl);
	return fragments;
}

function fragmentsForTextNode(
	root: HTMLElement,
	inlineEl: HTMLElement,
	node: Text,
	logicalStart: number,
	logicalEnd: number,
): LineFragment[] {
	const doc = root.ownerDocument;
	const range = doc.createRange();
	try {
		range.selectNodeContents(node);
	} catch {
		// detached text node.
		return [];
	}
	const rects = readClientRects(range);
	if (rects.length === 0) {
		return [];
	}
	if (rects.length === 1 && rects[0]) {
		return [
			{
				rect: rectFromDOMRect(rects[0]),
				start: logicalStart,
				end: logicalEnd,
			},
		];
	}

	const splits = [logicalStart];
	for (let index = 1; index < rects.length; index += 1) {
		const lineTop = rects[index]?.top;
		if (lineTop === undefined) {
			splits.push(logicalEnd);
			continue;
		}
		splits.push(
			findFirstOffsetOnLine(root, inlineEl, splits[index - 1] ?? logicalStart, logicalEnd, lineTop),
		);
	}
	splits.push(logicalEnd);

	return rects.flatMap((rect, index) => {
		const start = splits[index] ?? logicalStart;
		const end = splits[index + 1] ?? logicalEnd;
		return [{ rect: rectFromDOMRect(rect), start, end }];
	});
}

function findFirstOffsetOnLine(
	root: HTMLElement,
	inlineEl: HTMLElement,
	from: number,
	to: number,
	lineTop: number,
): number {
	let lo = from;
	let hi = to;
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		const rect = characterRect(root, inlineEl, mid);
		if (rect && rect.top + LINE_TOP_EPSILON >= lineTop) {
			hi = mid;
		} else {
			lo = mid + 1;
		}
	}
	return lo;
}

function groupFragmentsIntoLineBoxes(
	fragments: readonly LineFragment[],
	text: string,
	base: BlockDirection,
	measureRun: (run: BidiRun) => Rect | null,
): LineBox[] {
	const sorted = [...fragments].sort((left, right) => {
		const top = left.rect.top - right.rect.top;
		return top !== 0 ? top : left.start - right.start;
	});

	const lines: {
		top: number;
		bottom: number;
		start: number;
		end: number;
		rects: Rect[];
	}[] = [];

	for (const fragment of sorted) {
		const last = lines[lines.length - 1];
		if (last && Math.abs(fragment.rect.top - last.top) <= LINE_TOP_EPSILON) {
			last.bottom = Math.max(last.bottom, fragment.rect.bottom);
			last.start = Math.min(last.start, fragment.start);
			last.end = Math.max(last.end, fragment.end);
			last.rects.push(fragment.rect);
			continue;
		}
		lines.push({
			top: fragment.rect.top,
			bottom: fragment.rect.bottom,
			start: fragment.start,
			end: fragment.end,
			rects: [fragment.rect],
		});
	}

	return attachBidiRunsToLines(
		lines.map((line) => ({
			top: line.top,
			bottom: line.bottom,
			start: line.start,
			end: line.end,
			rect: unionRects(line.rects),
		})),
		text,
		base,
		measureRun,
	);
}

function hitTestCaretFromPoint(
	root: HTMLElement,
	x: number,
	y: number,
): Point | null {
	const doc = root.ownerDocument as Document & {
		caretPositionFromPoint?: (
			x: number,
			y: number,
		) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};

	const position = doc.caretPositionFromPoint?.(x, y);
	if (position) {
		return domToPoint(root, position.offsetNode, position.offset);
	}

	const range = doc.caretRangeFromPoint?.(x, y);
	if (range) {
		return domToPoint(root, range.startContainer, range.startOffset);
	}

	return null;
}

function domToPoint(root: HTMLElement, node: Node, offset: number): Point | null {
	const blockEl = findBlockElement(node, root);
	if (!blockEl) {
		return null;
	}
	const blockId = blockEl.getAttribute(DATA_ATTRS.blockId);
	if (!blockId) {
		return null;
	}
	const inlineEl = findInlineContentElement(blockEl);
	if (!inlineEl) {
		return { blockId, offset: 0 };
	}
	// wave-5: swap to offsetDomain.ts
	return { blockId, offset: domPointToLogicalOffset(inlineEl, node, offset) };
}

function isInsideAnyBlock(root: HTMLElement, x: number, y: number): boolean {
	for (const element of listDomBlockElements(root)) {
		const rect = element.getBoundingClientRect();
		if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
			return true;
		}
	}
	return false;
}

function nearestBlockEdge(
	root: HTMLElement,
	x: number,
	y: number,
): Point | null {
	const blocks = listDomBlockElements(root)
		.map((el) => ({
			el,
			rect: el.getBoundingClientRect(),
			id: el.getAttribute(DATA_ATTRS.blockId),
		}))
		.filter((block): block is { el: HTMLElement; rect: DOMRect; id: string } =>
			Boolean(block.id),
		);
	if (blocks.length === 0) {
		return null;
	}

	const inBand = blocks.filter(
		(block) => y >= block.rect.top && y <= block.rect.bottom,
	);
	const candidates = inBand.length > 0 ? inBand : blocks;

	let best = candidates[0];
	if (!best) {
		return null;
	}
	let bestScore = Number.POSITIVE_INFINITY;
	for (const block of candidates) {
		const { dx, dy } = getDistanceToRect(block.rect, x, y);
		const score = inBand.length > 0 ? dx : dy * 1000 + dx;
		if (score < bestScore) {
			bestScore = score;
			best = block;
		}
	}

	const inline = findInlineContentElement(best.el);
	const length = inline ? getLogicalNodeLength(inline) : 0;
	if (y < best.rect.top) {
		return { blockId: best.id, offset: 0 };
	}
	if (y > best.rect.bottom) {
		return { blockId: best.id, offset: length };
	}
	const midX = best.rect.left + best.rect.width / 2;
	return { blockId: best.id, offset: x <= midX ? 0 : length };
}

function listDomBlockIds(root: HTMLElement): readonly string[] {
	return listDomBlockElements(root).flatMap((element) => {
		const id = element.getAttribute(DATA_ATTRS.blockId);
		return id ? [id] : [];
	});
}

function listDomBlockElements(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll(`[${DATA_ATTRS.editorBlock}]`)).filter(
		(element): element is HTMLElement => element instanceof HTMLElement,
	);
}

function clampOffset(offset: number, length: number): number {
	if (offset < 0) return 0;
	if (offset > length) return length;
	return offset;
}

import type {
	Editor,
	GenerationZone,
	CRDTMap,
	DocumentRange,
} from "@pen/types";
import { BatchingBuffer } from "./batch";

export interface StreamingTarget {
	readonly generationZone: GenerationZone | null;
	beginStreaming(zoneId: string, blockId: string): void;
	appendDelta(delta: string): void;
	endStreaming(
		status: "complete" | "cancelled" | "error",
	): void;
}

type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;

interface DeferredSchemaEngine {
	markDirty(blockId: string): void;
	deferBlock(blockId: string): void;
	undeferBlock(blockId: string): void;
}

const DEFAULT_STREAM_BATCH_INTERVAL_MS = 50;

function createPlaceholderRange(blockId: string): DocumentRange {
	return {
		start: { blockId, offset: 0 },
		end: { blockId, offset: 0 },
		get isMultiBlock() {
			return false;
		},
		get blockRange() {
			return [blockId];
		},
		contains(point) {
			return point.blockId === blockId && point.offset === 0;
		},
		overlaps(other) {
			return other.start.blockId === blockId || other.end.blockId === blockId;
		},
		equals(other) {
			return (
				other.start.blockId === blockId &&
				other.start.offset === 0 &&
				other.end.blockId === blockId &&
				other.end.offset === 0
			);
		},
		toTextSelection() {
			const range = this;
			return {
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 0 },
				get isCollapsed() {
					return true;
				},
				get isMultiBlock() {
					return false;
				},
				get blockRange() {
					return [blockId];
				},
				toRange() {
					return range;
				},
			};
		},
	};
}

export class StreamingTargetImpl implements StreamingTarget {
	private readonly _editor: Editor;
	private readonly _engine: DeferredSchemaEngine;
	private readonly _batchInterval: number;
	private _buffer: BatchingBuffer | null = null;
	private _zone: GenerationZone | null = null;
	private _blockId: string | null = null;

	constructor(
		editor: Editor,
		engine: DeferredSchemaEngine,
		batchInterval = DEFAULT_STREAM_BATCH_INTERVAL_MS,
	) {
		this._editor = editor;
		this._engine = engine;
		this._batchInterval = batchInterval;
	}

	get generationZone(): GenerationZone | null {
		return this._zone;
	}

	beginStreaming(zoneId: string, blockId: string): void {
		this._editor.undoManager.stopCapturing();

		this._blockId = blockId;
		this._zone = {
			id: zoneId,
			blockId,
			range: createPlaceholderRange(blockId),
			status: "streaming",
		};

		this._engine.deferBlock(blockId);

		this._buffer = new BatchingBuffer(
			(text) => this._flushToYText(text),
			this._batchInterval,
		);

		// Set awareness streaming state
		const awareness = this._editor.internals.awareness;
		if (awareness) {
			const local = awareness.getLocalState() ?? {};
			awareness.setLocalState({
				...local,
				streaming: { blockId, zoneId },
			});
		}
	}

	appendDelta(delta: string): void {
		if (!this._buffer || !this._blockId) return;
		this._buffer.append(delta);
	}

	endStreaming(
		status: "complete" | "cancelled" | "error",
	): void {
		this._buffer?.flush();
		this._buffer?.destroy();
		this._buffer = null;

		if (this._blockId) {
			this._engine.markDirty(this._blockId);
			this._engine.undeferBlock(this._blockId);
		}

		this._editor.undoManager.stopCapturing();

		if (this._zone) {
			const zoneStatus =
				status === "cancelled" ? "error" : status;
			this._zone = { ...this._zone, status: zoneStatus };
		}

		// Clear awareness streaming state
		const awareness = this._editor.internals.awareness;
		if (awareness) {
			const local = awareness.getLocalState() ?? {};
			const { streaming: _omit, ...rest } = local as Record<
				string,
				unknown
			>;
			awareness.setLocalState(rest);
		}

		this._blockId = null;
		this._zone = null;
	}

	private _flushToYText(text: string): void {
		if (!this._blockId) return;

		const blockMap = (
			this._editor.internals.doc.blocks as CRDTBlockMap
		).get(this._blockId);
		if (!blockMap) return;

		const content = blockMap.get("content") as
			| { length: number; insert(offset: number, text: string): void }
			| undefined;
		if (!content) return;

		const { adapter, crdtDoc } = this._editor.internals;

		adapter.transact(
			crdtDoc,
			() => {
				const len = content.length;
				content.insert(len, text);
				this._engine.markDirty(this._blockId!);
			},
			"ai",
		);
	}
}

import type { DocumentCommitEvent, DocumentOp, Editor } from "@pen/types";
import {
	DEFAULT_ALLOWED_BLOCK_TYPES,
	DEFAULT_COOLDOWN_MS,
	DEFAULT_DEBOUNCE_MS,
	DEFAULT_MIN_CHANGED_CHARS,
	DEFAULT_MIN_STABLE_MS,
} from "./constants";
import type { AISuggestionsExtensionConfig } from "./types";

export interface DirtyBlockState {
	blockId: string;
	firstChangedAt: number;
	lastChangedAt: number;
	changeCount: number;
	changedCharsEstimate: number;
	lastRevision: number;
	lastChangedOffset: number | null;
}

export interface ReadyDirtyBlock {
	blockId: string;
	state: DirtyBlockState;
}

export class AISuggestionScheduler {
	private readonly editor: Editor;
	private readonly config: AISuggestionsExtensionConfig;
	private readonly dirtyBlocks = new Map<string, DirtyBlockState>();
	private readonly lastRequestedAtByBlock = new Map<string, number>();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private onScheduledChange?: (scheduled: boolean) => void;

	constructor(
		editor: Editor,
		config: AISuggestionsExtensionConfig = {},
		options?: { onScheduledChange?: (scheduled: boolean) => void },
	) {
		this.editor = editor;
		this.config = config;
		this.onScheduledChange = options?.onScheduledChange;
	}

	destroy(): void {
		this.reset();
	}

	reset(): void {
		this.clearTimer();
		this.dirtyBlocks.clear();
		this.lastRequestedAtByBlock.clear();
		this.onScheduledChange?.(false);
	}

	markDirty(event: DocumentCommitEvent, onDebouncedReady: () => void): void {
		const now = Date.now();

		for (const blockId of event.affectedBlocks) {
			const block = this.editor.getBlock(blockId);
			if (!block || !this.isEligibleBlockType(block.type)) {
				continue;
			}

			const previous = this.dirtyBlocks.get(blockId);
			const changedCharsEstimate = estimateChangedCharsForBlock(event.ops, blockId);
			const lastChangedOffset = resolveLastChangedOffset(event.ops, blockId);

			this.dirtyBlocks.set(blockId, {
				blockId,
				firstChangedAt: previous?.firstChangedAt ?? now,
				lastChangedAt: now,
				changeCount: (previous?.changeCount ?? 0) + 1,
				changedCharsEstimate:
					(previous?.changedCharsEstimate ?? 0) + changedCharsEstimate,
				lastRevision: this.editor.getBlockRevision(blockId),
				lastChangedOffset:
					lastChangedOffset ?? previous?.lastChangedOffset ?? null,
			});
		}

		if (this.dirtyBlocks.size === 0) {
			return;
		}

		this.schedule(onDebouncedReady);
	}

	consumeNextReadyBlock(): ReadyDirtyBlock | null {
		const now = Date.now();
		const minStableMs = this.config.minStableMs ?? DEFAULT_MIN_STABLE_MS;
		const minChangedChars =
			this.config.minChangedChars ?? DEFAULT_MIN_CHANGED_CHARS;
		const cooldownMs = this.config.cooldownMs ?? DEFAULT_COOLDOWN_MS;

		const candidates = [...this.dirtyBlocks.values()]
			.filter((state) => {
				if (now - state.lastChangedAt < minStableMs) {
					return false;
				}
				if (state.changedCharsEstimate < minChangedChars) {
					return false;
				}
				const lastRequestedAt =
					this.lastRequestedAtByBlock.get(state.blockId) ?? 0;
				return now - lastRequestedAt >= cooldownMs;
			})
			.sort((left, right) => left.lastChangedAt - right.lastChangedAt);

		const next = candidates[0];
		if (!next) {
			return null;
		}

		this.lastRequestedAtByBlock.set(next.blockId, now);
		this.dirtyBlocks.delete(next.blockId);
		if (this.dirtyBlocks.size === 0) {
			this.onScheduledChange?.(false);
		}

		return {
			blockId: next.blockId,
			state: next,
		};
	}

	hasDirtyBlocks(): boolean {
		return this.dirtyBlocks.size > 0;
	}

	private schedule(onDebouncedReady: () => void): void {
		this.clearTimer();
		this.onScheduledChange?.(true);
		const debounceMs = this.config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			this.onScheduledChange?.(this.dirtyBlocks.size > 0);
			onDebouncedReady();
		}, debounceMs);
	}

	private clearTimer(): void {
		if (!this.debounceTimer) {
			return;
		}
		clearTimeout(this.debounceTimer);
		this.debounceTimer = null;
		this.onScheduledChange?.(this.dirtyBlocks.size > 0);
	}

	private isEligibleBlockType(blockType: string | null): boolean {
		const allowed =
			this.config.blockPolicy?.allowedBlockTypes ??
			DEFAULT_ALLOWED_BLOCK_TYPES;
		const denied = this.config.blockPolicy?.deniedBlockTypes ?? [];
		if (!blockType || denied.includes(blockType)) {
			return false;
		}
		return allowed.includes(blockType);
	}
}

function estimateChangedCharsForBlock(
	ops: readonly DocumentOp[],
	blockId: string,
): number {
	let changedChars = 0;

	for (const op of ops) {
		if (!targetsBlock(op, blockId)) {
			continue;
		}

		if ("text" in op && typeof op.text === "string") {
			changedChars += op.text.length;
			continue;
		}

		if ("length" in op && typeof op.length === "number") {
			changedChars += op.length;
			continue;
		}

		changedChars += 1;
	}

	return changedChars;
}

function resolveLastChangedOffset(
	ops: readonly DocumentOp[],
	blockId: string,
): number | null {
	for (let index = ops.length - 1; index >= 0; index -= 1) {
		const op = ops[index];
		if (!targetsBlock(op, blockId)) {
			continue;
		}
		if ("offset" in op && typeof op.offset === "number") {
			return op.offset;
		}
	}
	return null;
}

function targetsBlock(op: DocumentOp, blockId: string): boolean {
	return "blockId" in op && op.blockId === blockId;
}

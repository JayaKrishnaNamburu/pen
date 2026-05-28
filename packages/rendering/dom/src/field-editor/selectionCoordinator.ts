import type { SelectionState } from "@pen/types";
import type { PenFieldEditorFocusOptions } from "./controller";
import {
	FieldEditorSelectionAuthority,
	type FieldEditorSelectionSnapshot,
	type FieldEditorSelectionSource,
} from "./selectionAuthority";
import { SelectionProjectionController } from "./selectionProjectionController";

type SelectionProjectionControllerOptions = ConstructorParameters<
	typeof SelectionProjectionController
>[0];

export class FieldEditorSelectionCoordinator {
	private readonly _authority = new FieldEditorSelectionAuthority();
	private readonly _projection: SelectionProjectionController;
	private _editContextSelection: FieldEditorSelectionSnapshot | null = null;

	constructor(options: SelectionProjectionControllerOptions) {
		this._projection = new SelectionProjectionController(options);
	}

	get isApplyingSelection(): number {
		return this._authority.isApplyingSelection;
	}

	reset(): void {
		this._authority.reset();
		this._editContextSelection = null;
		this._projection.reset();
	}

	resetAuthority(): void {
		this._authority.reset();
		this._editContextSelection = null;
	}

	setAuthoritySelection(
		source: FieldEditorSelectionSource,
		selection: FieldEditorSelectionSnapshot | null,
	): void {
		this._authority.set(source, selection);
	}

	getAuthoritySelection(
		source: FieldEditorSelectionSource,
		blockId?: string | null,
	): FieldEditorSelectionSnapshot | null {
		return this._authority.get(source, blockId);
	}

	hasAuthoritySelection(source: FieldEditorSelectionSource): boolean {
		return this._authority.has(source);
	}

	clearAuthoritySelection(source: FieldEditorSelectionSource): void {
		this._authority.clear(source);
	}

	beginApplyingSelection(): () => void {
		return this._authority.beginApplyingSelection();
	}

	applySelectionUntilNextFrame(): void {
		this._authority.applySelectionUntilNextFrame();
	}

	setEditContextSelection(
		selection: FieldEditorSelectionSnapshot | null,
	): void {
		this._editContextSelection = selection;
	}

	getEditContextSelection(blockId?: string | null): FieldEditorSelectionSnapshot | null {
		if (
			!this._editContextSelection ||
			(blockId && this._editContextSelection.blockId !== blockId)
		) {
			return null;
		}
		return this._editContextSelection;
	}

	beginPointerSelection(): void {
		this._projection.beginPointerSelection();
	}

	endPointerSelection(): void {
		this._projection.endPointerSelection();
	}

	consumeDomSelectionProjectionSuppression(): boolean {
		return this._projection.consumeDomSelectionProjectionSuppression();
	}

	suppressNextDomSelectionProjection(): void {
		this._projection.suppressNextDomSelectionProjection();
	}

	shouldHandleDomSelectionChange(
		blockId: string | null,
		isApplyingSelection: number,
	): boolean {
		return this._projection.shouldHandleDomSelectionChange(
			blockId,
			isApplyingSelection,
		);
	}

	resolveProgrammaticInputRange(
		blockId: string | null,
		liveRange: { start: number; end: number } | null,
	): { start: number; end: number } | null {
		return this._projection.resolveProgrammaticInputRange(
			blockId,
			liveRange,
		);
	}

	shouldIgnoreDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): boolean {
		return this._projection.shouldIgnoreDomTextSelection(anchor, focus);
	}

	isProgrammaticDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): boolean {
		return this._projection.isProgrammaticDomTextSelection(anchor, focus);
	}

	prepareSyncedTextSelection(
		currentSelection: SelectionState | null,
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): "skip" | "apply" {
		return this._projection.prepareSyncedTextSelection(
			currentSelection,
			blockId,
			anchorOffset,
			focusOffset,
		);
	}

	notifyTextSelectionSet(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		this._projection.notifyTextSelectionSet(
			blockId,
			anchorOffset,
			focusOffset,
		);
	}

	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: PenFieldEditorFocusOptions,
	): void {
		this._projection.activateTextSelection(
			blockId,
			anchorOffset,
			focusOffset,
			options,
		);
	}

	commitProgrammaticTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: PenFieldEditorFocusOptions,
	): void {
		this._projection.commitProgrammaticTextSelection(
			blockId,
			anchorOffset,
			focusOffset,
			options,
		);
	}

	syncDomSelectionOnce(): void {
		this._projection.syncDomSelectionOnce();
	}

	shouldProjectSelectionAfterReconcile(): boolean {
		return this._projection.shouldProjectSelectionAfterReconcile();
	}

	recordUserSelectionIntent(): void {
		this._projection.recordUserSelectionIntent();
	}

	shouldSuppressSelectionSync(): boolean {
		return this._projection.shouldSuppressSelectionSync();
	}
}

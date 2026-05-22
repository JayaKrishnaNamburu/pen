import type { SelectionState } from "@pen/types";
import type { PenFieldEditorFocusOptions } from "./controller";
import type { HistorySelectionCoordinator } from "./historySelectionCoordinator";

type ProgrammaticTextSelection = {
	blockId: string;
	anchorOffset: number;
	focusOffset: number;
	selectionIntentEpoch: number;
};

type ProjectionOptions = {
	syncBackendImmediately?: boolean;
} & PenFieldEditorFocusOptions;

type SelectionProjectionControllerOptions = {
	historySelectionCoordinator: HistorySelectionCoordinator;
	isEditing: () => boolean;
	getMode: () => "inactive" | "single" | "expanded" | "block";
	getFocusBlockId: () => string | null;
	getAttachedElement: () => HTMLElement | null;
	getRootElement: () => HTMLElement | null;
	findExpandedHost: () => HTMLElement | null;
	resolveInlineElement: (blockId: string) => HTMLElement | null;
	attachElement: (
		element: HTMLElement,
		options?: PenFieldEditorFocusOptions,
	) => boolean;
	requestDomFocus: (
		target: HTMLElement,
		reason: "selection-project",
		options?: FocusOptions,
		policyOptions?: PenFieldEditorFocusOptions,
	) => boolean;
	updateBackendSelection: () => void;
	setTextSelection: (
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	) => void;
	activate: (blockId: string) => void;
	emitSelectionProjected: () => void;
};

export class SelectionProjectionController {
	private readonly _historySelectionCoordinator: HistorySelectionCoordinator;
	private readonly _options: SelectionProjectionControllerOptions;
	private _syncDomVersion = 0;
	private _suppressNextDomSelectionProjection = false;
	private _pointerSelectionDepth = 0;
	private _pendingSelectionProjectionVersion: number | null = null;
	private _selectionIntentEpoch = 0;
	private _programmaticTextSelection: ProgrammaticTextSelection | null = null;
	private _pendingProgrammaticTextSelection: ProgrammaticTextSelection | null =
		null;
	private _committedProgrammaticTextSelection: ProgrammaticTextSelection | null =
		null;

	constructor(options: SelectionProjectionControllerOptions) {
		this._historySelectionCoordinator = options.historySelectionCoordinator;
		this._options = options;
	}

	reset(): void {
		this._suppressNextDomSelectionProjection = false;
		this._programmaticTextSelection = null;
		this._pendingProgrammaticTextSelection = null;
		this._committedProgrammaticTextSelection = null;
		this._pointerSelectionDepth = 0;
		this._pendingSelectionProjectionVersion = null;
	}

	beginPointerSelection(): void {
		this.recordUserSelectionIntent();
		this._pointerSelectionDepth += 1;
	}

	endPointerSelection(): void {
		if (this._pointerSelectionDepth === 0) {
			return;
		}
		this._pointerSelectionDepth -= 1;
		this.recordUserSelectionIntent();
	}

	consumeDomSelectionProjectionSuppression(): boolean {
		const shouldSuppress = this._suppressNextDomSelectionProjection;
		this._suppressNextDomSelectionProjection = false;
		return shouldSuppress;
	}

	suppressNextDomSelectionProjection(): void {
		this._suppressNextDomSelectionProjection = true;
	}

	shouldHandleDomSelectionChange(
		blockId: string | null,
		isApplyingSelection: number,
	): boolean {
		const hasProgrammaticSelection =
			this._getActiveProgrammaticTextSelection(blockId) !== null;
		const hasPendingProjection =
			this._pendingSelectionProjectionVersion !== null;
		return (
			isApplyingSelection === 0 &&
			this._pointerSelectionDepth === 0 &&
			(hasProgrammaticSelection ||
				hasPendingProjection ||
				!this._historySelectionCoordinator.shouldSuppressSelectionSync())
		);
	}

	resolveProgrammaticInputRange(
		blockId: string | null,
		liveRange: { start: number; end: number } | null,
	): { start: number; end: number } | null {
		const programmaticSelection =
			this._getActiveProgrammaticTextSelection(blockId);
		if (!programmaticSelection) {
			return null;
		}
		if (!liveRange) {
			this._clearProgrammaticTextSelections();
			return {
				start: programmaticSelection.anchorOffset,
				end: programmaticSelection.focusOffset,
			};
		}
		if (
			liveRange.start === liveRange.end &&
			(liveRange.start !== programmaticSelection.anchorOffset ||
				liveRange.end !== programmaticSelection.focusOffset)
		) {
			this._clearProgrammaticTextSelections();
			return {
				start: programmaticSelection.anchorOffset,
				end: programmaticSelection.focusOffset,
			};
		}
		return null;
	}

	shouldIgnoreDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): boolean {
		const programmaticSelection = this._getActiveProgrammaticTextSelection(
			anchor.blockId,
		);
		if (!programmaticSelection || anchor.blockId !== focus.blockId) {
			return false;
		}
		if (
			anchor.offset === programmaticSelection.anchorOffset &&
			focus.offset === programmaticSelection.focusOffset
		) {
			return false;
		}
		return anchor.offset === focus.offset;
	}

	isProgrammaticDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): boolean {
		const programmaticSelection = this._getActiveProgrammaticTextSelection(
			anchor.blockId,
		);
		return (
			programmaticSelection != null &&
			anchor.blockId === focus.blockId &&
			anchor.offset === programmaticSelection.anchorOffset &&
			focus.offset === programmaticSelection.focusOffset
		);
	}

	prepareSyncedTextSelection(
		currentSelection: SelectionState | null,
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): "skip" | "apply" {
		const pendingProgrammaticSelection =
			this._pendingProgrammaticTextSelection;
		const isAlreadyCurrentSelection =
			currentSelection?.type === "text" &&
			!currentSelection.isMultiBlock &&
			currentSelection.anchor.blockId === blockId &&
			currentSelection.focus.blockId === blockId &&
			currentSelection.anchor.offset === anchorOffset &&
			currentSelection.focus.offset === focusOffset;
		if (isAlreadyCurrentSelection) {
			if (
				pendingProgrammaticSelection &&
				pendingProgrammaticSelection.blockId === blockId &&
				pendingProgrammaticSelection.anchorOffset === anchorOffset &&
				pendingProgrammaticSelection.focusOffset === focusOffset
			) {
				this._pendingProgrammaticTextSelection = null;
			}
			return "skip";
		}

		if (
			pendingProgrammaticSelection &&
			(pendingProgrammaticSelection.blockId !== blockId ||
				pendingProgrammaticSelection.anchorOffset !== anchorOffset ||
				pendingProgrammaticSelection.focusOffset !== focusOffset)
		) {
			this.recordUserSelectionIntent();
		} else if (!pendingProgrammaticSelection) {
			this._selectionIntentEpoch += 1;
		}
		return "apply";
	}

	notifyTextSelectionSet(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		const programmaticSelection = this._programmaticTextSelection;
		if (
			programmaticSelection &&
			(programmaticSelection.blockId !== blockId ||
				programmaticSelection.anchorOffset !== anchorOffset ||
				programmaticSelection.focusOffset !== focusOffset)
		) {
			this._programmaticTextSelection = null;
		}
		const pendingProgrammaticSelection =
			this._pendingProgrammaticTextSelection;
		if (
			pendingProgrammaticSelection &&
			(pendingProgrammaticSelection.blockId !== blockId ||
				pendingProgrammaticSelection.anchorOffset !== anchorOffset ||
				pendingProgrammaticSelection.focusOffset !== focusOffset)
		) {
			this._pendingProgrammaticTextSelection = null;
		}
		if (
			programmaticSelection &&
			programmaticSelection.blockId === blockId &&
			programmaticSelection.anchorOffset === anchorOffset &&
			programmaticSelection.focusOffset === focusOffset
		) {
			this._committedProgrammaticTextSelection = programmaticSelection;
		}
	}

	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: PenFieldEditorFocusOptions,
	): void {
		this._programmaticTextSelection = null;
		this._pendingProgrammaticTextSelection = null;
		this._committedProgrammaticTextSelection = null;
		this.projectTextSelection(blockId, anchorOffset, focusOffset, options);
	}

	commitProgrammaticTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options: PenFieldEditorFocusOptions = {},
	): void {
		this._programmaticTextSelection = {
			blockId,
			anchorOffset,
			focusOffset,
			selectionIntentEpoch: this._selectionIntentEpoch,
		};
		this._pendingProgrammaticTextSelection = {
			blockId,
			anchorOffset,
			focusOffset,
			selectionIntentEpoch: this._selectionIntentEpoch,
		};
		this._committedProgrammaticTextSelection = null;
		this.projectTextSelection(blockId, anchorOffset, focusOffset, {
			...options,
			syncBackendImmediately: true,
		});
	}

	projectTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: ProjectionOptions,
	): void {
		this._options.setTextSelection(blockId, anchorOffset, focusOffset);

		if (
			!this._options.isEditing() ||
			this._options.getFocusBlockId() !== blockId
		) {
			this._options.activate(blockId);
		}

		if (options?.syncBackendImmediately ?? true) {
			this._options.updateBackendSelection();
		}
		this.syncDomSelectionOnce(4, undefined, options);
	}

	syncDomSelectionOnce(
		remainingAttempts = 4,
		version?: number,
		options: PenFieldEditorFocusOptions = {},
		selectionIntentEpoch = this._selectionIntentEpoch,
	): void {
		if (version === undefined) {
			version = ++this._syncDomVersion;
			this._pendingSelectionProjectionVersion = version;
		}
		const v = version;
		requestAnimationFrame(() => {
			if (!this._options.isEditing() || this._syncDomVersion !== v)
				return;
			if (selectionIntentEpoch !== this._selectionIntentEpoch) {
				this._cancelSelectionProjection(v);
				return;
			}

			let projected = false;
			const pendingProjectionRequestId =
				this._historySelectionCoordinator.getPendingProjectionRequestId();

			if (this._options.getMode() === "expanded") {
				const expandedHost = this._options.findExpandedHost();
				if (expandedHost) {
					projected = this._projectIntoElement(expandedHost, options);
				}
			} else {
				const focusBlockId = this._options.getFocusBlockId();
				if (focusBlockId) {
					const inlineEl =
						this._options.resolveInlineElement(focusBlockId);
					if (inlineEl) {
						projected = this._projectIntoElement(inlineEl, options);
					}
				}
			}

			if (projected) {
				this._options.emitSelectionProjected();
				requestAnimationFrame(() => {
					if (this._syncDomVersion === v) {
						if (this._pendingSelectionProjectionVersion === v) {
							this._pendingSelectionProjectionVersion = null;
						}
						this._historySelectionCoordinator.completeDeferredProjection(
							pendingProjectionRequestId,
						);
					}
				});
			}

			if (!projected && remainingAttempts > 0) {
				this.syncDomSelectionOnce(
					remainingAttempts - 1,
					v,
					options,
					selectionIntentEpoch,
				);
			} else if (!projected) {
				this._cancelSelectionProjection(v);
			}
		});
	}

	shouldProjectSelectionAfterReconcile(): boolean {
		const attachedElement = this._options.getAttachedElement();
		if (!attachedElement) {
			return false;
		}

		const ownerDocument = attachedElement.ownerDocument;
		const activeElement = ownerDocument?.activeElement;
		if (!(activeElement instanceof Node)) {
			return true;
		}
		if (activeElement === ownerDocument?.body) {
			return true;
		}

		const root = this._options.getRootElement();
		if (!root || !root.contains(activeElement)) {
			return true;
		}

		return attachedElement.contains(activeElement);
	}

	recordUserSelectionIntent(): void {
		this._selectionIntentEpoch += 1;
		this._clearProgrammaticTextSelections();
		const pendingProjectionVersion =
			this._pendingSelectionProjectionVersion;
		if (pendingProjectionVersion !== null) {
			this._syncDomVersion += 1;
			this._cancelSelectionProjection(pendingProjectionVersion);
		}
	}

	shouldSuppressSelectionSync(): boolean {
		return (
			this._historySelectionCoordinator.shouldSuppressSelectionSync() ||
			this._pendingSelectionProjectionVersion !== null
		);
	}

	private _projectIntoElement(
		element: HTMLElement,
		options: PenFieldEditorFocusOptions,
	): boolean {
		let didAttach = true;
		const attachedElement = this._options.getAttachedElement();
		if (attachedElement !== element || !attachedElement?.isConnected) {
			didAttach = this._options.attachElement(element, options);
		}
		if (
			didAttach &&
			this._options.requestDomFocus(
				element,
				"selection-project",
				{
					preventScroll: true,
				},
				options,
			)
		) {
			this._options.updateBackendSelection();
			return true;
		}
		return false;
	}

	private _cancelSelectionProjection(version: number): void {
		if (this._pendingSelectionProjectionVersion === version) {
			this._pendingSelectionProjectionVersion = null;
		}
		this._historySelectionCoordinator.cancelDeferredProjection();
	}

	private _getActiveProgrammaticTextSelection(
		blockId: string | null,
	): ProgrammaticTextSelection | null {
		const programmaticSelection =
			this._programmaticTextSelection ??
			this._pendingProgrammaticTextSelection ??
			this._committedProgrammaticTextSelection;
		if (!blockId || programmaticSelection?.blockId !== blockId) {
			return null;
		}
		return programmaticSelection;
	}

	private _clearProgrammaticTextSelections(): void {
		this._programmaticTextSelection = null;
		this._pendingProgrammaticTextSelection = null;
		this._committedProgrammaticTextSelection = null;
	}
}

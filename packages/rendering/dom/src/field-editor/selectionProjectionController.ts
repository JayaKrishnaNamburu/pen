import { isMultiBlock } from "@input/pen-core";
import type { DiagnosticEvent, SelectionState } from "@input/pen-types";
import type { PenFieldEditorFocusOptions } from "./controller";
import type { HistorySelectionCoordinator } from "./historySelectionCoordinator";
import {
	CLOSED_GESTURE_WINDOWS,
	isAdmissibleDomRead,
	nextGestureWindowState,
	type GestureEventKind,
	type GestureWindowState,
} from "./selectionReader";

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
	getRecordVersion?: () => number;
	emitDiagnostic?: (event: DiagnosticEvent) => void;
};

export class SelectionProjectionController {
	private readonly _historySelectionCoordinator: HistorySelectionCoordinator;
	private readonly _options: SelectionProjectionControllerOptions;
	private _syncDomVersion = 0;
	private _pointerSelectionDepth = 0;
	private _gestureWindows: GestureWindowState = CLOSED_GESTURE_WINDOWS;
	private _pointerSettledBound = false;
	private _pendingSelectionProjectionVersion: number | null = null;
	private _selectionIntentEpoch = 0;
	private _programmaticTextSelection: ProgrammaticTextSelection | null = null;
	private _pendingProgrammaticTextSelection: ProgrammaticTextSelection | null =
		null;
	private _committedProgrammaticTextSelection: ProgrammaticTextSelection | null =
		null;
	private _lastProjectedVersion = 0;
	private _parked: { version: number; blockId: string | null } | null = null;

	constructor(options: SelectionProjectionControllerOptions) {
		this._historySelectionCoordinator = options.historySelectionCoordinator;
		this._options = options;
	}

	reset(): void {
		this._programmaticTextSelection = null;
		this._pendingProgrammaticTextSelection = null;
		this._committedProgrammaticTextSelection = null;
		this._pointerSelectionDepth = 0;
		this._pendingSelectionProjectionVersion = null;
		this._gestureWindows = CLOSED_GESTURE_WINDOWS;
		this._pointerSettledBound = false;
	}

	get lastProjectedVersion(): number {
		return this._lastProjectedVersion;
	}

	recordProjectedVersion(version: number): void {
		this._lastProjectedVersion = version;
	}

	get parkedProjectionVersion(): number | null {
		return this._parked?.version ?? null;
	}

	ackBlockMounted(_blockId: string, _element: HTMLElement): void {
		if (this._parked == null) {
			return;
		}
		this.syncDomSelectionOnce();
	}

	peekProgrammaticTextSelection(): ProgrammaticTextSelection | null {
		const current = this._readProgrammaticTextSelection();
		if (!current) {
			return null;
		}
		return { ...current };
	}

	restoreProgrammaticTextSelection(
		selection: ProgrammaticTextSelection,
	): void {
		this._programmaticTextSelection = { ...selection };
		this._pendingProgrammaticTextSelection = { ...selection };
	}

	beginPointerSelection(): void {
		this.recordUserSelectionIntent();
		this._pointerSelectionDepth += 1;
		this.notifyGestureEvent("pointerdown");
	}

	endPointerSelection(): void {
		if (this._pointerSelectionDepth === 0) {
			this.notifyGestureEvent("pointerup");
			return;
		}
		this._pointerSelectionDepth -= 1;
		this.recordUserSelectionIntent();
		if (this._pointerSelectionDepth === 0) {
			this.notifyGestureEvent("pointerup");
		}
	}

	consumeDomSelectionProjectionSuppression(): boolean {
		return false;
	}

	suppressNextDomSelectionProjection(): void {}

	notifyGestureEvent(eventKind: GestureEventKind): void {
		this._gestureWindows = nextGestureWindowState(
			eventKind,
			this._gestureWindows,
		);
		if (eventKind === "pointerdown") {
			this._bindPointerSettled();
		}
		if (eventKind === "pointerup") {
			this._schedulePointerSettled();
		}
	}

	getGestureWindows(): GestureWindowState {
		return this._gestureWindows;
	}

	isAdmissibleGestureRead(): boolean {
		return isAdmissibleDomRead("selectionchange", this._gestureWindows);
	}

	isProjectionInFlight(): boolean {
		return this._pendingSelectionProjectionVersion !== null;
	}

	requestDivergenceProjection(): void {
		this.syncDomSelectionOnce();
	}

	shouldHandleDomSelectionChange(
		_blockId: string | null,
		isApplyingSelection: number,
	): boolean {
		return isApplyingSelection === 0;
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
		_focus: { blockId: string; offset: number },
	): boolean {
		return (
			this._getProgrammaticTextSelectionOnOtherBlock(anchor.blockId) !=
			null
		);
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
			!isMultiBlock(currentSelection) &&
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
		this.syncDomSelectionOnce(options);
	}

	syncDomSelectionOnce(options: PenFieldEditorFocusOptions = {}): void {
		const version = ++this._syncDomVersion;
		this._pendingSelectionProjectionVersion = version;

		if (!this._options.isEditing()) {
			this._cancelSelectionProjection(version);
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
				const inlineEl = this._options.resolveInlineElement(focusBlockId);
				if (inlineEl) {
					projected = this._projectIntoElement(inlineEl, options);
				}
			}
		}

		if (projected) {
			this._parked = null;
			const recordVersion = this._options.getRecordVersion?.();
			if (recordVersion != null) {
				this._lastProjectedVersion = recordVersion;
			}
			this._options.emitSelectionProjected();
			if (this._pendingSelectionProjectionVersion === version) {
				this._pendingSelectionProjectionVersion = null;
			}
			this._historySelectionCoordinator.completeDeferredProjection(
				pendingProjectionRequestId,
			);
			return;
		}

		this._cancelSelectionProjection(version);
		this._parkProjection();
	}

	private _parkProjection(): void {
		const recordVersion = this._options.getRecordVersion?.() ?? 0;
		this._parked = {
			version: recordVersion,
			blockId: this._options.getFocusBlockId(),
		};
		this._options.emitDiagnostic?.({
			code: "selection-target-unmounted",
			level: "warn",
			source: "selection",
			message: "selection target is not mounted; projection parked",
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
		return false;
	}

	private _bindPointerSettled(): void {
		if (this._pointerSettledBound) {
			return;
		}
		const root = this._options.getRootElement();
		const doc = root?.ownerDocument ?? globalThis.document;
		if (typeof doc?.addEventListener !== "function") {
			return;
		}
		this._pointerSettledBound = true;
		const onUp = (): void => {
			doc.removeEventListener("pointerup", onUp);
			this._pointerSettledBound = false;
			this.notifyGestureEvent("pointerup");
		};
		doc.addEventListener("pointerup", onUp);
	}

	private _schedulePointerSettled(): void {
		queueMicrotask(() => {
			this._gestureWindows = nextGestureWindowState(
				"pointer-settled",
				this._gestureWindows,
			);
		});
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
		const programmaticSelection = this._readProgrammaticTextSelection();
		if (!blockId || programmaticSelection?.blockId !== blockId) {
			return null;
		}
		return programmaticSelection;
	}

	private _getProgrammaticTextSelectionOnOtherBlock(
		blockId: string | null,
	): ProgrammaticTextSelection | null {
		const programmaticSelection = this._readProgrammaticTextSelection();
		if (!programmaticSelection || programmaticSelection.blockId === blockId) {
			return null;
		}
		return programmaticSelection;
	}

	private _readProgrammaticTextSelection(): ProgrammaticTextSelection | null {
		return (
			this._programmaticTextSelection ??
			this._pendingProgrammaticTextSelection ??
			this._committedProgrammaticTextSelection
		);
	}

	private _clearProgrammaticTextSelections(): void {
		this._programmaticTextSelection = null;
		this._pendingProgrammaticTextSelection = null;
		this._committedProgrammaticTextSelection = null;
	}
}

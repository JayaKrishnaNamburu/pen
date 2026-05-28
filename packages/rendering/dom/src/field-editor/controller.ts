import type { BlockSchema, Editor, FieldEditorFocusOptions } from "@pen/types";
import type { FieldEditorStore } from "./store";
import type { EditorSelectAllBehavior } from "../constants/selectAll";
import type {
	FieldEditorSelectionSnapshot,
	FieldEditorSelectionSource,
} from "./selectionAuthority";

export type FieldEditorFocusReason =
	| "activate"
	| "backend-activate"
	| "backend-attach"
	| "selection-project"
	| "selection-activate"
	| "selection-sync"
	| "restore"
	| "cell"
	| "select-all";

export type PenFocusAction =
	| "activate"
	| "attach-backend"
	| "focus-dom"
	| "project-selection"
	| "restore"
	| "select-all";

export type PenFocusReason = NonNullable<FieldEditorFocusOptions["reason"]>;

export type PenFocusDecision =
	| { type: "allow" }
	| { type: "allow-passive" }
	| { type: "deny" };

export interface FieldEditorFocusRequest {
	editor: Editor;
	target: HTMLElement;
	root: HTMLElement | null;
	reason: FieldEditorFocusReason;
	action: PenFocusAction;
	source: PenFocusReason;
	blockId: string | null;
	passive?: boolean;
}

export type PenFocusRequest = FieldEditorFocusRequest;

export interface PenFocusPolicy {
	decide(request: FieldEditorFocusRequest): PenFocusDecision;
	onDenied?(request: FieldEditorFocusRequest): void;
}

export type PenFieldEditorFocusOptions = FieldEditorFocusOptions;

export type PenFocusLifecycleEvent =
	| {
			type: "field-editor-attached";
			editor: Editor;
			root: HTMLElement | null;
	  }
	| {
			type: "backend-attach-started" | "backend-attach-completed";
			editor: Editor;
			target: HTMLElement;
			blockId: string | null;
	  }
	| {
			type: "selection-projected";
			editor: Editor;
			blockId: string | null;
	  }
	| {
			type: "focus-request-denied";
			request: FieldEditorFocusRequest;
	  }
	| {
			type: "activation-changed";
			editor: Editor;
			activeBlockIds: readonly string[];
			isEditing: boolean;
	  };

export type PenFocusLifecycleListener = (
	event: PenFocusLifecycleEvent,
) => void;

export type ActiveCellCoord = {
	blockId: string;
	row: number;
	col: number;
};

type FieldEditorSelectionState = Pick<
	FieldEditorStore,
	"focusBlockId" | "selection" | "inputMode" | "isEditing" | "isComposing"
> & {
	readonly activeCellCoord: ActiveCellCoord | null;
};

export interface FieldEditorRootHandle {
	setRootElement(element: HTMLElement | null): void;
	setFocused(focused: boolean): void;
	setFocusPolicy(focusPolicy: PenFocusPolicy | undefined): void;
	setSelectAllBehavior(behavior: EditorSelectAllBehavior): void;
	deactivate(): void;
	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	commitProgrammaticTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	focusTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
		options?: PenFieldEditorFocusOptions,
	): Promise<boolean>;
}

export interface FieldEditorDomController extends FieldEditorSelectionState {
	setComposing(composing: boolean): void;
	requestDomFocus(
		target: HTMLElement,
		reason: FieldEditorFocusReason,
		options?: FocusOptions,
		policyOptions?: PenFieldEditorFocusOptions,
	): boolean;
	requestActivation(
		target: HTMLElement,
		reason: FieldEditorFocusReason,
		options?: PenFieldEditorFocusOptions,
	): boolean;
	requestRootFocus(
		target: HTMLElement,
		reason: FieldEditorFocusReason,
		options?: FocusOptions,
	): boolean;
	shouldHandleDomSelectionChange(isApplyingSelection: number): boolean;
	resetBackendSelectionAuthority(): void;
	setBackendSelectionAuthority(
		source: FieldEditorSelectionSource,
		selection: FieldEditorSelectionSnapshot | null,
	): void;
	getBackendSelectionAuthority(
		source: FieldEditorSelectionSource,
		blockId?: string | null,
	): FieldEditorSelectionSnapshot | null;
	hasBackendSelectionAuthority(source: FieldEditorSelectionSource): boolean;
	clearBackendSelectionAuthority(source: FieldEditorSelectionSource): void;
	applyBackendSelectionUntilNextFrame(): void;
	getBackendSelectionApplicationDepth(): number;
	setEditContextSelectionSnapshot(
		selection: FieldEditorSelectionSnapshot | null,
	): void;
	getEditContextSelectionSnapshot(
		blockId?: string | null,
	): FieldEditorSelectionSnapshot | null;
	resolveProgrammaticInputRange(
		blockId: string | null,
		liveRange: { start: number; end: number } | null,
	): { start: number; end: number } | null;
	shouldIgnoreDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): boolean;
	applyDocumentTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): void;
	applyDomTextSelection(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
		options?: {
			focusBlockId?: string;
		},
	): void;
	resolveInsertMarks(
		ytext: { toDelta(): unknown[] },
		offset: number,
	): Record<string, unknown | null> | undefined;
	syncTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	notifyDomReconciled(blockId?: string): void;
	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	commitProgrammaticTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	deactivate(): void;
}

export interface FieldEditorKeyboardController extends Pick<
	FieldEditorSelectionState,
	"focusBlockId" | "inputMode"
> {
	readonly activeCellCoord: ActiveCellCoord | null;
	activateCell(blockId: string, row: number, col: number): void;
	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	commitProgrammaticTextSelection?(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	deactivate(): void;
	selectAll(rootElement?: HTMLElement | null): boolean;
}

export interface FieldEditorTableNavigationController {
	readonly isEditing: boolean;
	activateCell?(blockId: string, row: number, col: number): void;
	activateCellFromElement?(
		blockId: string,
		row: number,
		col: number,
		element: HTMLElement,
	): void;
	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	deactivate(): void;
}

export interface FieldEditorEscapeController extends Pick<
	FieldEditorSelectionState,
	"focusBlockId" | "isEditing" | "isComposing"
> {
	readonly activeCellCoord: ActiveCellCoord | null;
	collapseSelectionToFocus(): void;
	deactivate(): void;
}

export interface FieldEditorTransferController {
	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
}

export type FieldEditorInputController = FieldEditorDomController &
	FieldEditorKeyboardController;

export type FieldEditorSession = FieldEditorStore &
	FieldEditorRootHandle &
	FieldEditorInputController &
	FieldEditorTableNavigationController &
	FieldEditorEscapeController & {
		beginPointerSelection(): void;
		endPointerSelection(): void;
		selectAll(rootElement?: HTMLElement | null): boolean;
		resetSelectAllCycle(): void;
		suspendForPointerSelection(): void;
		getPendingMarks(): Readonly<Record<string, unknown | null>>;
		togglePendingMark(markType: string): boolean;
		clearPendingMarks(): void;
		collapseSelectionToAnchor(): void;
		collapseSelectionToPoint(point: {
			blockId: string;
			offset: number;
		}): void;
		onFocusLifecycle(
			listener: PenFocusLifecycleListener,
		): () => void;
		waitForAttachment(blockId?: string | null): Promise<boolean>;
		delegate(blockSchema: BlockSchema): boolean;
	};

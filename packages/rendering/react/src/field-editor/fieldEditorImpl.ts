import type {
	FieldEditor,
	Editor,
	BlockSchema,
	SelectionState,
	Unsubscribe,
	InputBackend,
} from "@pen/core";
import { EditContextBackend } from "./editContextBackend.js";
import { ContentEditableBackend } from "./contenteditableBackend.js";
import { ExpandedContentEditableBackend } from "./expandedContentEditableBackend.js";
import { classifySelectionSurface } from "./crossBlock.js";
import { resolveMarksAtPosition } from "./markBoundary.js";
import { domSelectionToEditor } from "./selectionBridge.js";
import type { FieldEditorStoreSnapshot } from "./store.js";

export class FieldEditorImpl implements FieldEditor {
	private _focusBlockId: string | null = null;
	private _activeBlockIds: string[] = [];
	private _attachedElement: HTMLElement | null = null;
	private _isEditing = false;
	private _isFocused = false;
	private _isComposing = false;
	private _inputMode: "richtext" | "code" | "table" | "none" = "none";
	private _mode: "inactive" | "single" | "expanded" | "block" = "inactive";
	private _backend: InputBackend | null = null;
	private _editor: Editor;
	private _rootElement: HTMLElement | null = null;
	private _activateListeners = new Set<(blockIds: string[]) => void>();
	private _deactivateListeners = new Set<(blockIds: string[]) => void>();
	private _storeListeners = new Set<() => void>();
	private _unsubscribeSelection: Unsubscribe | null = null;
	private _pendingMarks: Record<string, unknown | null> = {};
	private _selectAllCycle: {
		blockId: string;
		scope: "block" | "document";
	} | null = null;
	private _preserveSelectAllCycle = false;

	constructor(editor: Editor) {
		this._editor = editor;
		this._unsubscribeSelection = this._editor.onSelectionChange(
			(selection) => {
				const preserveSelectAllCycle =
					this._preserveSelectAllCycle ||
					this._selectionMatchesSelectAllCycle(selection);
				this._preserveSelectAllCycle = false;
				if (!preserveSelectAllCycle) {
					this._selectAllCycle = null;
				}
				if (
					selection?.type !== "text" ||
					!selection.isCollapsed ||
					selection.isMultiBlock
				) {
					this._clearPendingMarks(true);
				}
				this._recomputeSurfaceFromSelection();
			},
		);
	}

	get focusBlockId(): string | null {
		return this._focusBlockId;
	}
	get activeBlockIds(): readonly string[] {
		return this._activeBlockIds;
	}
	get isEditing(): boolean {
		return this._isEditing;
	}
	get isFocused(): boolean {
		return this._isFocused;
	}
	get isComposing(): boolean {
		return this._isComposing;
	}
	get inputMode(): "richtext" | "code" | "table" | "none" {
		return this._inputMode;
	}
	get selection(): SelectionState | null {
		return this._isEditing ? this._editor.selection : null;
	}
	set selection(sel: SelectionState | null) {
		this._editor.setSelection(sel);
		this._emitStateChange();
	}

	// ── Lifecycle ─────────────────────────────────────────────

	activate(blockId: string): void {
		if (this._focusBlockId === blockId) return;
		if (this._isEditing) this._deactivate({ restoreFocus: false });

		const block = this._editor.getBlock(blockId);
		if (!block) return;

		const schema = this._editor.schema.resolve(block.type);
		if (schema?.fieldEditor === "none") return;

		this._focusBlockId = blockId;
		this._activeBlockIds = [blockId];
		this._isEditing = true;
		this._isComposing = false;
		this._mode = "single";
		this._pendingMarks = {};
		this._editor.undoManager.stopCapturing();

		this._inputMode = resolveInputMode(schema?.fieldEditor);
		this._backend = this.createBackend();
		this._syncActiveElement(false);
		this._recomputeSurfaceFromSelection();

		for (const cb of this._activateListeners) cb([...this._activeBlockIds]);
		this._emitStateChange();
	}

	deactivate(): void {
		this._deactivate({ restoreFocus: true });
	}

	selectAll(rootElement?: HTMLElement | null): boolean {
		const blockId = this._resolveSelectAllBlockId(rootElement);
		if (blockId) {
			const nextScope =
				this._selectAllCycle?.blockId === blockId &&
				this._selectAllCycle.scope === "block"
					? "document"
					: "block";
			if (nextScope === "block") {
				const blockLength =
					this._editor.getBlock(blockId)?.textContent().length ?? 0;
				this.activateTextSelection(blockId, 0, blockLength);
				this._recordSelectAllScope(blockId, "block");
				return true;
			}
		}

		const range = getFullDocumentTextRange(this._editor);
		if (!range) {
			return true;
		}

		if (!this._isEditing) {
			this.activate(range.focusBlockId);
		}
		this._editor.selectTextRange(range.start, range.end);
		this._recomputeSurfaceFromSelection();
		this._recordSelectAllScope(blockId ?? range.focusBlockId, "document");
		this._syncSelectionToDOM();
		return true;
	}

	suspendForPointerSelection(): void {
		if (this._isComposing) return;
		this._deactivate({ restoreFocus: false });
	}

	setComposing(composing: boolean): void {
		if (this._isComposing === composing) return;
		this._isComposing = composing;
		this._emitStateChange();
	}

	private _deactivate(options: { restoreFocus: boolean }): void {
		if (!this._isEditing) return;

		const blockIds = [...this._activeBlockIds];
		const focusTargetId = this._focusBlockId ?? blockIds[0] ?? null;
		this._backend?.deactivate();
		this._backend = null;
		this._attachedElement = null;

		this._focusBlockId = null;
		this._activeBlockIds = [];
		this._isEditing = false;
		this._isComposing = false;
		this._inputMode = "none";
		this._mode = "inactive";
		this._pendingMarks = {};

		for (const cb of this._deactivateListeners) cb(blockIds);
		if (options.restoreFocus) {
			this._restoreFocusAfterDeactivate(focusTargetId);
		}
		this._emitStateChange();
	}

	focus(): void {
		if (!this._isEditing || !this._focusBlockId) return;
		const root = this._findEditorRoot();

		if (!root) return;

		const blockEl = root.querySelector(
			`[data-block-id="${this._focusBlockId}"]`,
		);
		const inlineEl = blockEl?.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		if (!inlineEl) return;

		inlineEl.focus({ preventScroll: false });

		const selection = root.ownerDocument?.getSelection();
		if (!selection) return;

		const range = root.ownerDocument.createRange();
		range.selectNodeContents(inlineEl);
		range.collapse(false);

		selection.removeAllRanges();
		selection.addRange(range);
	}

	blur(): void {
		const root = this._findEditorRoot();
		if (!root) return;
		const activeEl = root.ownerDocument?.activeElement;
		if (activeEl instanceof HTMLElement && root.contains(activeEl)) {
			activeEl.blur();
		}
	}

	setRootElement(element: HTMLElement | null): void {
		this._rootElement = element;
		if (element && this._isEditing) {
			this._syncActiveElement(false);
		}
	}

	setFocused(focused: boolean): void {
		if (this._isFocused === focused) return;
		this._isFocused = focused;
		this._emitStateChange();
	}

	private _findEditorRoot(): HTMLElement | null {
		if (!this._rootElement?.isConnected) return null;
		return this._rootElement;
	}

	private _findExpandedHost(): HTMLElement | null {
		const root = this._findEditorRoot();
		if (!root) return null;
		return root.querySelector(
			"[data-pen-editor-blocks-host]",
		) as HTMLElement | null;
	}

	attachElement(element: HTMLElement): void {
		if (!this._backend || !this._focusBlockId) return;
		if (this._attachedElement === element) return;
		if (this._attachedElement) {
			this._backend.deactivate();
			this._backend = this.createBackend();
		}

		const adapter = this._editor.internals.adapter;
		const doc = this._editor.internals.crdtDoc;
		const ydoc = adapter.raw(doc) as any;
		const blockMap = ydoc.getMap("blocks").get(this._focusBlockId);
		const ytext = blockMap?.get("content");
		if (!ytext) return;

		this._backend.activate(element, ytext);
		this._attachedElement = element;
	}

	syncTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		if (!this._isEditing) return;
		if (this._focusBlockId !== blockId) return;

		this.setTextSelection(blockId, anchorOffset, focusOffset);
	}

	setTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		if (anchorOffset !== focusOffset) {
			this._clearPendingMarks(true);
		}
		this._editor.selectText(blockId, anchorOffset, focusOffset);
		this._emitStateChange();
	}

	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		this._projectTextSelection(blockId, anchorOffset, focusOffset);
	}

	collapseSelectionToFocus(): void {
		const selection = this._editor.selection;
		if (selection?.type !== "text") return;

		this._collapseAndProject(selection.focus);
	}

	collapseSelectionToAnchor(): void {
		const selection = this._editor.selection;
		if (selection?.type !== "text") return;

		this._collapseAndProject(selection.anchor);
	}

	collapseSelectionToPoint(point: { blockId: string; offset: number }): void {
		this._collapseAndProject(point);
	}

	private _collapseAndProject(point: {
		blockId: string;
		offset: number;
	}): void {
		this.setTextSelection(point.blockId, point.offset, point.offset);

		if (!this._isEditing || this._focusBlockId !== point.blockId) {
			this.activate(point.blockId);
		}

		this._syncDomSelectionOnce();
	}

	delegate(blockSchema: BlockSchema): boolean {
		return blockSchema.fieldEditor !== "none";
	}

	getPendingMarks(): Readonly<Record<string, unknown | null>> {
		return this._pendingMarks;
	}

	clearPendingMarks(): void {
		this._clearPendingMarks();
	}

	private _recordSelectAllScope(
		blockId: string,
		scope: "block" | "document",
	): void {
		this._preserveSelectAllCycle = true;
		this._selectAllCycle = { blockId, scope };
	}

	resetSelectAllCycle(): void {
		this._preserveSelectAllCycle = false;
		this._selectAllCycle = null;
	}

	private _syncSelectionToDOM(): void {
		if (!this._isEditing) return;
		this._syncDomSelectionOnce();
	}

	private _resolveSelectAllBlockId(
		rootElement?: HTMLElement | null,
	): string | null {
		const selection = this._editor.selection;
		if (selection?.type === "text" && !selection.isMultiBlock) {
			return selection.focus.blockId;
		}

		if (this._focusBlockId) {
			return this._focusBlockId;
		}

		const root = rootElement ?? this._findEditorRoot();
		if (!root) {
			return null;
		}

		const domSelection = domSelectionToEditor(root);
		if (
			domSelection &&
			domSelection.anchor.blockId === domSelection.focus.blockId
		) {
			return domSelection.focus.blockId;
		}

		const activeElement = root.ownerDocument?.activeElement;
		if (activeElement instanceof HTMLElement) {
			return (
				activeElement
					.closest("[data-block-id]")
					?.getAttribute("data-block-id") ?? null
			);
		}

		return null;
	}

	private _selectionMatchesSelectAllCycle(
		selection: SelectionState | null,
	): boolean {
		const cycle = this._selectAllCycle;
		if (!cycle || selection?.type !== "text") {
			return false;
		}

		if (cycle.scope === "block") {
			const blockLength =
				this._editor.getBlock(cycle.blockId)?.textContent().length ?? 0;
			return (
				!selection.isMultiBlock &&
				selection.anchor.blockId === cycle.blockId &&
				selection.focus.blockId === cycle.blockId &&
				Math.min(selection.anchor.offset, selection.focus.offset) ===
					0 &&
				Math.max(selection.anchor.offset, selection.focus.offset) ===
					blockLength
			);
		}

		const range = getFullDocumentTextRange(this._editor);
		if (!range) {
			return false;
		}

		return (
			selection.isMultiBlock &&
			((pointsEqual(selection.anchor, range.start) &&
				pointsEqual(selection.focus, range.end)) ||
				(pointsEqual(selection.anchor, range.end) &&
					pointsEqual(selection.focus, range.start)))
		);
	}

	togglePendingMark(markType: string): boolean {
		if (!this._isEditing || this._inputMode !== "richtext") return false;

		const baseMarks = this._resolveBaseInsertMarks();
		const baseValue = baseMarks[markType];
		const effectiveMarks = this._applyPendingMarks(baseMarks);
		const nextValue = effectiveMarks[markType] != null ? null : true;
		const nextPendingMarks = { ...this._pendingMarks };

		if ((baseValue ?? null) === nextValue) {
			delete nextPendingMarks[markType];
		} else {
			nextPendingMarks[markType] = nextValue;
		}

		this._pendingMarks = nextPendingMarks;
		this._emitStateChange();
		return true;
	}

	resolveInsertMarks(
		ytext: { toDelta(): unknown[] },
		offset: number,
	): Record<string, unknown> | undefined {
		const baseMarks =
			resolveMarksAtPosition(ytext, offset, this._editor.schema) ?? {};
		const resolved = this._applyPendingMarks(baseMarks);
		return Object.keys(resolved).length > 0 ? resolved : undefined;
	}

	// ── Cross-block expansion ────────────────────────────────

	expandTo(blockId: string): void {
		if (!this._isEditing || !this._focusBlockId) return;

		const selection = this._editor.selection;
		const anchor =
			selection?.type === "text" &&
			selection.blockRange.includes(this._focusBlockId)
				? selection.anchor
				: { blockId: this._focusBlockId, offset: 0 };
		const doc = this._editor.documentState;
		const activeIdx = doc.indexOf(this._focusBlockId);
		const targetIdx = doc.indexOf(blockId);
		if (activeIdx < 0 || targetIdx < 0) return;

		const targetOffset =
			targetIdx >= activeIdx
				? (this._editor.getBlock(blockId)?.textContent().length ?? 0)
				: 0;

		this._editor.selectTextRange(anchor, {
			blockId,
			offset: targetOffset,
		});
	}

	contractToFocused(): void {
		if (!this._isEditing || !this._focusBlockId) return;

		const selection = this._editor.selection;
		if (selection?.type !== "text") return;

		this._editor.selectTextRange(selection.focus, selection.focus);
	}

	// ── Events ───────────────────────────────────────────────

	onActivate(cb: (blockIds: string[]) => void): Unsubscribe {
		this._activateListeners.add(cb);
		return () => this._activateListeners.delete(cb);
	}

	onDeactivate(cb: (blockIds: string[]) => void): Unsubscribe {
		this._deactivateListeners.add(cb);
		return () => this._deactivateListeners.delete(cb);
	}

	onSelectionChange(cb: (sel: SelectionState) => void): Unsubscribe {
		return this._editor.onSelectionChange(cb);
	}

	getSnapshot(): FieldEditorStoreSnapshot {
		return {
			focusBlockId: this._focusBlockId,
			activeBlockIds: this._activeBlockIds,
			isEditing: this._isEditing,
			isFocused: this._isFocused,
			isComposing: this._isComposing,
			inputMode: this._inputMode,
			mode: this._mode,
		};
	}

	subscribe(callback: () => void): Unsubscribe {
		this._storeListeners.add(callback);
		return () => this._storeListeners.delete(callback);
	}

	destroy(): void {
		this._unsubscribeSelection?.();
		this._unsubscribeSelection = null;
		this._deactivate({ restoreFocus: false });
		this._activateListeners.clear();
		this._deactivateListeners.clear();
		this._storeListeners.clear();
	}

	// ── Internal ─────────────────────────────────────────────

	private createBackend(): InputBackend {
		if (this._mode === "expanded") {
			return new ExpandedContentEditableBackend(this._editor, this);
		}
		if (
			"EditContext" in globalThis &&
			typeof (globalThis as typeof globalThis & { EditContext?: unknown })
				.EditContext === "function"
		) {
			return new EditContextBackend(this._editor, this);
		}
		return new ContentEditableBackend(this._editor, this);
	}

	private _syncActiveElement(focus: boolean): void {
		if (!this._focusBlockId) return;
		const root = this._findEditorRoot();
		if (!root) return;

		const blockEl = root.querySelector(
			`[data-block-id="${this._focusBlockId}"]`,
		);
		const inlineEl = blockEl?.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;
		if (!inlineEl) return;

		this.attachElement(inlineEl);
		if (focus) {
			this.focus();
		}
	}

	private _restoreFocusAfterDeactivate(blockId: string | null): void {
		const root = this._findEditorRoot();
		if (!root) return;

		if (blockId) {
			const blockEl = root.querySelector(
				`[data-block-id="${blockId}"]`,
			) as HTMLElement | null;
			if (blockEl) {
				blockEl.focus({ preventScroll: true });
				return;
			}
		}

		root.focus({ preventScroll: true });
	}

	private _emitStateChange(): void {
		for (const callback of this._storeListeners) {
			callback();
		}
	}

	private _resolveBaseInsertMarks(): Record<string, unknown> {
		const selection = this._editor.selection;
		if (!this._focusBlockId || selection?.type !== "text") {
			return {};
		}

		const blockId = selection.focus.blockId;
		const ytext = this._getYText(blockId);
		if (!ytext) return {};

		return (
			resolveMarksAtPosition(
				ytext,
				selection.focus.offset,
				this._editor.schema,
			) ?? {}
		);
	}

	private _applyPendingMarks(
		baseMarks: Record<string, unknown>,
	): Record<string, unknown> {
		const nextMarks = { ...baseMarks };
		for (const [markType, value] of Object.entries(this._pendingMarks)) {
			if (value == null) {
				delete nextMarks[markType];
			} else {
				nextMarks[markType] = value;
			}
		}
		return nextMarks;
	}

	private _clearPendingMarks(silent = false): void {
		if (Object.keys(this._pendingMarks).length === 0) return;
		this._pendingMarks = {};
		if (!silent) {
			this._emitStateChange();
		}
	}

	private _recomputeSurfaceFromSelection(): void {
		const surface = classifySelectionSurface(
			this._editor,
			this._editor.selection,
			this._focusBlockId,
			this._isEditing,
		);
		this._updateSurfaceState(surface.mode, surface.blockIds);
		this._backend?.updateSelection(null);
	}

	private _updateSurfaceState(
		mode: "inactive" | "single" | "expanded" | "block",
		blockIds: string[],
	): void {
		const modeChanged = this._mode !== mode;
		const blockIdsChanged = !areBlockIdsEqual(
			this._activeBlockIds,
			blockIds,
		);
		if (!modeChanged && !blockIdsChanged) return;

		this._mode = mode;
		this._activeBlockIds = blockIds;
		this._syncBackendForSurfaceMode();

		if (this._isEditing && blockIdsChanged) {
			for (const cb of this._activateListeners) cb([...blockIds]);
		}

		this._emitStateChange();
	}

	private _syncBackendForSurfaceMode(): void {
		if (!this._isEditing || !this._focusBlockId) return;
		const nextBackend = this.createBackend();
		if (this._backend?.constructor === nextBackend.constructor) {
			return;
		}

		this._backend?.deactivate();
		this._backend = nextBackend;

		if (this._mode === "expanded") {
			const expandedHost = this._findExpandedHost();
			this._attachedElement = null;
			if (expandedHost) {
				this.attachElement(expandedHost);
			}
			return;
		}

		if (this._mode === "single") {
			const root = this._findEditorRoot();
			if (root) {
				const blockEl = root.querySelector(
					`[data-block-id="${this._focusBlockId}"]`,
				) as HTMLElement | null;
				const inlineEl = blockEl?.querySelector(
					"[data-pen-inline-content]",
				) as HTMLElement | null;
				if (inlineEl) {
					this._attachedElement = null;
					this.attachElement(inlineEl);
					return;
				}
			}
		}

		if (!this._attachedElement) return;

		const adapter = this._editor.internals.adapter;
		const doc = this._editor.internals.crdtDoc;
		const ydoc = adapter.raw(doc) as any;
		const blockMap = ydoc.getMap("blocks").get(this._focusBlockId);
		const ytext = blockMap?.get("content");
		if (!ytext) return;

		this._backend.activate(this._attachedElement, ytext);
	}

	private _projectTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void {
		this.setTextSelection(blockId, anchorOffset, focusOffset);

		if (!this._isEditing || this._focusBlockId !== blockId) {
			this.activate(blockId);
		}

		this._syncDomSelectionOnce();
	}

	private _syncDomSelectionOnce(remainingAttempts = 4): void {
		requestAnimationFrame(() => {
			if (!this._isEditing) return;

			let projected = false;

			if (this._mode === "expanded") {
				const expandedHost = this._findExpandedHost();
				if (expandedHost) {
					if (
						this._attachedElement !== expandedHost ||
						!this._attachedElement?.isConnected
					) {
						this.attachElement(expandedHost);
					}
					this._backend?.updateSelection(null);
					expandedHost.focus({ preventScroll: true });
					projected = true;
				}
			} else if (this._focusBlockId) {
				const root = this._findEditorRoot();
				const blockEl = root?.querySelector(
					`[data-block-id="${this._focusBlockId}"]`,
				) as HTMLElement | null;
				const inlineEl = blockEl?.querySelector(
					"[data-pen-inline-content]",
				) as HTMLElement | null;
				if (inlineEl) {
					if (
						!this._attachedElement ||
						!this._attachedElement.isConnected
					) {
						this.attachElement(inlineEl);
					}
					this._backend?.updateSelection(null);
					inlineEl.focus({ preventScroll: true });
					projected = true;
				}
			}

			if (!projected && remainingAttempts > 0) {
				this._syncDomSelectionOnce(remainingAttempts - 1);
			}
		});
	}

	private _getYText(blockId: string): any {
		const adapter = this._editor.internals.adapter;
		const doc = this._editor.internals.crdtDoc;
		const ydoc = adapter.raw(doc) as any;
		return ydoc.getMap("blocks").get(blockId)?.get("content") ?? null;
	}
}

function resolveInputMode(
	fieldEditor?: import("@pen/core").FieldEditorType,
): "richtext" | "code" | "table" | "none" {
	if (
		!fieldEditor ||
		fieldEditor === "richtext" ||
		fieldEditor === "plaintext"
	)
		return "richtext";
	if (fieldEditor === "code") return "code";
	if (fieldEditor === "table") return "table";
	if (fieldEditor === "none") return "none";
	return "richtext";
}

function areBlockIdsEqual(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) return false;
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) return false;
	}
	return true;
}

function getFullDocumentTextRange(editor: Editor): {
	start: { blockId: string; offset: number };
	end: { blockId: string; offset: number };
	focusBlockId: string;
} | null {
	const blockOrder = editor.documentState.blockOrder;
	const firstBlockId = blockOrder[0];
	const lastBlockId = blockOrder[blockOrder.length - 1];
	if (!firstBlockId || !lastBlockId) {
		return null;
	}

	const focusBlockId =
		blockOrder.find((blockId) => {
			const block = editor.getBlock(blockId);
			if (!block) return false;
			const schema = editor.schema.resolve(block.type);
			return schema?.fieldEditor !== "none";
		}) ?? firstBlockId;

	return {
		start: { blockId: firstBlockId, offset: 0 },
		end: {
			blockId: lastBlockId,
			offset: editor.getBlock(lastBlockId)?.textContent().length ?? 0,
		},
		focusBlockId,
	};
}

function pointsEqual(
	left: { blockId: string; offset: number },
	right: { blockId: string; offset: number },
): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}

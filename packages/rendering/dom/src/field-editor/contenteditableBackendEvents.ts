import type { InlineDecoration } from "@pen/types";
import { fullReconcileToDOM, applyDeltaToDOM } from "./reconciler";
import { computeTextDiff, extractTextFromDOM } from "./selectionBridge";
import { isHistoryTransactionOrigin } from "./historyOrigin";
import type { FieldEditorTextChangeEvent } from "./crdt";
import type { InlineTextDiffOp } from "./inlineTextTransaction";
import { ContentEditableBackendCore } from "./contenteditableBackendCore";
import { DIRECT_HANDLERS } from "./contenteditableDirectHandlers";
import {
	canResolveInputRange,
	rebaseTextDiffOps,
	requiresResolvedInputRange,
} from "./contenteditableDomHelpers";
import { inlineDecorationsRequireFullReconcile } from "../utils/inlineDecorations";

export abstract class ContentEditableBackendEvents extends ContentEditableBackendCore {
	protected handleBeforeInput = (event: InputEvent): void => {
		if (this.isComposing) return;
		if (!this.ytext || !this.element) return;

		const blockId = this.fieldEditor.focusBlockId;
		if (!blockId || !this.editor.getBlock(blockId)) {
			this.fieldEditor.deactivate();
			return;
		}

		const handler = DIRECT_HANDLERS[event.inputType];
		if (handler) {
			if (
				requiresResolvedInputRange(event.inputType) &&
				!this.ensureResolvableInputRange(event)
			) {
				return;
			}

			event.preventDefault();
			handler(
				event,
				this.editor,
				this.ytext,
				this.fieldEditor,
				this.element,
				this,
			);
			return;
		}

		// Let the mutation observer reconcile input types we do not handle directly.
	};

	protected ensureResolvableInputRange(event: InputEvent): boolean {
		if (!this.element) {
			return false;
		}
		if (canResolveInputRange(event, this.element)) {
			return true;
		}

		this.restoreDOMSelectionFromEditor();

		return canResolveInputRange(event, this.element);
	}

	// ── Composition handling ──────────────────────────────────

	protected handleCompositionStart = (): void => {
		this.isComposing = true;
		this.compositionStartTimestamp = Date.now();
		this.compositionStartText = this.ytext?.toString() ?? "";
		this.deferredRemoteDeltas = [];
		this.fieldEditor.setComposing(true);
	};

	protected handleCompositionEnd = (): void => {
		this.isComposing = false;
		this.fieldEditor.setComposing(false);

		const elapsed = Date.now() - this.compositionStartTimestamp;

		// GBoard rapid composition optimization: skip full diff for single-char
		// compositions under 50ms — treat as direct insert.
		if (elapsed < 50 && this.element) {
			const domText = extractTextFromDOM(this.element);
			const crdtText = this.ytext?.toString() ?? "";
			if (Math.abs(domText.length - crdtText.length) <= 1) {
				this.reconcileAfterComposition();
				return;
			}
		}

		// Safari may fire compositionend before the final DOM mutation.
		requestAnimationFrame(() => {
			if (this.isComposing) return;
			this.reconcileAfterComposition();
		});
	};

	protected reconcileAfterComposition(): void {
		if (!this.element || !this.ytext) return;
		const blockId = this.fieldEditor.focusBlockId;
		if (!blockId) return;

		const domText = extractTextFromDOM(this.element);
		const baseText = this.compositionStartText ?? this.ytext.toString();

		if (domText !== baseText) {
			const diff = rebaseTextDiffOps(
				computeTextDiff(baseText, domText),
				this.deferredRemoteDeltas,
			);
			this.applyTextDiffAsOps(blockId, diff);
		}

		if (this.deferredRemoteDeltas.length > 0) {
			this.deferredRemoteDeltas = [];
			fullReconcileToDOM(this.ytext, this.element!, this.editor.schema, {
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(
				this.fieldEditor.focusBlockId ?? undefined,
			);
		}

		this.compositionStartText = null;
		this.restoreDOMSelectionFromEditor();
	}

	// ── Mutation observation fallback ─────────────────────────

	protected handleMutations = (_mutations: MutationRecord[]): void => {
		if (this.isComposing) return;
		if (!this.element || !this.ytext) return;
		const blockId = this.fieldEditor.focusBlockId;
		if (!blockId) return;

		const domText = extractTextFromDOM(this.element);
		const crdtText = this.ytext.toString();

		if (domText !== crdtText) {
			const diff = computeTextDiff(crdtText, domText);
			this.applyTextDiffAsOps(blockId, diff);
		}
	};

	// ── CRDT→DOM reconciliation ───────────────────────────────

	protected handleYTextChange = (event: FieldEditorTextChangeEvent): void => {
		if (this.isComposing) {
			if (
				event.transaction?.origin === "remote" ||
				event.transaction?.origin === "collaborator"
			) {
				this.deferredRemoteDeltas.push({ delta: event.delta });
			}
			return;
		}

		if (!this.element || !this.ytext) return;
		const isHistory = isHistoryTransactionOrigin(event.transaction?.origin);
		if (isHistory) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				preserveSelection: true,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(
				this.fieldEditor.focusBlockId ?? undefined,
			);
			this.restoreDOMSelectionFromEditor();
			return;
		}

		const blockId = this.fieldEditor.focusBlockId;
		const isActiveCell = blockId
			? !!this._getActiveCellCoord(blockId)
			: false;
		if (isActiveCell) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				preserveSelection: true,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(blockId ?? undefined);
			if (
				this.fieldEditor.hasBackendSelectionAuthority("programmatic") ||
				event.transaction?.origin === "remote" ||
				event.transaction?.origin === "collaborator"
			) {
				this.restoreDOMSelectionFromEditor();
			}
			return;
		}

		const inlineDecorations = this.getInlineDecorationsForBlock();
		if (inlineDecorationsRequireFullReconcile(inlineDecorations)) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				preserveSelection: true,
				inlineDecorations,
			});
			this.fieldEditor.notifyDomReconciled(blockId ?? undefined);
			if (
				this.fieldEditor.hasBackendSelectionAuthority("programmatic") ||
				event.transaction?.origin === "remote" ||
				event.transaction?.origin === "collaborator"
			) {
				this.restoreDOMSelectionFromEditor();
			}
			return;
		}

		const applied = applyDeltaToDOM(
			event.delta,
			this.element,
			this.editor.schema,
		);
		if (!applied) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				preserveSelection: true,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(blockId ?? undefined);
		}

		if (
			this.fieldEditor.hasBackendSelectionAuthority("programmatic") ||
			event.transaction?.origin === "remote" ||
			event.transaction?.origin === "collaborator"
		) {
			this.restoreDOMSelectionFromEditor();
		}
	};
}

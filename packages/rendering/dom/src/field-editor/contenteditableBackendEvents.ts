import type { InlineDecoration } from "@input/pen-types";
import { urlPolicyFromEditor } from "../security/resolveEditorUrl";
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
import { mapBeforeInput } from "./beforeinputMap";
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

		// map decides preventDefault / allow / block; DIRECT_HANDLERS only implement commands
		const mapping = mapBeforeInput(event.inputType);
		if ("policy" in mapping) {
			switch (mapping.policy) {
				case "allow":
					this.ignoreBrowserMutations = false;
					return;
				case "block":
					event.preventDefault();
					this.ignoreBrowserMutations = true;
					this.editor.internals.emit("diagnostic", {
						code: mapping.code,
						level: "warn",
						source: "beforeinput",
						message: `unhandled beforeinput inputType: ${event.inputType}`,
						inputType: event.inputType,
					});
					return;
				default: {
					const _exhaustive: never = mapping;
					return _exhaustive;
				}
			}
		}

		event.preventDefault();
		this.ignoreBrowserMutations = false;

		const handler = DIRECT_HANDLERS[event.inputType];
		if (!handler) {
			return;
		}
		if (
			requiresResolvedInputRange(event.inputType) &&
			!this.ensureResolvableInputRange(event)
		) {
			return;
		}

		handler(
			event,
			this.editor,
			this.ytext,
			this.fieldEditor,
			this.element,
			this,
		);
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
		if (this.compositionStartText != null) {
			this.reconcileAfterComposition();
			this.fieldEditor.notifyGestureEvent?.(
				"compositionend-completed",
			);
		}
		this.isComposing = true;
		this.ignoreBrowserMutations = false;
		this.compositionStartText = this.ytext?.toString() ?? "";
		this.deferredRemoteDeltas = [];
		this.fieldEditor.setComposing(true);
		this.fieldEditor.notifyGestureEvent?.("compositionstart");
	};

	protected handleCompositionEnd = (event?: CompositionEvent): void => {
		this.isComposing = false;
		this.fieldEditor.setComposing(false);

		const startText = this.compositionStartText ?? "";
		const domText = this.element
			? extractTextFromDOM(this.element)
			: startText;
		const committed = event?.data ?? "";
		const fieldIsQuiescent =
			domText !== startText ||
			committed.length === 0 ||
			domText.includes(committed);

		if (fieldIsQuiescent) {
			this.reconcileAfterComposition();
			this.fieldEditor.notifyGestureEvent?.(
				"compositionend-completed",
			);
		}
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
				urlPolicy: urlPolicyFromEditor(this.editor),
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.discardObservedMutations();
			this.fieldEditor.notifyDomReconciled(
				this.fieldEditor.focusBlockId ?? undefined,
			);
		}

		this.compositionStartText = null;
		this.restoreDOMSelectionFromEditor();
		this.discardObservedMutations();
	}

	// ── Mutation observer watchdog ────────────────────────────

	protected handleMutations = (_mutations: MutationRecord[]): void => {
		if (this.restoringDomFromModel) return;
		if (!this.isComposing && this.compositionStartText != null) {
			this.reconcileAfterComposition();
			this.fieldEditor.notifyGestureEvent?.(
				"compositionend-completed",
			);
			return;
		}
		if (this.isComposing) return;
		if (!this.element || !this.ytext) return;
		const blockId = this.fieldEditor.focusBlockId;
		if (!blockId) return;

		const domText = extractTextFromDOM(this.element);
		const crdtText = this.ytext.toString();
		if (domText === crdtText) {
			this.lastWatchdogMismatch = null;
			return;
		}
		const mismatchKey = `${crdtText}\0${domText}`;
		if (this.lastWatchdogMismatch === mismatchKey) {
			return;
		}
		this.lastWatchdogMismatch = mismatchKey;

		if (!this.ignoreBrowserMutations) {
			this.editor.internals.emit("diagnostic", {
				code: "dom-divergence",
				level: "warn",
				source: "mutation-observer",
				message:
					"contenteditable DOM diverged from the document; restoring from the model",
			});
		}

		// do not put a foreign caret back — that re-dirties WebKit/Firefox
		// contenteditable and the observer re-enters on its own write.
		this.restoringDomFromModel = true;
		try {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				urlPolicy: urlPolicyFromEditor(this.editor),
				preserveSelection: false,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.discardObservedMutations();
		} finally {
			this.restoringDomFromModel = false;
		}
		this.fieldEditor.notifyDomReconciled(blockId);
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
				urlPolicy: urlPolicyFromEditor(this.editor),
				preserveSelection: true,
				inlineDecorations: this.getInlineDecorationsForBlock(),
			});
			this.fieldEditor.notifyDomReconciled(
				this.fieldEditor.focusBlockId ?? undefined,
			);
			this.restoreDOMSelectionFromEditor();
			this.discardObservedMutations();
			return;
		}

		const blockId = this.fieldEditor.focusBlockId;
		const isActiveCell = blockId
			? !!this._getActiveCellCoord(blockId)
			: false;
		if (isActiveCell) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				urlPolicy: urlPolicyFromEditor(this.editor),
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
			this.discardObservedMutations();
			return;
		}

		const inlineDecorations = this.getInlineDecorationsForBlock();
		if (inlineDecorationsRequireFullReconcile(inlineDecorations)) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				urlPolicy: urlPolicyFromEditor(this.editor),
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
			this.discardObservedMutations();
			return;
		}

		const applied = applyDeltaToDOM(
			event.delta,
			this.element,
			this.editor.schema,
			urlPolicyFromEditor(this.editor),
		);
		if (!applied) {
			fullReconcileToDOM(this.ytext, this.element, this.editor.schema, {
				urlPolicy: urlPolicyFromEditor(this.editor),
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
		this.discardObservedMutations();
	};
}

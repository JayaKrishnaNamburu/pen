import {
	getInlineAtomAtOffset,
	moveInlineAtom,
	replaceInlineAtomWithText,
	resolveInlineAtomDropTarget,
	type InlineAtomDropTarget,
	type InlineAtomSnapshot,
	type InlineAtomSource,
} from "@pen/dom/field-editor/inlineAtomInteraction";
import type { Editor } from "@pen/types";
import type { FieldEditorSession } from "@pen/dom";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { getAttachedFieldEditor } from "../../utils/fieldEditor";
import type {
	InlineAtomDestructureHandler,
	InlineAtomRenderInteractionProps,
	ResolvedInlineAtomInteractions,
} from "../../context/editorContext";
import {
	createInlineAtomDragPreview,
	type InlineAtomDragPreview,
} from "../../utils/inlineAtomDragPreview";

const DRAG_THRESHOLD_PX = 4;

interface InlineAtomInteractionRootState {
	editor: Editor;
	readonly: boolean;
	interactions: ResolvedInlineAtomInteractions;
}

export interface InlineAtomWrapperInteractionOptions {
	element: HTMLElement;
	editor: Editor;
	blockId: string;
	offset: number;
	type: string;
	text: string;
	props: Record<string, unknown>;
	selected: boolean;
	interactions: ResolvedInlineAtomInteractions;
	readonly: boolean;
}

interface PointerSession {
	source: InlineAtomSource;
	sourceElement: HTMLElement;
	sourceRoot: HTMLElement;
	atom: InlineAtomSnapshot;
	startX: number;
	startY: number;
	latestX: number;
	latestY: number;
	isDragging: boolean;
	animationFrameId: number | null;
	preview: InlineAtomDragPreview | null;
}

export interface InlineAtomDragSnapshot {
	source: InlineAtomSource | null;
	dragging: boolean;
	version: number;
}

const rootRegistry = new Map<HTMLElement, InlineAtomInteractionRootState>();
const dragListeners = new Set<() => void>();
let dragSnapshot: InlineAtomDragSnapshot = {
	source: null,
	dragging: false,
	version: 0,
};
let pointerSession: PointerSession | null = null;

export function registerInlineAtomInteractionRoot(
	root: HTMLElement,
	state: InlineAtomInteractionRootState,
): () => void {
	rootRegistry.set(root, state);
	return () => {
		const current = rootRegistry.get(root);
		if (current === state) {
			rootRegistry.delete(root);
		}
	};
}

export function attachInlineAtomWrapperInteractions(
	options: InlineAtomWrapperInteractionOptions,
): () => void {
	const handlePointerDown = (event: PointerEvent) => {
		if (
			event.button !== 0 ||
			options.readonly ||
			!options.interactions.drag ||
			pointerSession
		) {
			return;
		}

		const atom = getInlineAtomAtOffset(options.editor, {
			blockId: options.blockId,
			offset: options.offset,
		});
		if (!atom) {
			notifyRejected(options, { reason: "stale-source" });
			return;
		}
		const sourceRoot = getRegisteredRootForElement(options.element);
		if (!sourceRoot) {
			notifyRejected(options, { reason: "missing-target" });
			return;
		}

		pointerSession = {
			source: {
				editor: options.editor,
				blockId: options.blockId,
				offset: options.offset,
			},
			sourceElement: options.element,
			sourceRoot,
			atom,
			startX: event.clientX,
			startY: event.clientY,
			latestX: event.clientX,
			latestY: event.clientY,
			isDragging: false,
			animationFrameId: null,
			preview: null,
		};
		options.element.setPointerCapture?.(event.pointerId);
	};

	const handleDoubleClick = (event: MouseEvent) => {
		if (options.readonly || !canDestructure(options)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		destructureInlineAtom(options);
	};

	options.element.addEventListener("pointerdown", handlePointerDown);
	options.element.addEventListener("dblclick", handleDoubleClick);
	return () => {
		options.element.removeEventListener("pointerdown", handlePointerDown);
		options.element.removeEventListener("dblclick", handleDoubleClick);
	};
}

export function getInlineAtomRenderInteractionProps(
	options: InlineAtomWrapperInteractionOptions,
	dragging = false,
): InlineAtomRenderInteractionProps | undefined {
	if (!options.interactions.drag && !canDestructure(options)) {
		return undefined;
	}

	return {
		draggable: options.interactions.drag && !options.readonly,
		dragging,
		canDestructure: canDestructure(options) && !options.readonly,
		destructure: canDestructure(options)
			? () => destructureInlineAtom(options)
			: undefined,
	};
}

export function subscribeInlineAtomDragSnapshot(
	listener: () => void,
): () => void {
	dragListeners.add(listener);
	return () => {
		dragListeners.delete(listener);
	};
}

export function getInlineAtomDragSnapshot(): InlineAtomDragSnapshot {
	return dragSnapshot;
}

export function isInlineAtomDragSource(
	snapshot: InlineAtomDragSnapshot,
	editor: Editor,
	blockId: string,
	offset: number,
): boolean {
	return (
		snapshot.dragging &&
		snapshot.source?.editor === editor &&
		snapshot.source.blockId === blockId &&
		snapshot.source.offset === offset
	);
}

function handleDocumentPointerMove(event: PointerEvent): void {
	const session = pointerSession;
	if (!session) {
		return;
	}

	session.latestX = event.clientX;
	session.latestY = event.clientY;

	const movedDistance = Math.hypot(
		event.clientX - session.startX,
		event.clientY - session.startY,
	);
	if (!session.isDragging && movedDistance < DRAG_THRESHOLD_PX) {
		return;
	}

	event.preventDefault();

	if (!session.isDragging) {
		startInlineAtomDrag(session);
	}

	schedulePointerMoveFrame(session);
}

function handleDocumentPointerUp(event: PointerEvent): void {
	const session = pointerSession;
	pointerSession = null;
	if (!session?.isDragging) {
		cleanupPointerSession(session);
		return;
	}

	event.preventDefault();
	const target = resolveTargetFromPoint(event.clientX, event.clientY);
	const sourceState = rootRegistry.get(session.sourceRoot);
	cleanupPointerSession(session);
	if (!sourceState) {
		return;
	}

	if (!target) {
		sourceState.interactions.onMoveRejected?.({
			source: session.source,
			atom: session.atom,
			reason: "missing-target",
		});
		return;
	}

	if (
		sourceState.interactions.onBeforeMove?.({
			source: session.source,
			target,
			atom: session.atom,
		}) === false
	) {
		sourceState.interactions.onMoveRejected?.({
			source: session.source,
			target,
			atom: session.atom,
			reason: "policy",
		});
		return;
	}

	const moved = moveInlineAtom({ source: session.source, target });
	if (!moved) {
		sourceState.interactions.onMoveRejected?.({
			source: session.source,
			target,
			atom: session.atom,
			reason: "schema",
		});
		return;
	}

	sourceState.interactions.onMove?.({
		source: session.source,
		target,
		atom: session.atom,
	});
}

function handleDocumentPointerCancel(): void {
	const session = pointerSession;
	pointerSession = null;
	cleanupPointerSession(session);
}

function startInlineAtomDrag(session: PointerSession): void {
	session.isDragging = true;
	session.sourceElement.toggleAttribute(DATA_ATTRS.inlineAtomDragging, true);
	session.preview = createInlineAtomDragPreview({
		sourceElement: session.sourceElement,
		clientX: session.latestX,
		clientY: session.latestY,
	});
	setDragSnapshot({
		source: session.source,
		dragging: true,
		version: dragSnapshot.version + 1,
	});
}

function schedulePointerMoveFrame(session: PointerSession): void {
	if (session.animationFrameId != null) {
		return;
	}

	session.animationFrameId = requestAnimationFrame(() => {
		session.animationFrameId = null;
		if (pointerSession !== session || !session.isDragging) {
			return;
		}

		session.preview?.updatePosition(session.latestX, session.latestY);
	});
}

function cleanupPointerSession(session: PointerSession | null): void {
	if (!session) {
		return;
	}

	if (session.animationFrameId != null) {
		cancelAnimationFrame(session.animationFrameId);
		session.animationFrameId = null;
	}

	session.preview?.destroy();
	session.preview = null;
	session.sourceElement.toggleAttribute(DATA_ATTRS.inlineAtomDragging, false);

	if (dragSnapshot.dragging && dragSnapshot.source === session.source) {
		setDragSnapshot({
			source: null,
			dragging: false,
			version: dragSnapshot.version + 1,
		});
	}
}

function setDragSnapshot(nextSnapshot: InlineAtomDragSnapshot): void {
	dragSnapshot = nextSnapshot;
	dragListeners.forEach((listener) => listener());
}

function resolveTargetFromPoint(
	clientX: number,
	clientY: number,
): InlineAtomDropTarget | null {
	const doc = document;
	const element = doc.elementFromPoint(clientX, clientY);
	const root =
		element instanceof HTMLElement
			? element.closest<HTMLElement>(`[${DATA_ATTRS.editorRoot}]`)
			: null;
	if (!root) {
		return null;
	}

	const state = rootRegistry.get(root);
	if (!state || state.readonly || !state.interactions.drag) {
		return null;
	}

	return resolveInlineAtomDropTarget({
		editor: state.editor,
		root,
		clientX,
		clientY,
	});
}

function destructureInlineAtom(
	options: InlineAtomWrapperInteractionOptions,
): boolean {
	const atom = getInlineAtomAtOffset(options.editor, {
		blockId: options.blockId,
		offset: options.offset,
	});
	if (!atom) {
		notifyRejected(options, { reason: "stale-source" });
		return false;
	}

	const text = resolveDestructureText(options.interactions.destructure, atom);
	if (text == null) {
		return false;
	}

	const didReplace = replaceInlineAtomWithText({
		source: {
			editor: options.editor,
			blockId: options.blockId,
			offset: options.offset,
		},
		text,
		selection: "end",
	});
	if (!didReplace) {
		return false;
	}

	options.interactions.onAfterDestructure?.({
		editor: options.editor,
		atom,
		blockId: options.blockId,
		startOffset: options.offset,
		endOffset: options.offset + text.length,
		text,
	});
	const fieldEditor = getAttachedFieldEditor(
		options.editor,
	) as FieldEditorSession | null;
	requestAnimationFrame(() => {
		fieldEditor?.activateTextSelection(
			options.blockId,
			options.offset + text.length,
			options.offset + text.length,
		);
		fieldEditor?.focus();
	});
	return true;
}

function canDestructure(options: InlineAtomWrapperInteractionOptions): boolean {
	return options.interactions.destructure !== false;
}

function resolveDestructureText(
	destructure: ResolvedInlineAtomInteractions["destructure"],
	atom: InlineAtomSnapshot,
): string | null | undefined {
	if (typeof destructure === "function") {
		return destructure(atom);
	}
	if (destructure === true) {
		return atom.text;
	}
	if (destructure && typeof destructure === "object") {
		return destructure[atom.type]?.(atom);
	}
	return null;
}

function notifyRejected(
	options: InlineAtomWrapperInteractionOptions,
	event: Omit<
		Parameters<
			NonNullable<ResolvedInlineAtomInteractions["onMoveRejected"]>
		>[0],
		"source"
	>,
): void {
	options.interactions.onMoveRejected?.({
		source: {
			editor: options.editor,
			blockId: options.blockId,
			offset: options.offset,
		},
		...event,
	});
}

function getRegisteredRootForElement(element: HTMLElement): HTMLElement | null {
	return element.closest<HTMLElement>(`[${DATA_ATTRS.editorRoot}]`);
}

if (typeof document !== "undefined") {
	document.addEventListener("pointermove", handleDocumentPointerMove, true);
	document.addEventListener("pointerup", handleDocumentPointerUp, true);
	document.addEventListener(
		"pointercancel",
		handleDocumentPointerCancel,
		true,
	);
}

import { createEditor, createHeadlessEditor } from "@input/pen-core";
import { wrapYjsDocument, yjsAdapter } from "@input/pen-crdt-yjs";
import {
	domSelectionToEditor,
	editorSelectionToDOM,
} from "@input/pen-dom/field-editor";
import { defaultPreset } from "@input/pen-preset-default";
import {
	createDeterministicYDocFixture,
	populateYDoc,
} from "@input/pen-test";
import type {
	CRDTAdapter,
	CRDTDocument,
	DiagnosticEvent,
	Editor,
	Unsubscribe,
} from "@input/pen-types";
import * as Y from "yjs";
import {
	isFixtureName,
	isLocalFixtureName,
	LOCAL_FIXTURES,
} from "../../fixtures/catalog";
import type {
	ConformanceEventRecord,
	DomAuthorityCheck,
	LogicalPoint,
	PenConformanceBridge,
	RemoteSpliceArgs,
	SerializedDiagnostic,
} from "../../src/types";
import { serializeDiagnostic, serializeSelection } from "./serialize";

const LAST_EVENTS_CAP = 32;
const DIAGNOSTICS_CAP = 64;

type Session = {
	editor: Editor;
	remoteEditor: Editor;
	localY: Y.Doc;
	remoteY: Y.Doc;
	fixtureName: string;
	generation: number;
	lastEvents: ConformanceEventRecord[];
	diagnostics: SerializedDiagnostic[];
	unsubscribers: Unsubscribe[];
	disconnectPeers: () => void;
	brokenProjection: DomAuthorityCheck | null;
};

let session: Session | null = null;
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}

export function subscribeHarness(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getHarnessSession(): Session {
	if (!session) {
		session = createSession("hello-world");
		installBridge();
	}
	return session;
}

function createLocalDocument(name: string): {
	adapter: CRDTAdapter;
	ydoc: Y.Doc;
	document: CRDTDocument;
} {
	if (!isFixtureName(name)) {
		throw new Error(`Unknown conformance fixture: ${name}`);
	}
	if (name === "deterministic") {
		const fixture = createDeterministicYDocFixture();
		return {
			adapter: fixture.crdtDoc.adapter,
			ydoc: fixture.ydoc,
			document: fixture.crdtDoc,
		};
	}
	if (!isLocalFixtureName(name)) {
		throw new Error(`Unknown conformance fixture: ${name}`);
	}
	const adapter = yjsAdapter();
	const ydoc = new Y.Doc({ gc: false });
	populateYDoc(ydoc, [...LOCAL_FIXTURES[name]]);
	return {
		adapter,
		ydoc,
		document: wrapYjsDocument(adapter, ydoc),
	};
}

function connectPeers(localY: Y.Doc, remoteY: Y.Doc): () => void {
	const onLocal = (update: Uint8Array, origin: unknown) => {
		if (origin === remoteY) {
			return;
		}
		Y.applyUpdate(remoteY, update, localY);
	};
	const onRemote = (update: Uint8Array, origin: unknown) => {
		if (origin === localY) {
			return;
		}
		Y.applyUpdate(localY, update, remoteY);
	};
	localY.on("update", onLocal);
	remoteY.on("update", onRemote);
	return () => {
		localY.off("update", onLocal);
		remoteY.off("update", onRemote);
	};
}

function createSession(fixtureName: string): Session {
	const local = createLocalDocument(fixtureName);
	const remoteAdapter = yjsAdapter();
	const remoteY = new Y.Doc({ gc: false });
	Y.applyUpdate(remoteY, Y.encodeStateAsUpdate(local.ydoc));
	const remoteDoc = wrapYjsDocument(remoteAdapter, remoteY);
	const disconnectPeers = connectPeers(local.ydoc, remoteY);

	const editor = createEditor({
		documentProfile: "structured",
		preset: defaultPreset(),
		crdt: local.adapter,
		document: local.document,
	});
	const remoteEditor = createHeadlessEditor({
		documentProfile: "structured",
		crdt: remoteAdapter,
		document: remoteDoc,
	});

	const next: Session = {
		editor,
		remoteEditor,
		localY: local.ydoc,
		remoteY,
		fixtureName,
		generation: (session?.generation ?? 0) + 1,
		lastEvents: [],
		diagnostics: [],
		unsubscribers: [],
		disconnectPeers,
		brokenProjection: null,
	};
	wireEvents(next);
	return next;
}

function recordEvent(target: Session, type: string, payload: unknown): void {
	target.lastEvents.push({ type, payload });
	if (target.lastEvents.length > LAST_EVENTS_CAP) {
		target.lastEvents.shift();
	}
}

function wireEvents(target: Session): void {
	const editor = target.editor;
	target.unsubscribers.push(
		editor.on("documentCommit", (event) => {
			recordEvent(target, "documentCommit", {
				commitId: event.commitId,
				origin: event.origin,
				affectedBlocks: [...event.affectedBlocks],
			});
		}),
		editor.on("selectionChange", (selection) => {
			recordEvent(target, "selectionChange", serializeSelection(selection));
		}),
		editor.on("change", (events) => {
			recordEvent(target, "change", events.length);
		}),
		editor.on("historyApplied", (event) => {
			recordEvent(target, "historyApplied", {
				kind: event.kind,
				requestId: event.requestId,
			});
		}),
		editor.on("diagnostic", (event: DiagnosticEvent) => {
			target.diagnostics.push(serializeDiagnostic(event));
			if (target.diagnostics.length > DIAGNOSTICS_CAP) {
				target.diagnostics.shift();
			}
			recordEvent(target, "diagnostic", serializeDiagnostic(event));
		}),
	);
}

function destroySession(target: Session): void {
	for (const unsubscribe of target.unsubscribers) {
		unsubscribe();
	}
	target.disconnectPeers();
	target.editor.destroy();
	target.remoteEditor.destroy();
	target.localY.destroy();
	target.remoteY.destroy();
}

export function loadFixture(name: string): void {
	if (session) {
		destroySession(session);
	}
	session = createSession(name);
	installBridge();
	notify();
}

function editorRoot(): HTMLElement | null {
	const root = document.querySelector("[data-pen-editor-root]");
	return root instanceof HTMLElement ? root : null;
}

function editorHasFocus(root: HTMLElement): boolean {
	const active = document.activeElement;
	return active instanceof Node && root.contains(active);
}

function pointsEqual(left: LogicalPoint, right: LogicalPoint): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}

function checkDomMatchesAuthority(): DomAuthorityCheck {
	const current = getHarnessSession();
	const root = editorRoot();
	if (!root) {
		return { ok: false, reason: "editor root is not mounted" };
	}
	if (current.brokenProjection) {
		return current.brokenProjection;
	}
	if (!editorHasFocus(root)) {
		return { ok: true, skipped: true };
	}

	const authority = serializeSelection(current.editor.selection);
	const mapped = domSelectionToEditor(root);
	if (authority == null) {
		if (mapped == null) {
			return { ok: true, authority, dom: mapped };
		}
		return {
			ok: false,
			reason: "DOM has a selection while editor.selection is null",
			authority,
			dom: mapped,
		};
	}
	if (authority.type !== "text") {
		return { ok: true, skipped: true, authority, dom: mapped };
	}
	if (!mapped) {
		return {
			ok: false,
			reason: "DOM selection does not map to a logical text selection",
			authority,
			dom: mapped,
		};
	}
	if (
		pointsEqual(mapped.anchor, authority.anchor) &&
		pointsEqual(mapped.focus, authority.focus)
	) {
		return { ok: true, authority, dom: mapped };
	}
	return {
		ok: false,
		reason: "DOM selection does not match editor.selection (v1 authority)",
		authority,
		dom: mapped,
	};
}

function misplacedOffset(offset: number, length: number): number {
	if (length <= 0) {
		return offset === 0 ? 1 : 0;
	}
	if (offset === 0) {
		return Math.min(1, length);
	}
	return 0;
}

function installBrokenProjector(): void {
	const current = getHarnessSession();
	const root = editorRoot();
	if (!root) {
		throw new Error("broken projector stub: editor root is not mounted");
	}
	let authority = serializeSelection(current.editor.selection);
	if (authority == null || authority.type !== "text") {
		const firstId = current.editor.documentState.blockAt(0);
		if (!firstId) {
			throw new Error("broken projector stub: document has no blocks");
		}
		current.editor.selectText(firstId, 0, 0);
		authority = serializeSelection(current.editor.selection);
	}
	if (authority == null || authority.type !== "text") {
		throw new Error("broken projector stub: could not establish a text selection");
	}

	const block = current.editor.getBlock(authority.anchor.blockId);
	const length = block?.length() ?? 0;
	const offset = misplacedOffset(authority.anchor.offset, length);
	const wrong = { blockId: authority.anchor.blockId, offset };
	editorSelectionToDOM(root, wrong, wrong);

	const mapped = domSelectionToEditor(root);
	const mismatch: DomAuthorityCheck = {
		ok: false,
		reason: "broken projector stub: DOM selection does not match authority",
		authority,
		dom: mapped,
	};
	if (
		mapped &&
		pointsEqual(mapped.anchor, authority.anchor) &&
		pointsEqual(mapped.focus, authority.focus)
	) {
		throw new Error("broken projector stub failed to misplace DOM selection");
	}
	current.brokenProjection = mismatch;
}

function remoteSplice(args: RemoteSpliceArgs): void {
	const current = getHarnessSession();
	const blockId = current.remoteEditor.documentState.blockAt(args.block);
	if (!blockId) {
		throw new Error(`remote.splice: no block at index ${args.block}`);
	}
	const from = Math.min(args.from, args.to);
	const to = Math.max(args.from, args.to);
	const ops = [];
	if (to > from) {
		ops.push({
			type: "delete-text" as const,
			blockId,
			offset: from,
			length: to - from,
		});
	}
	if (args.insert.length > 0) {
		ops.push({
			type: "insert-text" as const,
			blockId,
			offset: from,
			text: args.insert,
		});
	}
	if (ops.length === 0) {
		return;
	}
	current.remoteEditor.apply(ops, { origin: "collaborator" });
}

function documentText(): string {
	const current = getHarnessSession();
	const parts: string[] = [];
	for (const block of current.editor.documentState.blocks) {
		parts.push(block.textContent());
	}
	return parts.join("\n");
}

function blockIds(): string[] {
	return [...getHarnessSession().editor.documentState.blockOrder];
}

function installBridge(): void {
	const bridge: PenConformanceBridge = {
		get selection() {
			return serializeSelection(getHarnessSession().editor.selection);
		},
		get lastEvents() {
			return getHarnessSession().lastEvents;
		},
		get diagnostics() {
			return getHarnessSession().diagnostics;
		},
		get documentText() {
			return documentText();
		},
		get blockIds() {
			return blockIds();
		},
		get hasFocus() {
			const root = editorRoot();
			return root != null && editorHasFocus(root);
		},
		get fixtureName() {
			return getHarnessSession().fixtureName;
		},
		get generation() {
			return getHarnessSession().generation;
		},
		load(name: string) {
			loadFixture(name);
		},
		remoteSplice,
		installBrokenProjector,
		domMatchesAuthority: checkDomMatchesAuthority,
	};
	window.__penConformance = bridge;
}
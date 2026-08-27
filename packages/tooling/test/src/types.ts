import type {
	CreateEditorOptions,
	CRDTAdapter,
	CRDTDocument,
	Editor,
	PenDocument,
	BlockHandle,
} from "@input/pen-types";
import type * as Y from "yjs";

export type TestMarkDelta = {
	insert: string;
	attributes?: Record<string, unknown>;
};

export type TestTableCell = {
	content?: string;
	marks?: TestMarkDelta[];
};

export type TestTableRow = {
	cells: TestTableCell[];
};

export interface TestBlock {
	id?: string;
	type: string;
	props?: Record<string, unknown>;
	content?: string;
	marks?: TestMarkDelta[];
	children?: TestBlock[];
	table?: TestTableRow[];
}

export interface TestEditorOptions extends Partial<CreateEditorOptions> {
	blocks?: TestBlock[];
	doc?: Y.Doc;
}

export interface TestEditor extends Editor {
	readonly document: PenDocument;
	readonly ydoc: Y.Doc;
	readonly crdtDoc: CRDTDocument;

	getBlock(blockId: string): BlockHandle;
	simulateKeypress(key: string): void;
	simulateTyping(text: string): void;
	normalizeAll(): void;
	markDirty(blockId: string): void;
	normalizeDirty(): void;
}

export interface TestCollaboration {
	editorA: TestEditor;
	editorB: TestEditor;
	sync(): void;
}

export type NormalizedYjsValue =
	| null
	| boolean
	| number
	| string
	| NormalizedYjsValue[]
	| { [key: string]: NormalizedYjsValue };

export type YjsRootType = "array" | "map" | "text";

export interface YjsRootExpectation {
	name: string;
	type?: YjsRootType;
	optional?: boolean;
}

export interface NormalizedYDocSnapshot {
	roots: Record<string, NormalizedYjsValue>;
}

export interface DeterministicYDocFixtureOptions {
	blocks?: TestBlock[];
	clientId?: number;
	roots?: readonly YjsRootExpectation[];
	mutate?: (ydoc: Y.Doc) => void;
}

export interface DeterministicYDocFixture {
	ydoc: Y.Doc;
	doc: PenDocument;
	crdtDoc: CRDTDocument;
	update: Uint8Array;
	updateBase64: string;
	stateVector: Uint8Array;
	stateVectorBase64: string;
	snapshot: NormalizedYDocSnapshot;
}

export type TwoPeerId = "a" | "b";

export type TwoPeerInterleaving = "a-then-b" | "b-then-a";

export interface TwoPeerHarnessOptions extends TestEditorOptions {
	clientIdA?: number;
	clientIdB?: number;
	/** Mutate the seed editor before peers are forked from its encoded state. */
	prepare?: (editor: TestEditor) => void;
	/**
	 * Build each peer's extensions. An extension factory closes over the
	 * controller it activates, so two peers handed the same instance end up
	 * sharing one; anything with per-editor state needs this rather than
	 * `extensions`.
	 */
	extensionsFor?: (peer: TwoPeerId) => TestEditorOptions["extensions"];
}

export interface TwoPeer {
	readonly id: TwoPeerId;
	readonly editor: TestEditor;
	readonly adapter: CRDTAdapter;
	readonly crdtDoc: CRDTDocument;
}

export interface TwoPeerHarness {
	readonly peerA: TwoPeer;
	readonly peerB: TwoPeer;
	peer(id: TwoPeerId): TwoPeer;
	encodeUpdateFrom(from: TwoPeerId): Uint8Array;
	applyUpdateTo(to: TwoPeerId, update: Uint8Array): void;
	captureUpdates(): { fromA: Uint8Array; fromB: Uint8Array };
	exchange(interleaving?: TwoPeerInterleaving): void;
	sync(interleaving?: TwoPeerInterleaving): void;
	normalizeAll(): void;
	assertConverged(message?: string): void;
	snapshot(id?: TwoPeerId): NormalizedYDocSnapshot;
	destroy(): void;
}

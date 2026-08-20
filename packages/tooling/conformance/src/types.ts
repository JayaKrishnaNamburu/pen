import type { DocumentOp } from "@input/pen-types";
import type { StandingDiagnosticCode } from "./diagnosticsAllowlist";

export type LogicalPoint = {
	blockId: string;
	offset: number;
};

export type PointRef =
	| { block: number; offset: number }
	| { blockId: string; offset: number };

export type SerializedTextSelection = {
	type: "text";
	anchor: LogicalPoint;
	focus: LogicalPoint;
	isCollapsed: boolean;
};

export type SerializedBlockSelection = {
	type: "block";
	blockIds: string[];
};

export type SerializedAppSelection = {
	type: "app";
	appId: string;
};

export type SerializedCellSelection = {
	type: "cell";
	blockId: string;
	anchor: { row: number; col: number };
	head: { row: number; col: number };
};

export type SerializedSelection =
	| SerializedTextSelection
	| SerializedBlockSelection
	| SerializedAppSelection
	| SerializedCellSelection
	| null;

export type SerializedDiagnostic = {
	code: string;
	level: string;
	source: string;
	message: string;
};

export type ConformanceEventRecord = {
	type: string;
	payload: unknown;
};

export type DomAuthorityCheck = {
	ok: boolean;
	skipped?: boolean;
	reason?: string;
	authority?: SerializedSelection;
	dom?: { anchor: LogicalPoint; focus: LogicalPoint } | null;
};

export type HostileDomScan = {
	urlAttributes: string[];
	javascriptUrls: string[];
	blockedUrlCount: number;
	probeTripped: boolean;
};

export type RemoteYInjectArgs = {
	link?: { blockId: string; href: string };
	image?: { blockId: string; src: string };
};

export type RemoteSpliceArgs = {
	block: number;
	from: number;
	to: number;
	insert: string;
};

export type DragTextArgs = {
	from: PointRef;
	to: PointRef;
};

export type SelectionEqualsArgs = {
	anchor: PointRef;
	focus: PointRef;
};

export type PenConformanceBridge = {
	readonly selection: SerializedSelection;
	readonly lastEvents: readonly ConformanceEventRecord[];
	readonly diagnostics: readonly SerializedDiagnostic[];
	readonly documentText: string;
	readonly blockIds: readonly string[];
	readonly hasFocus: boolean;
	readonly fixtureName: string;
	readonly generation: number;
	load(name: string): void;
	apply(ops: readonly DocumentOp[]): void;
	remoteApply(ops: readonly DocumentOp[]): void;
	applyToolPayloads(payloads: readonly unknown[]): { ok: boolean; message?: string };
	importHtml(html: string): Promise<void>;
	pasteHtml(html: string): Promise<void>;
	scanHostileDom(): HostileDomScan;
	resetXssProbe(): void;
	remoteSplice(args: RemoteSpliceArgs): void;
	remoteInjectY(args: RemoteYInjectArgs): void;
	installBrokenProjector(): void;
	domMatchesAuthority(): DomAuthorityCheck;
};

export type ScenarioApi = {
	load(name: string): Promise<void>;
	apply(ops: readonly DocumentOp[]): Promise<void>;
	applyToolPayloads(payloadsJson: string): Promise<{ ok: boolean; message?: string }>;
	importHtml(html: string): Promise<void>;
	pasteHtml(html: string): Promise<void>;
	keyboard: {
		type(text: string): Promise<void>;
	};
	mouse: {
		dragText(args: DragTextArgs): Promise<void>;
	};
	remote: {
		splice(args: RemoteSpliceArgs): Promise<void>;
		apply(ops: readonly DocumentOp[]): Promise<void>;
		injectY(args: RemoteYInjectArgs): Promise<void>;
	};
	expectDiagnostic(code: StandingDiagnosticCode | string): void;
	installBrokenProjector(): Promise<void>;
	assert: {
		selectionEquals(expected: SelectionEqualsArgs): Promise<void>;
		domMatchesAuthority(): Promise<void>;
		textContains(text: string): Promise<void>;
		corpusSafe(options?: { requireBlockedUrl?: boolean }): Promise<void>;
		xssProbeNotTripped(): Promise<void>;
	};
};

declare global {
	interface Window {
		__penConformance: PenConformanceBridge;
		__xssProbe: () => void;
		__xssProbeTripped: boolean;
	}
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	createHeadlessEditor,
	getEditorSelectionRecord,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { DocumentOp } from "@input/pen-types";
import type { SerializedSelectionRecord } from "../../src/types";

export const AUTHORITY_TRACE_SCHEMA_VERSION = 1;
export const AUTHORITY_TRACE_SCRIPT_ID = "authority-v2-structural";

export const AUTHORITY_TRACES_PATH = fileURLToPath(
	new URL("./authorityTraces.v2.json", import.meta.url),
);

export type AuthorityCompareOutcome =
	| "matched"
	| "mismatch"
	| "could-not-check";

export type AuthorityCompareKind =
	| "implementation"
	| "stale-recording"
	| "self-replay"
	| "missing"
	| "inert-recording"
	| "incomplete-corpus";

export type AuthorityCompareCheck = {
	ok: boolean;
	skipped?: boolean;
	stale?: boolean;
	outcome: AuthorityCompareOutcome;
	kind?: AuthorityCompareKind;
	reason?: string;
	caseId?: string;
};

export type AuthorityTraceKind = "split" | "merge" | "remove";

export type AuthorityTraceRegion =
	| "head"
	| "tail"
	| "split-point"
	| "source"
	| "target"
	| "removed"
	| "kept";

export type DocumentFingerprint = {
	blockOrder: readonly string[];
	texts: Readonly<Record<string, string>>;
};

export type AuthorityTraceCaseDef = {
	id: string;
	kind: AuthorityTraceKind;
	region: AuthorityTraceRegion;
	setup: readonly DocumentOp[];
	select: { blockId: string; offset: number };
	commit: readonly DocumentOp[];
};

export type AuthorityTraceCase = AuthorityTraceCaseDef & {
	before: SerializedSelectionRecord;
	after: SerializedSelectionRecord;
	documentAfter: DocumentFingerprint;
};

export type AuthorityTrace = {
	schemaVersion: number;
	scriptId: string;
	scriptHash: string;
	cases: AuthorityTraceCase[];
};

const MEADOW = "meadow sage";
const SPLIT_AT = 6;

const insertParagraph = (blockId: string, text: string): DocumentOp[] => [
	{
		type: "insert-block",
		blockId,
		blockType: "paragraph",
		props: {},
		position: "last",
	},
	{ type: "insert-text", blockId, offset: 0, text },
];

export const AUTHORITY_TRACE_SCRIPT: readonly AuthorityTraceCaseDef[] = [
	{
		id: "split-head",
		kind: "split",
		region: "head",
		setup: insertParagraph("b1", MEADOW),
		select: { blockId: "b1", offset: 3 },
		commit: [
			{
				type: "split-block",
				blockId: "b1",
				offset: SPLIT_AT,
				newBlockId: "b2",
			},
		],
	},
	{
		id: "split-point",
		kind: "split",
		region: "split-point",
		setup: insertParagraph("b1", MEADOW),
		select: { blockId: "b1", offset: SPLIT_AT },
		commit: [
			{
				type: "split-block",
				blockId: "b1",
				offset: SPLIT_AT,
				newBlockId: "b2",
			},
		],
	},
	{
		id: "split-tail",
		kind: "split",
		region: "tail",
		setup: insertParagraph("b1", MEADOW),
		select: { blockId: "b1", offset: 9 },
		commit: [
			{
				type: "split-block",
				blockId: "b1",
				offset: SPLIT_AT,
				newBlockId: "b2",
			},
		],
	},
	{
		id: "merge-target",
		kind: "merge",
		region: "target",
		setup: [
			...insertParagraph("b1", "meadow"),
			...insertParagraph("b2", " sage"),
		],
		select: { blockId: "b1", offset: 3 },
		commit: [
			{
				type: "merge-blocks",
				targetBlockId: "b1",
				sourceBlockId: "b2",
			},
		],
	},
	{
		id: "merge-source",
		kind: "merge",
		region: "source",
		setup: [
			...insertParagraph("b1", "meadow"),
			...insertParagraph("b2", " sage"),
		],
		select: { blockId: "b2", offset: 1 },
		commit: [
			{
				type: "merge-blocks",
				targetBlockId: "b1",
				sourceBlockId: "b2",
			},
		],
	},
	{
		id: "remove-selected",
		kind: "remove",
		region: "removed",
		setup: [
			...insertParagraph("b1", "stay"),
			...insertParagraph("b2", "gone"),
		],
		select: { blockId: "b2", offset: 0 },
		commit: [{ type: "delete-block", blockId: "b2" }],
	},
	{
		id: "remove-kept",
		kind: "remove",
		region: "kept",
		setup: [
			...insertParagraph("b1", "stay"),
			...insertParagraph("b2", "gone"),
		],
		select: { blockId: "b1", offset: 2 },
		commit: [{ type: "delete-block", blockId: "b2" }],
	},
];

export const MOVING_CASE_IDS = [
	"split-point",
	"split-tail",
	"merge-source",
	"remove-selected",
] as const;

/**
 * v2 `mapPoint` landings (validation §3 / A5 assoc 1 on a collapsed caret).
 * Copy-split Yjs resolve stays on the source for split-point and split-tail;
 * those two are the cases a flat insert corpus cannot distinguish.
 */
export const AUTHORITY_ALGEBRA_AFTER: Readonly<
	Record<string, { blockId: string; offset: number }>
> = {
	"split-head": { blockId: "b1", offset: 3 },
	"split-point": { blockId: "b2", offset: 0 },
	"split-tail": { blockId: "b2", offset: 3 },
	"merge-target": { blockId: "b1", offset: 3 },
	"merge-source": { blockId: "b1", offset: 7 },
	"remove-selected": { blockId: "b1", offset: 0 },
	"remove-kept": { blockId: "b1", offset: 2 },
};

const COMMIT_TYPE_BY_KIND: Readonly<Record<AuthorityTraceKind, DocumentOp["type"]>> =
	{
		split: "split-block",
		merge: "merge-blocks",
		remove: "delete-block",
	};

export function authorityTraceScriptHash(
	script: readonly AuthorityTraceCaseDef[] = AUTHORITY_TRACE_SCRIPT,
): string {
	return JSON.stringify(script);
}

export const AUTHORITY_TRACE_SCRIPT_HASH = authorityTraceScriptHash();

function fingerprintsEqual(
	left: DocumentFingerprint,
	right: DocumentFingerprint,
): boolean {
	if (left.blockOrder.length !== right.blockOrder.length) {
		return false;
	}
	for (let index = 0; index < left.blockOrder.length; index += 1) {
		if (left.blockOrder[index] !== right.blockOrder[index]) {
			return false;
		}
	}
	const leftKeys = Object.keys(left.texts);
	const rightKeys = Object.keys(right.texts);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}
	for (const key of leftKeys) {
		if (left.texts[key] !== right.texts[key]) {
			return false;
		}
	}
	return true;
}

function recordsEqual(
	left: SerializedSelectionRecord,
	right: SerializedSelectionRecord,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function statesEqual(
	left: SerializedSelectionRecord,
	right: SerializedSelectionRecord,
): boolean {
	return (
		JSON.stringify(left.state) === JSON.stringify(right.state) &&
		left.origin === right.origin
	);
}

function selectionMoved(
	before: SerializedSelectionRecord,
	after: SerializedSelectionRecord,
): boolean {
	return JSON.stringify(before.state) !== JSON.stringify(after.state);
}

function matched(): AuthorityCompareCheck {
	return { ok: true, outcome: "matched" };
}

function mismatch(
	reason: string,
	caseId?: string,
): AuthorityCompareCheck {
	return {
		ok: false,
		outcome: "mismatch",
		kind: "implementation",
		reason,
		caseId,
	};
}

function couldNotCheck(
	kind: AuthorityCompareKind,
	reason: string,
	caseId?: string,
): AuthorityCompareCheck {
	return {
		ok: false,
		skipped: true,
		stale: kind === "stale-recording",
		outcome: "could-not-check",
		kind,
		reason,
		caseId,
	};
}

export function authorityCompareKind(
	result: AuthorityCompareCheck,
): AuthorityCompareOutcome {
	return result.outcome;
}

export function formatAuthorityCompareReport(
	check: string,
	result: AuthorityCompareCheck,
): string {
	const detail = result.reason;
	if (result.outcome === "could-not-check") {
		return detail === undefined
			? `skipped: ${check}`
			: `skipped: ${check} — ${detail}`;
	}
	if (result.outcome === "mismatch") {
		return detail === undefined
			? `failed: ${check}`
			: `failed: ${check} — ${detail}`;
	}
	return `passed: ${check}`;
}

function documentFingerprint(editor: {
	documentState: { blockOrder: readonly string[] };
	getBlock(blockId: string): { textContent(): string } | null;
}): DocumentFingerprint {
	const blockOrder = [...editor.documentState.blockOrder];
	const texts: Record<string, string> = {};
	for (const blockId of blockOrder) {
		texts[blockId] = editor.getBlock(blockId)?.textContent() ?? "";
	}
	return { blockOrder, texts };
}

function snapshotRecord(
	editor: Parameters<typeof getEditorSelectionRecord>[0],
): SerializedSelectionRecord | null {
	const record = getEditorSelectionRecord(editor);
	if (record == null) {
		return null;
	}
	const state = record.state;
	if (state == null) {
		return {
			version: record.version,
			origin: record.origin,
			commitId: record.commitId,
			state: null,
		};
	}
	if (state.type !== "text") {
		throw new Error(
			`authorityCompare: expected a text selection, got ${state.type}`,
		);
	}
	return {
		version: record.version,
		origin: record.origin,
		commitId: record.commitId,
		state: {
			type: "text",
			anchor: {
				blockId: state.anchor.blockId,
				offset: state.anchor.offset,
			},
			focus: {
				blockId: state.focus.blockId,
				offset: state.focus.offset,
			},
			isCollapsed:
				state.anchor.blockId === state.focus.blockId &&
				state.anchor.offset === state.focus.offset,
		},
	};
}

export function recordAuthorityTraces(
	script: readonly AuthorityTraceCaseDef[] = AUTHORITY_TRACE_SCRIPT,
): AuthorityTrace {
	const cases: AuthorityTraceCase[] = [];
	for (const def of script) {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const seed = editor.firstBlock()?.id;
		const setup: DocumentOp[] = [
			...(seed === undefined
				? []
				: [{ type: "delete-block" as const, blockId: seed }]),
			...def.setup,
		];
		editor.apply(setup);
		editor.selectText(def.select.blockId, def.select.offset, def.select.offset);
		const before = snapshotRecord(editor);
		if (before == null) {
			editor.destroy();
			throw new Error(
				`authorityCompare: ${def.id} produced no selection record before commit`,
			);
		}
		editor.apply([...def.commit]);
		const after = snapshotRecord(editor);
		if (after == null) {
			editor.destroy();
			throw new Error(
				`authorityCompare: ${def.id} produced no selection record after commit`,
			);
		}
		const recorded: AuthorityTraceCase = {
			...def,
			before,
			after,
			documentAfter: documentFingerprint(editor),
		};
		editor.destroy();
		cases.push(recorded);
	}
	return {
		schemaVersion: AUTHORITY_TRACE_SCHEMA_VERSION,
		scriptId: AUTHORITY_TRACE_SCRIPT_ID,
		scriptHash: authorityTraceScriptHash(script),
		cases,
	};
}

export function loadCommittedAuthorityTrace(
	path: string = AUTHORITY_TRACES_PATH,
): AuthorityTrace | null {
	try {
		const raw = readFileSync(path, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed == null ||
			typeof parsed !== "object" ||
			!("cases" in parsed) ||
			!Array.isArray((parsed as AuthorityTrace).cases)
		) {
			return null;
		}
		return parsed as AuthorityTrace;
	} catch {
		return null;
	}
}

export function inventoryHolds(
	recording: AuthorityTrace | null | undefined,
): AuthorityCompareCheck {
	if (recording == null) {
		return couldNotCheck("missing", "recording is not available");
	}
	if (recording.cases.length === 0) {
		return couldNotCheck("incomplete-corpus", "recording has no cases");
	}
	const kinds = new Set(recording.cases.map((entry) => entry.kind));
	for (const kind of ["split", "merge", "remove"] as const) {
		if (!kinds.has(kind)) {
			return couldNotCheck(
				"incomplete-corpus",
				`recording has no ${kind} case`,
			);
		}
	}
	for (const entry of recording.cases) {
		const commitType = COMMIT_TYPE_BY_KIND[entry.kind];
		if (!entry.commit.some((op) => op.type === commitType)) {
			return couldNotCheck(
				"incomplete-corpus",
				`${entry.id}: kind ${entry.kind} has no ${commitType} commit`,
				entry.id,
			);
		}
	}
	for (const caseId of MOVING_CASE_IDS) {
		const entry = recording.cases.find((item) => item.id === caseId);
		if (entry === undefined) {
			return couldNotCheck(
				"incomplete-corpus",
				`recording is missing required case ${caseId}`,
			);
		}
		if (!selectionMoved(entry.before, entry.after)) {
			return couldNotCheck(
				"inert-recording",
				`${caseId}: selection did not move — recording cannot oracle a no-op authority`,
				caseId,
			);
		}
	}
	return matched();
}

export function compareAuthorityTraces(
	expected: AuthorityTrace | null | undefined,
	live: AuthorityTrace | null | undefined,
): AuthorityCompareCheck {
	if (expected == null || live == null) {
		return couldNotCheck("missing", "recording or live trace is not available");
	}
	if (expected === live || expected.cases === live.cases) {
		return couldNotCheck(
			"self-replay",
			"replay compared a recording to itself",
		);
	}
	if (expected.schemaVersion !== AUTHORITY_TRACE_SCHEMA_VERSION) {
		return couldNotCheck(
			"stale-recording",
			`recording schemaVersion ${expected.schemaVersion} is not ${AUTHORITY_TRACE_SCHEMA_VERSION}`,
		);
	}
	if (live.schemaVersion !== AUTHORITY_TRACE_SCHEMA_VERSION) {
		return couldNotCheck(
			"stale-recording",
			`live schemaVersion ${live.schemaVersion} is not ${AUTHORITY_TRACE_SCHEMA_VERSION}`,
		);
	}
	if (expected.scriptHash !== AUTHORITY_TRACE_SCRIPT_HASH) {
		return couldNotCheck(
			"stale-recording",
			"recording scriptHash does not match the current script",
		);
	}
	if (live.scriptHash !== expected.scriptHash) {
		return couldNotCheck(
			"stale-recording",
			"live scriptHash does not match the recording",
		);
	}
	if (expected.cases.length !== live.cases.length) {
		return couldNotCheck(
			"stale-recording",
			`case count ${live.cases.length} does not match recording ${expected.cases.length}`,
		);
	}
	for (let index = 0; index < expected.cases.length; index += 1) {
		const want = expected.cases[index];
		const got = live.cases[index];
		if (want === undefined || got === undefined) {
			return couldNotCheck(
				"stale-recording",
				"case list is sparse",
			);
		}
		if (want.id !== got.id) {
			return couldNotCheck(
				"stale-recording",
				`case ${index} is ${got.id}, recording has ${want.id}`,
				got.id,
			);
		}
		if (!fingerprintsEqual(want.documentAfter, got.documentAfter)) {
			return couldNotCheck(
				"stale-recording",
				`${want.id}: document after the commit does not match the recording`,
				want.id,
			);
		}
		if (!recordsEqual(want.before, got.before)) {
			return mismatch(
				`${want.id}: selection before the commit does not match the recording`,
				want.id,
			);
		}
		if (!recordsEqual(want.after, got.after)) {
			return mismatch(
				`${want.id}: selection after the commit does not match the recording`,
				want.id,
			);
		}
	}
	return matched();
}

export function cloneAuthorityTrace(trace: AuthorityTrace): AuthorityTrace {
	return structuredClone(trace);
}

export function noopAuthorityTrace(trace: AuthorityTrace): AuthorityTrace {
	const clone = cloneAuthorityTrace(trace);
	for (const entry of clone.cases) {
		entry.after = structuredClone(entry.before);
	}
	return clone;
}

function textPointOf(
	record: SerializedSelectionRecord,
): { blockId: string; offset: number } | null {
	const state = record.state;
	if (state == null || state.type !== "text") {
		return null;
	}
	return {
		blockId: state.anchor.blockId,
		offset: state.anchor.offset,
	};
}

function algebraIdentity(
	caseId: string,
	before: SerializedSelectionRecord,
): boolean {
	const expected = AUTHORITY_ALGEBRA_AFTER[caseId];
	const point = textPointOf(before);
	if (expected === undefined || point === null) {
		return false;
	}
	return (
		point.blockId === expected.blockId && point.offset === expected.offset
	);
}

export function applyAlgebraLandings(trace: AuthorityTrace): AuthorityTrace {
	const clone = cloneAuthorityTrace(trace);
	for (const entry of clone.cases) {
		const expected = AUTHORITY_ALGEBRA_AFTER[entry.id];
		if (expected === undefined) {
			continue;
		}
		if (algebraIdentity(entry.id, entry.before)) {
			entry.after = structuredClone(entry.before);
			continue;
		}
		entry.after = {
			version: 2,
			origin: "mapped",
			commitId: 3,
			state: {
				type: "text",
				anchor: { blockId: expected.blockId, offset: expected.offset },
				focus: { blockId: expected.blockId, offset: expected.offset },
				isCollapsed: true,
			},
		};
	}
	return clone;
}

export function algebraHolds(
	trace: AuthorityTrace | null | undefined,
): AuthorityCompareCheck {
	if (trace == null) {
		return couldNotCheck("missing", "recording is not available");
	}
	if (trace.cases.length === 0) {
		return couldNotCheck("incomplete-corpus", "recording has no cases");
	}
	for (const entry of trace.cases) {
		const expected = AUTHORITY_ALGEBRA_AFTER[entry.id];
		if (expected === undefined) {
			return couldNotCheck(
				"incomplete-corpus",
				`no algebra landing for ${entry.id}`,
				entry.id,
			);
		}
		const got = textPointOf(entry.after);
		if (got === null) {
			return couldNotCheck(
				"missing",
				`${entry.id}: after-state is not a text selection`,
				entry.id,
			);
		}
		if (got.blockId !== expected.blockId || got.offset !== expected.offset) {
			return mismatch(
				`${entry.id}: authority landed ${got.blockId}:${got.offset}, algebra expects ${expected.blockId}:${expected.offset}`,
				entry.id,
			);
		}
	}
	return matched();
}

export function describeAuthorityTracePopulation(
	trace: AuthorityTrace | null | undefined,
): string {
	if (trace == null || trace.cases.length === 0) {
		return "authorityTraces.v2.json → 0 cases";
	}
	const counts: Record<AuthorityTraceKind, number> = {
		split: 0,
		merge: 0,
		remove: 0,
	};
	for (const entry of trace.cases) {
		counts[entry.kind] += 1;
	}
	const ids = trace.cases.map((entry) => entry.id).join(", ");
	return `authorityTraces.v2.json → ${trace.cases.length} cases (${counts.split} split, ${counts.merge} merge, ${counts.remove} remove): ${ids}`;
}

export function insertOnlyAuthorityScript(): AuthorityTraceCaseDef[] {
	return [
		{
			id: "insert-only-split",
			kind: "split",
			region: "head",
			setup: insertParagraph("b1", MEADOW),
			select: { blockId: "b1", offset: 3 },
			commit: [{ type: "insert-text", blockId: "b1", offset: 3, text: "x" }],
		},
		{
			id: "insert-only-merge",
			kind: "merge",
			region: "target",
			setup: insertParagraph("b1", MEADOW),
			select: { blockId: "b1", offset: 3 },
			commit: [{ type: "insert-text", blockId: "b1", offset: 3, text: "y" }],
		},
		{
			id: "insert-only-remove",
			kind: "remove",
			region: "kept",
			setup: insertParagraph("b1", MEADOW),
			select: { blockId: "b1", offset: 3 },
			commit: [{ type: "insert-text", blockId: "b1", offset: 3, text: "z" }],
		},
	];
}

export function statesOnlyEqual(
	left: SerializedSelectionRecord,
	right: SerializedSelectionRecord,
): boolean {
	return statesEqual(left, right);
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	applyMergeBlocks,
	applySplitBlock,
	createHeadlessEditor,
	getEditorSelectionRecord
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { DocumentOp } from "@input/pen-types";
import {
	commitIsStructuralSequence,
	structuralSequenceLabel,
	translateRecordedAuthorityOps,
	type RecordedAuthorityOp
} from "./authorityTranslate.js";
import type { SerializedSelectionRecord } from "./types";

export type { RecordedAuthorityOp } from "./authorityTranslate.js";
export { commitIsStructuralSequence } from "./authorityTranslate.js";

const AUTHORITY_TRACE_SCHEMA_VERSION = 1;
const AUTHORITY_TRACE_SCRIPT_ID = "authority-v2-structural";

const AUTHORITY_TRACES_PATH = fileURLToPath(
	new URL("./authorityTraces.v2.json", import.meta.url),
);

/**
 * Standing three-way. `unchecked` is "could not check" — unfocused,
 * non-text, missing/stale recording, self-replay. It is never a hold.
 */
export type AuthorityCompareOutcome = "matched" | "mismatch" | "unchecked";

export type AuthorityCompareKind =
	| "implementation"
	| "stale-recording"
	| "self-replay"
	| "missing"
	| "inert-recording"
	| "incomplete-corpus"
	| "unfocused"
	| "non-text";

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
	setup: readonly RecordedAuthorityOp[];
	select: { blockId: string; offset: number };
	commit: readonly RecordedAuthorityOp[];
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

const recordedParagraph = (
	blockId: string,
	text: string,
): RecordedAuthorityOp[] => [
	{
		type: "insert-block",
		blockId,
		blockType: "paragraph",
		props: {},
		position: "last"
	},
	{ type: "insert-text", blockId, offset: 0, text },
];

const insertParagraph = (
	blockId: string,
	text: string,
): RecordedAuthorityOp[] => [
	{
		type: "insert-block",
		blockId,
		blockType: "paragraph",
		props: {},
		position: "last"
	},
	{ type: "splice-text", blockId, from: 0, to: 0, insert: text },
];

/**
 * Recorded v2 script. Hash must match `authorityTraces.v2.json`.
 * Replay translates `insert-text` / `split-block` / `merge-blocks`.
 */
export const AUTHORITY_TRACE_SCRIPT: readonly AuthorityTraceCaseDef[] = [
	{
		id: "split-head",
		kind: "split",
		region: "head",
		setup: recordedParagraph("b1", MEADOW),
		select: { blockId: "b1", offset: 3 },
		commit: [
			{
				type: "split-block",
				blockId: "b1",
				offset: SPLIT_AT,
				newBlockId: "b2"
			},
		]
	},
	{
		id: "split-point",
		kind: "split",
		region: "split-point",
		setup: recordedParagraph("b1", MEADOW),
		select: { blockId: "b1", offset: SPLIT_AT },
		commit: [
			{
				type: "split-block",
				blockId: "b1",
				offset: SPLIT_AT,
				newBlockId: "b2"
			},
		]
	},
	{
		id: "split-tail",
		kind: "split",
		region: "tail",
		setup: recordedParagraph("b1", MEADOW),
		select: { blockId: "b1", offset: 9 },
		commit: [
			{
				type: "split-block",
				blockId: "b1",
				offset: SPLIT_AT,
				newBlockId: "b2"
			},
		]
	},
	{
		id: "merge-target",
		kind: "merge",
		region: "target",
		setup: [
			...recordedParagraph("b1", "meadow"),
			...recordedParagraph("b2", " sage"),
		],
		select: { blockId: "b1", offset: 3 },
		commit: [
			{
				type: "merge-blocks",
				targetBlockId: "b1",
				sourceBlockId: "b2"
			},
		]
	},
	{
		id: "merge-source",
		kind: "merge",
		region: "source",
		setup: [
			...recordedParagraph("b1", "meadow"),
			...recordedParagraph("b2", " sage"),
		],
		select: { blockId: "b2", offset: 1 },
		commit: [
			{
				type: "merge-blocks",
				targetBlockId: "b1",
				sourceBlockId: "b2"
			},
		]
	},
	{
		id: "remove-selected",
		kind: "remove",
		region: "removed",
		setup: [
			...recordedParagraph("b1", "stay"),
			...recordedParagraph("b2", "gone"),
		],
		select: { blockId: "b2", offset: 0 },
		commit: [{ type: "delete-block", blockId: "b2" }]
	},
	{
		id: "remove-kept",
		kind: "remove",
		region: "kept",
		setup: [
			...recordedParagraph("b1", "stay"),
			...recordedParagraph("b2", "gone"),
		],
		select: { blockId: "b1", offset: 2 },
		commit: [{ type: "delete-block", blockId: "b2" }]
	},
];

const MOVING_CASE_IDS = [
	"split-point",
	"split-tail",
	"merge-source",
	"remove-selected",
] as const;

/**
 * v2 `mapPoint` landings (validation §3 / A5 assoc 1 on a collapsed caret).
 * `remove-selected` lands at `b1:4` because the preceding sibling keeps
 * its length ("stay") when the removed block has no follower.
 */
const AUTHORITY_ALGEBRA_AFTER: Readonly<
	Record<string, { blockId: string; offset: number }>
> = {
	"split-head": { blockId: "b1", offset: 3 },
	"split-point": { blockId: "b2", offset: 0 },
	"split-tail": { blockId: "b2", offset: 3 },
	"merge-target": { blockId: "b1", offset: 3 },
	"merge-source": { blockId: "b1", offset: 7 },
	"remove-selected": { blockId: "b1", offset: 4 },
	"remove-kept": { blockId: "b1", offset: 2 }
};

function authorityTraceScriptHash(
	script: readonly AuthorityTraceCaseDef[] = AUTHORITY_TRACE_SCRIPT,
): string {
	return JSON.stringify(script);
}

export const AUTHORITY_TRACE_SCRIPT_HASH = authorityTraceScriptHash();

function fingerprintsEqual(
	left: DocumentFingerprint,
	right: DocumentFingerprint,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

// `commitId` is deliberately excluded, and this is the one field the recording
// stopped being able to oracle. It is a document-wide counter, not authority
// behaviour: OB6 (2026-08-24) stopped document construction from consuming an
// id, which shifted every absolute commit number down by one while leaving
// every selection outcome byte-identical. Re-recording the corpus is forbidden
// — it is the only surviving evidence of the earlier authority behaviour, and a
// re-record would compare the new world against itself — and a blanket offset
// would make any future off-by-one permanently invisible.
//
// `state`, `version` and `origin` stay compared, so both pinned failure modes
// still fail by name: a no-op authority (`noopAuthorityTrace`) differs in
// `state` and `version`, and a copy-split that stays on the source
// (`stayOnSourceAuthorityTrace`) differs in `state`.
function recordsEqual(
	left: SerializedSelectionRecord,
	right: SerializedSelectionRecord,
): boolean {
	const { commitId: _leftCommitId, ...leftRest } = left;
	const { commitId: _rightCommitId, ...rightRest } = right;
	return JSON.stringify(leftRest) === JSON.stringify(rightRest);
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

function mismatch(reason: string, caseId?: string): AuthorityCompareCheck {
	return {
		ok: false,
		outcome: "mismatch",
		kind: "implementation",
		reason,
		caseId
	};
}

function unchecked(
	kind: AuthorityCompareKind,
	reason: string,
	caseId?: string,
): AuthorityCompareCheck {
	return {
		ok: false,
		skipped: true,
		stale: kind === "stale-recording",
		outcome: "unchecked",
		kind,
		reason,
		caseId
	};
}

export function authorityCompareKind(
	result: AuthorityCompareCheck,
): AuthorityCompareOutcome {
	return result.outcome;
}

/** Only `matched` is a hold. `unchecked` is not success. */
export function authorityTraceHolds(result: AuthorityCompareCheck): boolean {
	return result.outcome === "matched";
}

export function formatAuthorityCompareReport(
	check: string,
	result: AuthorityCompareCheck,
): string {
	const detail = result.reason;
	if (result.outcome === "unchecked") {
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
			state: null
		};
	}
	if (state.type !== "text") {
		return {
			version: record.version,
			origin: record.origin,
			commitId: record.commitId,
			state:
				state.type === "block"
					? { type: "block", blockIds: [...state.blockIds] }
					: state.type === "app"
						? { type: "app", appId: state.appId }
						: {
								type: "cell",
								blockId: state.blockId,
								anchor: { ...state.anchor },
								head: { ...state.head }
							}
		};
	}
	return {
		version: record.version,
		origin: record.origin,
		commitId: record.commitId,
		state: {
			type: "text",
			anchor: {
				blockId: state.anchor.blockId,
				offset: state.anchor.offset
			},
			focus: {
				blockId: state.focus.blockId,
				offset: state.focus.offset
			},
			isCollapsed:
				state.anchor.blockId === state.focus.blockId &&
				state.anchor.offset === state.focus.offset,
		}
	};
}

function replayAuthorityCommit(
	editor: Parameters<typeof applySplitBlock>[0],
	commit: readonly RecordedAuthorityOp[],
): void {
	for (const op of commit) {
		if (op.type === "split-block") {
			applySplitBlock(editor, {
				blockId: op.blockId,
				offset: op.offset,
				newBlockId: op.newBlockId
			});
			return;
		}
		if (op.type === "merge-blocks") {
			applyMergeBlocks(editor, {
				targetBlockId: op.targetBlockId,
				sourceBlockId: op.sourceBlockId
			});
			return;
		}
	}
	const live = translateRecordedAuthorityOps(commit);
	if (live.length > 0) {
		editor.apply(live);
	}
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
			...translateRecordedAuthorityOps(def.setup),
		];
		editor.apply(setup);
		editor.selectText(
			def.select.blockId,
			def.select.offset,
			def.select.offset,
		);
		const before = snapshotRecord(editor);
		if (before == null) {
			editor.destroy();
			throw new Error(
				`authorityCompare: ${def.id} produced no selection record before commit`,
			);
		}
		replayAuthorityCommit(editor, def.commit);
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
			documentAfter: documentFingerprint(editor)
		};
		editor.destroy();
		cases.push(recorded);
	}
	return {
		schemaVersion: AUTHORITY_TRACE_SCHEMA_VERSION,
		scriptId: AUTHORITY_TRACE_SCRIPT_ID,
		scriptHash: authorityTraceScriptHash(script),
		cases
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
		return unchecked("missing", "recording is not available");
	}
	if (recording.cases.length === 0) {
		return unchecked("incomplete-corpus", "recording has no cases");
	}
	const kinds = new Set(recording.cases.map((entry) => entry.kind));
	for (const kind of ["split", "merge", "remove"] as const) {
		if (!kinds.has(kind)) {
			return unchecked(
				"incomplete-corpus",
				`recording has no ${kind} case`,
			);
		}
	}
	for (const entry of recording.cases) {
		try {
			if (
				!commitIsStructuralSequence(
					entry.kind,
					entry.commit,
					entry.setup,
				)
			) {
				return unchecked(
					"incomplete-corpus",
					`${entry.id}: kind ${entry.kind} has no ${structuralSequenceLabel(entry.kind)} commit`,
					entry.id,
				);
			}
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : String(error);
			return unchecked(
				"incomplete-corpus",
				`${entry.id}: ${detail}`,
				entry.id,
			);
		}
	}
	for (const caseId of MOVING_CASE_IDS) {
		const entry = recording.cases.find((item) => item.id === caseId);
		if (entry === undefined) {
			return unchecked(
				"incomplete-corpus",
				`recording is missing required case ${caseId}`,
			);
		}
		if (!selectionMoved(entry.before, entry.after)) {
			return unchecked(
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
		return unchecked("missing", "recording or live trace is not available");
	}
	if (expected === live || expected.cases === live.cases) {
		return unchecked(
			"self-replay",
			"replay compared a recording to itself",
		);
	}
	if (expected.schemaVersion !== AUTHORITY_TRACE_SCHEMA_VERSION) {
		return unchecked(
			"stale-recording",
			`recording schemaVersion ${expected.schemaVersion} is not ${AUTHORITY_TRACE_SCHEMA_VERSION}`,
		);
	}
	if (live.schemaVersion !== AUTHORITY_TRACE_SCHEMA_VERSION) {
		return unchecked(
			"stale-recording",
			`live schemaVersion ${live.schemaVersion} is not ${AUTHORITY_TRACE_SCHEMA_VERSION}`,
		);
	}
	if (expected.scriptHash !== AUTHORITY_TRACE_SCRIPT_HASH) {
		return unchecked(
			"stale-recording",
			"recording scriptHash does not match the current script",
		);
	}
	if (live.scriptHash !== expected.scriptHash) {
		return unchecked(
			"stale-recording",
			"live scriptHash does not match the recording",
		);
	}
	if (expected.cases.length !== live.cases.length) {
		return unchecked(
			"stale-recording",
			`case count ${live.cases.length} does not match recording ${expected.cases.length}`,
		);
	}
	for (let index = 0; index < expected.cases.length; index += 1) {
		const want = expected.cases[index];
		const got = live.cases[index];
		if (want === undefined || got === undefined) {
			return unchecked("stale-recording", "case list is sparse");
		}
		if (want.id !== got.id) {
			return unchecked(
				"stale-recording",
				`case ${index} is ${got.id}, recording has ${want.id}`,
				got.id,
			);
		}
		if (!fingerprintsEqual(want.documentAfter, got.documentAfter)) {
			return unchecked(
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

// a trace is JSON by construction — the corpus is read with JSON.parse and written with
// JSON.stringify — so a JSON round trip is an exact clone here, not a degraded fallback.
// this is deliberately NOT structuredClone: HOST3 puts that above the floor, and taking an
// allowlist waiver would file a node-only replay in a ledger about browser degradation.
function cloneTraceJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneAuthorityTrace(trace: AuthorityTrace): AuthorityTrace {
	return cloneTraceJson(trace);
}

export function noopAuthorityTrace(trace: AuthorityTrace): AuthorityTrace {
	const clone = cloneAuthorityTrace(trace);
	for (const entry of clone.cases) {
		entry.after = cloneTraceJson(entry.before);
	}
	return clone;
}

/** Copy-split that stays on the source — the validation's stuck-source case. */
export function stayOnSourceAuthorityTrace(
	trace: AuthorityTrace,
): AuthorityTrace {
	const clone = cloneAuthorityTrace(trace);
	for (const entry of clone.cases) {
		if (entry.id === "split-point" || entry.id === "split-tail") {
			entry.after = cloneTraceJson(entry.before);
		}
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
		offset: state.anchor.offset
	};
}

export function algebraHolds(
	trace: AuthorityTrace | null | undefined,
): AuthorityCompareCheck {
	if (trace == null) {
		return unchecked("missing", "recording is not available");
	}
	if (trace.cases.length === 0) {
		return unchecked("incomplete-corpus", "recording has no cases");
	}
	for (const entry of trace.cases) {
		const expected = AUTHORITY_ALGEBRA_AFTER[entry.id];
		if (expected === undefined) {
			return unchecked(
				"incomplete-corpus",
				`no algebra landing for ${entry.id}`,
				entry.id,
			);
		}
		const got = textPointOf(entry.after);
		if (got === null) {
			return unchecked(
				"non-text",
				`${entry.id}: after-state is not a text selection`,
				entry.id,
			);
		}
		if (
			got.blockId !== expected.blockId ||
			got.offset !== expected.offset
		) {
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
		remove: 0
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
			commit: [
				{ type: "splice-text", blockId: "b1", from: 3,
				to: 3,
				insert: "x" },
			]
		},
		{
			id: "insert-only-merge",
			kind: "merge",
			region: "target",
			setup: insertParagraph("b1", MEADOW),
			select: { blockId: "b1", offset: 3 },
			commit: [
				{ type: "splice-text", blockId: "b1", from: 3,
				to: 3,
				insert: "y" },
			]
		},
		{
			id: "insert-only-remove",
			kind: "remove",
			region: "kept",
			setup: insertParagraph("b1", MEADOW),
			select: { blockId: "b1", offset: 3 },
			commit: [
				{ type: "splice-text", blockId: "b1", from: 3,
				to: 3,
				insert: "z" },
			]
		},
	];
}

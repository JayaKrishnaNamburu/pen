import type {
	Anchor,
	Assoc,
	CommitEventSource,
	Editor,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { isYjsCRDTDocument } from "@input/pen-crdt-yjs";

import {
	applyMergeBlocks,
	applySplitBlock,
	deriveContentMoves,
	repairAnchor,
} from "../index";
import { createEditor as createCoreEditor } from "../index";
import { createDefaultSchema } from "./fixtures/testSchema";

const NIGHTLY = Boolean(process.env.PEN_FUZZ_NIGHTLY);
const SEED_INFO = parseFuzzSeed(process.env.PEN_FUZZ_SEED);
const SEED = SEED_INFO.numeric;
const OP_COUNT = resolveOpCount();
const FORCE_FAIL_AT = Number(process.env.PEN_FUZZ_FORCE_FAIL_AT);

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function parseFuzzSeed(raw: string | undefined): {
	raw: string;
	numeric: number;
} {
	const source = raw && raw.length > 0 ? raw : "20260822";
	const asNumber = Number(source);
	if (Number.isFinite(asNumber)) {
		return { raw: source, numeric: asNumber >>> 0 };
	}
	let hash = 2166136261;
	for (let i = 0; i < source.length; i++) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return { raw: source, numeric: hash >>> 0 };
}

function resolveOpCount(): number {
	const override = Number(process.env.PEN_FUZZ_OP_COUNT);
	if (Number.isFinite(override) && override > 0) {
		return Math.floor(override);
	}
	return NIGHTLY ? 1_000_000 : 10_000;
}

class Rng {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0;
	}

	next(): number {
		this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
		return this.state / 0x100000000;
	}

	int(max: number): number {
		if (max <= 0) {
			return 0;
		}
		return Math.floor(this.next() * max);
	}

	pick<T>(items: readonly T[]): T {
		return items[this.int(items.length)]!;
	}
}

type Point = { blockId: string; offset: number };

type ActionKind =
	| "insert"
	| "delete"
	| "split"
	| "merge"
	| "remove"
	| "remote"
	| "undo"
	| "redo"
	| "stream";

interface Tracked {
	anchor: Anchor;
	point: Point | null;
	assoc: Assoc;
}

interface Model {
	texts: Map<string, string>;
	order: string[];
}

const SOURCES: readonly CommitEventSource[] = [
	"apply",
	"remote",
	"undo",
	"redo",
	"stream",
];

function createEditor(): Editor {
	return createCoreEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function logicalText(editor: Editor, blockId: string): string {
	return editor.getBlock(blockId)?.textContent() ?? "";
}

function snapshotModel(editor: Editor): Model {
	const order = [...editor.documentState.blockOrder];
	const texts = new Map<string, string>();
	for (const id of order) {
		texts.set(id, logicalText(editor, id));
	}
	return { texts, order };
}

function clamp(offset: number, length: number): number {
	if (!Number.isFinite(offset) || offset < 0) {
		return 0;
	}
	return Math.max(0, Math.min(offset, length));
}

function mapInsert(
	point: Point,
	assoc: Assoc,
	blockId: string,
	at: number,
	length: number,
): Point {
	if (point.blockId !== blockId) {
		return point;
	}
	if (point.offset < at) {
		return point;
	}
	if (point.offset === at) {
		return assoc === 1 ? { blockId, offset: point.offset + length } : point;
	}
	return { blockId, offset: point.offset + length };
}

function mapDelete(
	point: Point,
	blockId: string,
	from: number,
	to: number,
): Point {
	if (point.blockId !== blockId) {
		return point;
	}
	if (point.offset <= from) {
		return point;
	}
	if (point.offset >= to) {
		return { blockId, offset: point.offset - (to - from) };
	}
	return { blockId, offset: from };
}

function mapSplit(
	point: Point,
	assoc: Assoc,
	blockId: string,
	offset: number,
	newBlockId: string,
): Point {
	if (point.blockId !== blockId) {
		return point;
	}
	if (point.offset > offset) {
		return { blockId: newBlockId, offset: point.offset - offset };
	}
	if (point.offset === offset && assoc === 1) {
		return { blockId: newBlockId, offset: 0 };
	}
	return point;
}

function mapMerge(
	point: Point,
	sourceId: string,
	targetId: string,
	joinOffset: number,
): Point {
	if (point.blockId !== sourceId) {
		return point;
	}
	return { blockId: targetId, offset: joinOffset + point.offset };
}

function mapRemove(point: Point, removedId: string): Point | null {
	if (point.blockId !== removedId) {
		return point;
	}
	return null;
}

function yText(
	doc: Editor["internals"]["crdtDoc"],
	blockId: string,
): Y.Text | null {
	if (!isYjsCRDTDocument(doc)) {
		return null;
	}
	const content = doc.penDocument.blocks.get(blockId)?.get("content");
	return content instanceof Y.Text ? content : null;
}

describe("an-fuzz AN1–AN5 AN14", () => {
	it(
		"AN1-AN5: repaired anchors match the v2 cross-block oracle after every generated step",
		// 120_000 was timing out on CI in both `Lint, types and tests` and every
		// Node leg, while the same seed finishes in 11.6s here. The gap is
		// contention, not the assertion: `pnpm test` runs every package's suite
		// at once, and under that load the same run measures 42.8s locally — a
		// 3.7x factor before ubuntu-latest adds the ~2.4x it costs the benches.
		// 42.8 x 2.4 lands at ~103s, which is why a 120s budget failed for the
		// machine rather than for the tree, with vitest reporting worker
		// starvation (`Timeout calling "onTaskUpdate"`) alongside it.
		//
		// 300_000 clears the contended estimate by ~3x and still catches a hang:
		// real work here is under a minute. CH9 measures the half-budget rule on
		// an idle machine, where 11.6s against 150s leaves an order of magnitude.
		{ timeout: 300_000 },
		() => {
			const rng = new Rng(SEED);
			const editor = createEditor();
			const adapter = editor.internals.adapter;
			const undo = adapter.createUndoManager(editor.internals.crdtDoc, {
				captureTimeout: 0,
				trackedOriginTypes: ["user"],
			});
			const startId = editor.firstBlock()!.id;
			editor.apply([
				{
					type: "splice-text",
					blockId: startId,
					from: 0,
					to: 0,
					insert: "meadow sage",
				},
			]);
			undo.stopCapturing();
			let remoteDoc = adapter.fork!(editor.internals.crdtDoc);

			const syncRemote = () => {
				adapter.applyUpdate(
					remoteDoc,
					adapter.encodeState(editor.internals.crdtDoc),
				);
			};

			const tracked: Tracked[] = [];
			const mint = (point: Point, assoc: Assoc) => {
				const anchor = editor.anchors.create(point, assoc);
				if (anchor) {
					tracked.push({ anchor, point, assoc });
				}
			};
			mint({ blockId: startId, offset: 3 }, 1);
			mint({ blockId: startId, offset: 6 }, -1);
			mint({ blockId: startId, offset: 6 }, 1);
			mint({ blockId: startId, offset: 9 }, 1);

			const histogram: Record<ActionKind, number> = {
				insert: 0,
				delete: 0,
				split: 0,
				merge: 0,
				remove: 0,
				remote: 0,
				undo: 0,
				redo: 0,
				stream: 0,
			};
			const sources: Record<CommitEventSource, number> = {
				apply: 0,
				remote: 0,
				undo: 0,
				redo: 0,
				stream: 0,
			};
			editor.on("commit", (event) => {
				sources[event.source] += 1;
			});

			const forced: ActionKind[] = [
				"insert",
				"split",
				"merge",
				"remove",
				"remote",
				"undo",
				"redo",
				"stream",
				"delete",
			];

			let nextBlock = 0;
			const newId = () => {
				nextBlock += 1;
				return `fuzz-${nextBlock}`;
			};

			for (let i = 1; i <= OP_COUNT; i++) {
				if (Number.isFinite(FORCE_FAIL_AT) && i === FORCE_FAIL_AT) {
					throw new Error(
						`forced fuzz failure at op ${i} seed=${SEED} raw=${SEED_INFO.raw}`,
					);
				}

				const model = snapshotModel(editor);
				const kind =
					i <= forced.length ? forced[i - 1]! : rng.pick(forced);
				const living = model.order.filter((id) => editor.getBlock(id));
				if (living.length === 0) {
					break;
				}
				const blockId = rng.pick(living);
				const text = model.texts.get(blockId) ?? "";
				for (const item of tracked) {
					const prior = editor.anchors.resolve(item.anchor);
					item.point = prior
						? { blockId: prior.blockId, offset: prior.offset }
						: null;
				}

				if (kind === "insert") {
					const at = rng.int(text.length + 1);
					const insert = rng.pick(["x", "ab", " ", "Δ"]);
					editor.apply([
						{
							type: "splice-text",
							blockId,
							from: at,
							to: at,
							insert: insert,
						},
					]);
					for (const item of tracked) {
						if (item.point) {
							item.point = mapInsert(
								item.point,
								item.assoc,
								blockId,
								at,
								insert.length,
							);
						}
					}
					histogram.insert += 1;
				} else if (kind === "delete" && text.length > 0) {
					const from = rng.int(text.length);
					const to = Math.min(text.length, from + 1 + rng.int(2));
					editor.apply([
						{
							type: "splice-text",
							blockId,
							from: from,
							to: from + to - from,
							insert: "",
						},
					]);
					for (const item of tracked) {
						if (item.point) {
							item.point = mapDelete(
								item.point,
								blockId,
								from,
								to,
							);
						}
					}
					histogram.delete += 1;
				} else if (kind === "split" && text.length > 0) {
					const offset = 1 + rng.int(Math.max(1, text.length - 1));
					const dest = newId();
					applySplitBlock(editor, {
						blockId,
						offset,
						newBlockId: dest,
					});
					const splitMove = (
						editor.lastChangeSummary
							? deriveContentMoves(
									editor.lastChangeSummary,
									undefined,
								)
							: []
					).find((move) => move.fromBlockId === blockId);
					const splitAt = splitMove?.fromRange.from ?? offset;
					for (const item of tracked) {
						if (item.point) {
							item.point = mapSplit(
								item.point,
								item.assoc,
								blockId,
								splitAt,
								splitMove?.toBlockId ?? dest,
							);
						}
					}
					histogram.split += 1;
				} else if (kind === "merge" && living.length >= 2) {
					const index = model.order.indexOf(blockId);
					const sourceId =
						model.order[index + 1] ?? model.order[index - 1];
					if (sourceId && sourceId !== blockId) {
						const targetId =
							index + 1 === model.order.indexOf(sourceId)
								? blockId
								: sourceId;
						const fromId =
							targetId === blockId ? sourceId : blockId;
						applyMergeBlocks(editor, {
							targetBlockId: targetId,
							sourceBlockId: fromId,
						});
						const mergeMove = (
							editor.lastChangeSummary
								? deriveContentMoves(
										editor.lastChangeSummary,
										undefined,
									)
								: []
						).find((move) => move.fromBlockId === fromId);
						const joinOffset = mergeMove?.toOffset ?? 0;
						for (const item of tracked) {
							if (item.point) {
								item.point = mapMerge(
									item.point,
									fromId,
									targetId,
									joinOffset,
								);
							}
						}
						histogram.merge += 1;
					}
				} else if (kind === "remove" && living.length >= 2) {
					editor.apply([{ type: "delete-block", blockId }]);
					for (const item of tracked) {
						if (item.point) {
							item.point = mapRemove(item.point, blockId);
						}
					}
					histogram.remove += 1;
				} else if (kind === "remote") {
					syncRemote();
					const remoteText = yText(remoteDoc, blockId);
					if (remoteText) {
						adapter.transact(
							remoteDoc,
							() => {
								remoteText.insert(0, "R");
							},
							"collaborator",
						);
						adapter.applyUpdate(
							editor.internals.crdtDoc,
							adapter.encodeState(remoteDoc),
						);
						for (const item of tracked) {
							if (item.point) {
								item.point = mapInsert(
									item.point,
									item.assoc,
									blockId,
									0,
									1,
								);
							}
						}
						histogram.remote += 1;
					}
				} else if (kind === "undo" && undo.canUndo()) {
					undo.undo();
					for (const item of tracked) {
						const resolved = editor.anchors.resolve(item.anchor);
						item.point = resolved
							? {
									blockId: resolved.blockId,
									offset: resolved.offset,
								}
							: null;
					}
					histogram.undo += 1;
				} else if (kind === "redo" && undo.canRedo()) {
					undo.redo();
					for (const item of tracked) {
						const resolved = editor.anchors.resolve(item.anchor);
						item.point = resolved
							? {
									blockId: resolved.blockId,
									offset: resolved.offset,
								}
							: null;
					}
					histogram.redo += 1;
				} else if (kind === "stream") {
					const writer = editor.openTextStream(
						{ blockId },
						{ origin: { type: "ai", groupId: `fuzz-${i}` } },
					);
					writer.append("s");
					writer.flush();
					writer.close();
					for (const item of tracked) {
						if (item.point) {
							item.point = mapInsert(
								item.point,
								item.assoc,
								blockId,
								text.length,
								1,
							);
						}
					}
					histogram.stream += 1;
				} else {
					const at = rng.int(text.length + 1);
					editor.apply([
						{
							type: "splice-text",
							blockId,
							from: at,
							to: at,
							insert: "z",
						},
					]);
					for (const item of tracked) {
						if (item.point) {
							item.point = mapInsert(
								item.point,
								item.assoc,
								blockId,
								at,
								1,
							);
						}
					}
					histogram.insert += 1;
				}

				const summary = editor.lastChangeSummary;
				const moves = summary
					? deriveContentMoves(summary, undefined)
					: [];
				for (const item of tracked) {
					item.anchor = repairAnchor(editor, item.anchor, moves);
					const resolved = editor.anchors.resolve(item.anchor);
					if (!item.point) {
						expect(
							resolved,
							`AN1 death seed=${SEED} op=${i}`,
						).toBeNull();
						continue;
					}
					expect(
						resolved,
						`AN1 seed=${SEED} op=${i} kind=${kind}`,
					).toEqual({
						blockId: item.point.blockId,
						offset: clamp(
							item.point.offset,
							logicalText(editor, item.point.blockId).length,
						),
					});
				}

				if (i % 1000 === 0) {
					for (const item of tracked) {
						const again = editor.anchors.deserialize(
							editor.anchors.serialize(item.anchor),
						);
						expect(
							again,
							`AN6 seed=${SEED} op=${i}`,
						).not.toBeNull();
						expect(
							editor.anchors.resolve(again!),
							`AN6 seed=${SEED} op=${i}`,
						).toEqual(editor.anchors.resolve(item.anchor));
					}
				}
			}

			expect(
				histogram.split,
				`split histogram seed=${SEED}`,
			).toBeGreaterThan(0);
			expect(
				histogram.merge,
				`merge histogram seed=${SEED}`,
			).toBeGreaterThan(0);
			expect(
				histogram.remove,
				`remove histogram seed=${SEED}`,
			).toBeGreaterThan(0);
			for (const source of SOURCES) {
				expect(
					sources[source],
					`source ${source} seed=${SEED}`,
				).toBeGreaterThan(0);
			}

			editor.destroy();
		},
	);

	it("AN10: cell-text anchors survive generated in-cell insert and delete", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 0,
				insert: "0123456789",
			},
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 1, col: 1 },
				from: 0,
				to: 0,
				insert: "cell two",
			},
		]);
		const north = editor.anchors.create(
			{ blockId: "t1", offset: 5, cell: { row: 0, col: 0 } },
			1,
		);
		const south = editor.anchors.create(
			{ blockId: "t1", offset: 4, cell: { row: 1, col: 1 } },
			1,
		);
		expect(north, "AN10 cell north mint").not.toBeNull();
		expect(south, "AN10 cell south mint").not.toBeNull();

		const cellSteps = Math.min(50, OP_COUNT);
		for (let i = 1; i <= cellSteps; i++) {
			editor.apply([
				{
					type: "splice-text",
					blockId: "t1",
					cell: { row: 0, col: 0 },
					from: 0,
					to: 0,
					insert: "x",
				},
			]);
			expect(
				editor.anchors.resolve(north!),
				`AN10 cell north prefix-insert op=${i}`,
			).toEqual({
				blockId: "t1",
				offset: 5 + i,
				cell: { row: 0, col: 0 },
			});
			expect(
				editor.anchors.resolve(south!),
				`AN10 cell south stays put op=${i}`,
			).toEqual({
				blockId: "t1",
				offset: 4,
				cell: { row: 1, col: 1 },
			});
		}

		const northAfterInserts = 5 + cellSteps;
		editor.apply([
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 0, col: 0 },
				from: northAfterInserts - 2,
				to: northAfterInserts - 2 + 5,
				insert: "",
			},
		]);
		expect(
			editor.anchors.resolve(north!),
			"AN10 cell north delete-collapse",
		).toEqual({
			blockId: "t1",
			offset: northAfterInserts - 2,
			cell: { row: 0, col: 0 },
		});
		expect(
			editor.anchors.resolve(south!),
			"AN10 cell south after north delete",
		).toEqual({
			blockId: "t1",
			offset: 4,
			cell: { row: 1, col: 1 },
		});
		editor.destroy();
	});
});

import { undoExtension } from "@input/pen-undo";
import type { CommitEvent, Editor, TextStreamWriter } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createEditor as createCoreEditor } from "../index";

const undoOnlyPreset = {
	resolve() {
		return { extensions: [undoExtension()] };
	},
};

const STEP_COUNT = process.env.PEN_FUZZ_NIGHTLY ? 2_000 : 200;
const SEED = Number(process.env.PEN_FUZZ_SEED ?? 20260820);

const ACTIONS = ["apply", "remote", "undo", "redo", "stream"] as const;
type Action = (typeof ACTIONS)[number];

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
		if (max <= 0) return 0;
		return Math.floor(this.next() * max);
	}

	pick<T>(items: readonly T[]): T {
		return items[this.int(items.length)]!;
	}
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
	readonly length: number;
};

type TestRawDocLike = {
	getMap(name: "blocks"): {
		get(key: string): { get(key: "content"): TestYTextLike } | undefined;
	};
};

function ydocOf(doc: unknown): Y.Doc {
	return (doc as { ydoc: Y.Doc }).ydoc;
}

function documentFingerprint(editor: Editor): string {
	return [...editor.blocks()]
		.map(
			(block) =>
				`${block.id}:${block.type}:${block.textContent({ resolved: true })}`,
		)
		.join("\n");
}

function expectedSource(action: Action): CommitEvent["source"] {
	switch (action) {
		case "apply":
			return "apply";
		case "remote":
			return "remote";
		case "undo":
			return "undo";
		case "redo":
			return "redo";
		case "stream":
			return "stream";
		default: {
			const _exhaustive: never = action;
			return _exhaustive;
		}
	}
}

describe("commit event one-event property (Wave 2)", () => {
	it("I1: random apply/remote/undo/redo/stream-flush sequences emit one commit per state change", async () => {
		const editor = createCoreEditor({ preset: undoOnlyPreset });
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;
		const adapter = editor.internals.adapter;
		const editorDoc = editor.internals.crdtDoc;
		const remoteDoc = adapter.loadDocument(adapter.encodeState(editorDoc));

		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		const stream: { writer: TextStreamWriter | null } = { writer: null };
		const rng = new Rng(SEED);
		let lastCommitId = 0;
		const seenSources = new Set<CommitEvent["source"]>();

		const catchUpRemote = () => {
			adapter.applyUpdate(
				remoteDoc,
				adapter.encodeUpdate(
					editorDoc,
					Y.encodeStateVector(ydocOf(remoteDoc)),
				),
			);
		};

		const remoteText = (): TestYTextLike => {
			const text = adapter
				.raw<TestRawDocLike>(remoteDoc)
				.getMap("blocks")
				.get(blockId)
				?.get("content");
			if (!text) {
				throw new Error(`Missing remote text for ${blockId}`);
			}
			return text;
		};

		const run = (action: Action): void => {
			if (action === "undo" && !editor.undoManager.canUndo()) {
				return;
			}
			if (action === "redo" && !editor.undoManager.canRedo()) {
				return;
			}

			const before = documentFingerprint(editor);
			const commitCount = commits.length;

			if (action === "apply") {
				const length = editor.getBlock(blockId)?.length() ?? 0;
				editor.apply(
					[
						{
							type: "insert-text",
							blockId,
							offset: rng.int(length + 1),
							text: rng.pick(["a", "bb", " "]),
						},
					],
					{ origin: "user" },
				);
				editor.undoManager.stopCapturing();
				catchUpRemote();
			} else if (action === "remote") {
				catchUpRemote();
				const text = remoteText();
				adapter.transact(
					remoteDoc,
					() => {
						text.insert(rng.int(text.length + 1), rng.pick(["r", "rr"]));
					},
					"collaborator",
				);
				adapter.applyUpdate(
					editorDoc,
					adapter.encodeUpdate(
						remoteDoc,
						Y.encodeStateVector(ydocOf(editorDoc)),
					),
				);
			} else if (action === "undo") {
				editor.undoManager.undo();
				catchUpRemote();
			} else if (action === "redo") {
				editor.undoManager.redo();
				catchUpRemote();
			} else if (action === "stream") {
				if (!stream.writer) {
					stream.writer = editor.openTextStream(
						{ blockId },
						{
							origin: { type: "ai", groupId: "i1-stream" },
							flushIntervalMs: 100,
						},
					);
				}
				stream.writer.append(rng.pick(["s", "ss"]));
				stream.writer.flush();
				catchUpRemote();
			} else {
				const _exhaustive: never = action;
				return _exhaustive;
			}

			const changed = documentFingerprint(editor) !== before;
			const produced = commits.slice(commitCount);
			if (!changed) {
				expect(produced, `${action} no-op`).toHaveLength(0);
				return;
			}

			expect(produced, `${action} state change`).toHaveLength(1);
			const event = produced[0]!;
			expect(event.commitId).toBeGreaterThan(lastCommitId);
			expect(event.summary).toBeTruthy();
			expect(event.source).toBe(expectedSource(action));
			lastCommitId = event.commitId;
			seenSources.add(event.source);
		};

		run("apply");
		run("remote");
		run("apply");
		run("undo");
		run("redo");
		run("stream");

		expect([...seenSources].sort()).toEqual(
			["apply", "redo", "remote", "stream", "undo"].sort(),
		);

		for (let step = 0; step < STEP_COUNT; step += 1) {
			run(rng.pick(ACTIONS));
		}

		stream.writer?.close();
		for (const event of commits) {
			expect(event.summary).toBeTruthy();
		}
		for (let index = 1; index < commits.length; index += 1) {
			expect(commits[index]!.commitId).toBeGreaterThan(
				commits[index - 1]!.commitId,
			);
		}

		editor.destroy();
	});
});

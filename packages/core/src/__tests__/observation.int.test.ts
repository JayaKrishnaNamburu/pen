import { isYjsCRDTDocument } from "@input/pen-crdt-yjs";
import type {
	CommitEvent,
	CommitEventSource,
	DocumentOp,
	Editor,
	StructuralChange,
	StructuredOpOrigin,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
	commandHandler,
	convertBlock,
	createCommandRegistry,
	defineCommand,
	deleteBackward,
	deleteForward,
	splitBlock,
} from "../commands";
import {
	createCommandEditor,
	createCommandHarness,
	liveRegistry,
} from "../commands/__tests__/fixture";
import { createHeadlessEditor } from "../index";

function insertAt(blockId: string, offset: number, text: string): DocumentOp {
	return {
		type: "splice-text",
		blockId,
		from: offset,
		to: offset,
		insert: text,
	};
}

function hasOwnIntent(origin: StructuredOpOrigin): boolean {
	return Object.hasOwn(origin, "intent");
}

function expectNoIntent(origin: StructuredOpOrigin): void {
	expect(hasOwnIntent(origin)).toBe(false);
	expect(origin.intent).toBeUndefined();
}

/**
 * Two-peer fork used by INT2/INT3. `@input/pen-test`'s harness is not a
 * core dependency; this is the same encodeUpdate + state-vector exchange
 * `twoPeerHarness` and `changeSummaries.test.ts` already use.
 */
function forkPeer(source: Editor): Editor {
	const adapter = source.internals.adapter;
	return createHeadlessEditor({
		schema: source.schema,
		crdt: adapter,
		document: adapter.loadDocument(
			adapter.encodeState(source.internals.crdtDoc),
		),
	});
}

function syncFromTo(from: Editor, to: Editor): void {
	const adapter = from.internals.adapter;
	const fromDoc = from.internals.crdtDoc;
	const toDoc = to.internals.crdtDoc;
	if (!isYjsCRDTDocument(fromDoc) || !isYjsCRDTDocument(toDoc)) {
		throw new Error("expected yjs documents");
	}
	const update = adapter.encodeUpdate(
		fromDoc,
		Y.encodeStateVector(toDoc.ydoc),
	);
	if (update.byteLength === 0) {
		throw new Error("sync produced an empty update — peers never diverged");
	}
	adapter.applyUpdate(toDoc, update);
}

function isTypeConversion(change: StructuralChange): boolean {
	switch (change.type) {
		case "block-props-changed":
			return change.keys.includes("type");
		case "block-inserted":
		case "block-removed":
		case "block-moved":
		case "block-split":
		case "blocks-merged":
		case "table-changed":
		case "apps-changed":
		case "metadata-changed":
			return false;
		default: {
			const _never: never = change;
			throw new Error(`unhandled structural type ${String(_never)}`);
		}
	}
}

function expectNoSynthesizedIntent(event: CommitEvent): void {
	switch (event.source) {
		case "remote":
		case "undo":
		case "redo":
		case "stream":
			expectNoIntent(event.origin);
			break;
		case "apply":
			break;
		default: {
			const _never: never = event.source;
			throw new Error(`unhandled commit source ${String(_never)}`);
		}
	}
}

describe("observation — command intent (INT)", () => {
	it("INT1: dispatch stamps pen.splitBlock on the live commit before the pipeline runs", () => {
		const editor = createCommandEditor([
			{ id: "p", type: "paragraph", text: "Hello" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.selectText("p", 2, 2);

		expect(registry.dispatch(splitBlock, undefined)).toBe(true);

		expect(commits).toHaveLength(1);
		expect(commits[0]!.source).toBe("apply");
		expect(commits[0]!.origin.intent).toBe("pen.splitBlock");
		expect(commits[0]!.origin.type).toBe("user");
		expect(editor.getBlock("p")?.textContent()).toBe("He");
		editor.destroy();
	});

	it("INT1: a block merge stamps the dispatched delete command, never a synthesized merge name", () => {
		const backward = createCommandEditor([
			{ id: "a", type: "paragraph", text: "Hi" },
			{ id: "b", type: "paragraph", text: "there" },
		]);
		const backwardRegistry = liveRegistry(backward);
		const backwardCommits: CommitEvent[] = [];
		backward.on("commit", (event) => {
			backwardCommits.push(event);
		});
		backward.selectText("b", 0, 0);
		expect(
			backwardRegistry.dispatch(deleteBackward, {
				granularity: "grapheme",
			}),
		).toBe(true);
		expect(backward.getBlock("a")?.textContent()).toBe("Hithere");
		expect(backwardCommits).toHaveLength(1);
		expect(backwardCommits[0]!.origin.intent).toBe("pen.deleteBackward");
		expect(backwardCommits[0]!.origin.intent).not.toBe("pen.mergeBlocks");
		expect(backwardCommits[0]!.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "blocks-merged",
				targetBlockId: "a",
				sourceBlockId: "b",
			}),
		);
		backward.destroy();

		const forward = createCommandEditor([
			{ id: "a", type: "paragraph", text: "Hi" },
			{ id: "b", type: "paragraph", text: "there" },
		]);
		const forwardRegistry = liveRegistry(forward);
		const forwardCommits: CommitEvent[] = [];
		forward.on("commit", (event) => {
			forwardCommits.push(event);
		});
		forward.selectText("a", 2, 2);
		expect(
			forwardRegistry.dispatch(deleteForward, {
				granularity: "grapheme",
			}),
		).toBe(true);
		expect(forward.getBlock("a")?.textContent()).toBe("Hithere");
		expect(forwardCommits).toHaveLength(1);
		expect(forwardCommits[0]!.origin.intent).toBe("pen.deleteForward");
		expect(forwardCommits[0]!.origin.intent).not.toBe("pen.mergeBlocks");
		expect(forwardCommits[0]!.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "blocks-merged",
				targetBlockId: "a",
				sourceBlockId: "b",
			}),
		);
		forward.destroy();
	});

	it("INT1: a handler or host cannot overwrite a stamped intent", () => {
		const ping = defineCommand("test.ping");
		const pong = defineCommand("test.pong");
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "x" },
		]);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		const registry = createCommandHarness(editor, [
			commandHandler(ping, () => ({
				ops: [insertAt("a", 1, "!")],
				options: {
					origin: { type: "user", intent: "forged.intent" },
				},
			})),
			commandHandler(pong, () => ({
				ops: [insertAt("a", 2, "?")],
			})),
		]);

		expect(registry.dispatch(ping, undefined)).toBe(true);
		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin.intent).toBe("test.ping");
		expect(registry.diagnostics).toEqual([
			expect.objectContaining({
				code: "command-intent-overwrite",
				source: "commands",
			}),
		]);

		const hostOrigin: StructuredOpOrigin = {
			type: "ai",
			intent: "host.lie",
			requestId: "r1",
		};
		expect(registry.dispatch(pong, undefined, { origin: hostOrigin })).toBe(
			true,
		);
		expect(commits).toHaveLength(2);
		expect(commits[1]!.origin.intent).toBe("test.pong");
		expect(commits[1]!.origin.type).toBe("ai");
		expect(hostOrigin.intent).toBe("host.lie");
		editor.destroy();
	});

	it("INT1: a pre-set intent is preserved only when no command is on the dispatch stack", () => {
		const editor = createCommandEditor([
			{ id: "p", type: "paragraph", text: "Hi" },
		]);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply([insertAt("p", 2, "!")], {
			origin: { type: "user", intent: "host.named" },
		});
		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin.intent).toBe("host.named");

		const ping = defineCommand("test.ping");
		const registry = createCommandRegistry({
			editor,
			providers: [
				commandHandler(ping, () => ({
					ops: [insertAt("p", 3, "?")],
				})),
			],
			apply: (ops, options) => {
				editor.apply(ops, options);
			},
		});
		expect(
			registry.dispatch(ping, undefined, {
				origin: { type: "user", intent: "host.named" },
			}),
		).toBe(true);
		expect(commits).toHaveLength(2);
		expect(commits[1]!.origin.intent).toBe("test.ping");
		expect(commits[1]!.origin.intent).not.toBe("host.named");
		editor.destroy();
	});

	it("INT2: a remote peer receiving a stamped local split carries no intent", () => {
		const local = createCommandEditor([
			{ id: "p", type: "paragraph", text: "Hello" },
		]);
		const remote = forkPeer(local);
		expect(remote.getBlock("p")?.textContent()).toBe("Hello");

		const localCommits: CommitEvent[] = [];
		const remoteCommits: CommitEvent[] = [];
		local.on("commit", (event) => {
			localCommits.push(event);
		});
		remote.on("commit", (event) => {
			remoteCommits.push(event);
		});

		local.selectText("p", 2, 2);
		expect(liveRegistry(local).dispatch(splitBlock, undefined)).toBe(true);
		expect(localCommits).toHaveLength(1);
		expect(localCommits[0]!.origin.intent).toBe("pen.splitBlock");
		expect(local.getBlock("p")?.textContent()).toBe("He");
		expect(remote.getBlock("p")?.textContent()).toBe("Hello");
		expect(remoteCommits).toHaveLength(0);

		syncFromTo(local, remote);

		expect(remote.getBlock("p")?.textContent()).toBe("He");
		expect(remoteCommits.length).toBeGreaterThan(0);
		const remoteEvent = remoteCommits.find(
			(event) => event.source === "remote",
		);
		expect(remoteEvent).toBeDefined();
		const source: CommitEventSource = remoteEvent!.source;
		expect(source).toBe("remote");
		expectNoSynthesizedIntent(remoteEvent!);
		expect(remoteEvent!.origin.type).toBe("collaborator");
		expect(remoteEvent!.origin.intent).not.toBe("pen.splitBlock");

		local.destroy();
		remote.destroy();
	});

	it("INT2: undo and redo of a stamped dispatch synthesize no intent", () => {
		const editor = createCommandEditor([
			{ id: "p", type: "paragraph", text: "Hello" },
		]);
		const undo = editor.internals.adapter.createUndoManager(
			editor.internals.crdtDoc,
			{ captureTimeout: 0 },
		);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.selectText("p", 2, 2);
		expect(liveRegistry(editor).dispatch(splitBlock, undefined)).toBe(true);
		undo.stopCapturing();
		expect(commits.at(-1)?.origin.intent).toBe("pen.splitBlock");
		expect(editor.getBlock("p")?.textContent()).toBe("He");

		expect(undo.undo()).toBe(true);
		expect(editor.getBlock("p")?.textContent()).toBe("Hello");
		const undoEvent = commits.find((event) => event.source === "undo");
		expect(undoEvent).toBeDefined();
		expect(undoEvent!.origin.type).toBe("history");
		expectNoSynthesizedIntent(undoEvent!);

		expect(undo.redo()).toBe(true);
		expect(editor.getBlock("p")?.textContent()).toBe("He");
		const redoEvent = commits.find((event) => event.source === "redo");
		expect(redoEvent).toBeDefined();
		expect(redoEvent!.origin.type).toBe("history");
		expectNoSynthesizedIntent(redoEvent!);

		undo.destroy();
		editor.destroy();
	});

	it("INT2: a stream flush carries no intent unless the caller supplied one verbatim", () => {
		const editor = createCommandEditor([
			{ id: "p", type: "paragraph", text: "" },
		]);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		const bare = editor.openTextStream(
			{ blockId: "p" },
			{ origin: { type: "ai", groupId: "s1" } },
		);
		bare.append("sage");
		bare.flush();
		const streamBare = commits.find((event) => event.source === "stream");
		expect(streamBare).toBeDefined();
		expect(streamBare!.origin).toMatchObject({
			type: "ai",
			groupId: "s1",
			source: "stream",
		});
		expectNoSynthesizedIntent(streamBare!);
		bare.close();

		const named = editor.openTextStream(
			{ blockId: "p" },
			{ origin: { type: "ai", intent: "host.named", groupId: "s2" } },
		);
		named.append("!");
		named.flush();
		const streamNamed = commits
			.filter((event) => event.source === "stream")
			.at(-1);
		expect(streamNamed).toBeDefined();
		expect(streamNamed!.origin.intent).toBe("host.named");
		expect(streamNamed!.origin.source).toBe("stream");
		named.close();
		editor.destroy();
	});

	it("INT3: convert is block-props-changed with type in keys; local commit carries intent, remote does not", () => {
		const local = createCommandEditor([
			{ id: "p", type: "paragraph", text: "Hello" },
		]);
		const remote = forkPeer(local);
		expect(remote.getBlock("p")?.type).toBe("paragraph");

		const localCommits: CommitEvent[] = [];
		const remoteCommits: CommitEvent[] = [];
		local.on("commit", (event) => {
			localCommits.push(event);
		});
		remote.on("commit", (event) => {
			remoteCommits.push(event);
		});

		expect(
			liveRegistry(local).dispatch(convertBlock, {
				blockId: "p",
				newType: "heading",
				newProps: { level: 1 },
			}),
		).toBe(true);
		expect(local.getBlock("p")?.type).toBe("heading");
		expect(remote.getBlock("p")?.type).toBe("paragraph");
		expect(localCommits).toHaveLength(1);

		const localEvent = localCommits[0]!;
		expect(localEvent.source).toBe("apply");
		expect(localEvent.origin.intent).toBe("pen.convertBlock");
		expect(localEvent.summary.structural.some(isTypeConversion)).toBe(true);
		expect(
			localEvent.summary.structural.some(
				(change) =>
					(change as { type: string }).type === "block-converted",
			),
		).toBe(false);
		const localProps = localEvent.summary.structural.find(
			(change) => change.type === "block-props-changed",
		);
		expect(localProps?.type).toBe("block-props-changed");
		if (localProps?.type === "block-props-changed") {
			expect(localProps.keys).toContain("type");
		}

		syncFromTo(local, remote);

		expect(remote.getBlock("p")?.type).toBe("heading");
		expect(remoteCommits.length).toBeGreaterThan(0);
		const remoteEvent = remoteCommits.find(
			(event) => event.source === "remote",
		);
		expect(remoteEvent).toBeDefined();
		expectNoSynthesizedIntent(remoteEvent!);
		expect(remoteEvent!.origin.intent).not.toBe("pen.convertBlock");
		expect(remoteEvent!.summary.structural.some(isTypeConversion)).toBe(
			true,
		);
		expect(
			remoteEvent!.summary.structural.some(
				(change) =>
					(change as { type: string }).type === "block-converted",
			),
		).toBe(false);

		local.destroy();
		remote.destroy();
	});
});

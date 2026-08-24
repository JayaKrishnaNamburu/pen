import type { CommitEvent, DocumentOp, StructuredOpOrigin } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
	commandHandler,
	createCommandRegistry,
	defineCommand,
	deleteBackward,
	insertText,
	splitBlock,
} from "..";
import { resolveStreamOrigin } from "../../editor/textStream";
import { caretOf, createCommandEditor, liveRegistry } from "./fixture";

function insertAt(blockId: string, offset: number, text: string): DocumentOp {
	return {
		type: "splice-text",
		blockId,
		from: offset,
		to: offset,
		insert: text,
	};
}

function structuredOrigin(origin: unknown): StructuredOpOrigin {
	if (origin == null || typeof origin === "string") {
		throw new Error(`expected structured origin, got ${JSON.stringify(origin)}`);
	}
	return origin as StructuredOpOrigin;
}

describe("origin.intent dispatch stamp", () => {
	it("INT1: dispatch stamps the command name on a returned { ops } apply", () => {
		const ping = defineCommand("test.ping");
		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, () => ({
					ops: [insertAt("a", 0, "x")],
				})),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		const origin = structuredOrigin(registry.recordedApplies[0]?.options?.origin);
		expect(origin.intent).toBe("test.ping");
		expect(origin.type).toBe("user");
	});

	it("INT1: dispatch stamps the command name when the handler calls editor.apply", () => {
		const ping = defineCommand("test.ping");
		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, (editor) => {
					editor.apply([insertAt("a", 0, "x")], { origin: "user" });
					return true;
				}),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		const origin = structuredOrigin(registry.recordedApplies[0]?.options?.origin);
		expect(origin.intent).toBe("test.ping");
		expect(origin.type).toBe("user");
	});

	it("INT1: a live pen.splitBlock commit carries origin.intent pen.splitBlock", () => {
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
		expect(editor.getBlock("p")?.textContent()).toBe("He");
		expect(caretOf(editor).offset).toBe(0);

		const origin = commits.at(-1)?.origin;
		expect(origin?.intent).toBe("pen.splitBlock");
		expect(origin?.type).toBe("user");
		editor.destroy();
	});

	it("INT1: delete-at-boundary merge stamps pen.deleteBackward, not a fabricated pen.mergeBlocks", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "Hi" },
			{ id: "b", type: "paragraph", text: "there" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.selectText("b", 0, 0);

		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);
		expect(editor.getBlock("a")?.textContent()).toBe("Hithere");

		const origin = commits.at(-1)?.origin;
		expect(origin?.intent).toBe("pen.deleteBackward");
		expect(origin?.intent).not.toBe("pen.mergeBlocks");
		editor.destroy();
	});

	it("INT1: a handler origin.intent overwrite is ignored with a diagnostic", () => {
		const ping = defineCommand("test.ping");
		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, () => ({
					ops: [insertAt("a", 0, "x")],
					options: {
						origin: { type: "user", intent: "forged.intent" },
					},
				})),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		const origin = structuredOrigin(registry.recordedApplies[0]?.options?.origin);
		expect(origin.intent).toBe("test.ping");
		expect(registry.diagnostics).toEqual([
			expect.objectContaining({
				code: "command-intent-overwrite",
				source: "commands",
			}),
		]);
	});

	it("INT1: a host context origin.intent overwrite is ignored with a diagnostic", () => {
		const ping = defineCommand("test.ping");
		const hostOrigin: StructuredOpOrigin = {
			type: "ai",
			intent: "host.lie",
			requestId: "r1",
		};
		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, () => ({
					ops: [insertAt("a", 0, "x")],
				})),
			],
		});

		expect(
			registry.dispatch(ping, undefined, { origin: hostOrigin }),
		).toBe(true);
		expect(hostOrigin).toEqual({
			type: "ai",
			intent: "host.lie",
			requestId: "r1",
		});
		const origin = structuredOrigin(registry.recordedApplies[0]?.options?.origin);
		expect(origin.intent).toBe("test.ping");
		expect(origin.type).toBe("ai");
		expect(origin.requestId).toBe("r1");
		expect(origin).not.toBe(hostOrigin);
		expect(registry.diagnostics).toEqual([
			expect.objectContaining({
				code: "command-intent-overwrite",
				source: "commands",
			}),
		]);
	});

	it("INT1: pre-set intent survives only on a programmatic apply outside dispatch", () => {
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
		expect(commits[0]?.origin.intent).toBe("host.named");
		editor.destroy();
	});

	it("INT2: remote and history applies do not synthesize intent after a stamped local dispatch", () => {
		const editor = createCommandEditor([
			{ id: "p", type: "paragraph", text: "Hi" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.selectText("p", 2, 2);

		expect(registry.dispatch(insertText, { text: "!" })).toBe(true);
		const local = commits.at(-1)?.origin;
		expect(local?.intent).toBe("pen.insertText");
		expect(Object.hasOwn(local ?? {}, "intent")).toBe(true);

		editor.apply([insertAt("p", 3, "?")], {
			origin: { type: "collaborator" },
		});
		const remote = commits.at(-1)?.origin;
		expect(remote).toEqual({ type: "collaborator" });
		expect(Object.hasOwn(remote ?? {}, "intent")).toBe(false);

		editor.apply([insertAt("p", 4, ".")], {
			origin: { type: "history" },
		});
		const undo = commits.at(-1)?.origin;
		expect(undo).toEqual({ type: "history" });
		expect(Object.hasOwn(undo ?? {}, "intent")).toBe(false);
		editor.destroy();
	});

	it("INT2: a stream origin does not invent intent and preserves a caller-supplied one", () => {
		const bare = resolveStreamOrigin({ type: "ai", groupId: "s1" });
		expect(bare).toEqual({
			type: "ai",
			groupId: "s1",
			source: "stream",
		});
		expect(Object.hasOwn(bare, "intent")).toBe(false);

		const named = resolveStreamOrigin({
			type: "ai",
			intent: "host.named",
		});
		expect(named.intent).toBe("host.named");
		expect(named.source).toBe("stream");
	});
});

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { Editor } from "@input/pen-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { multiplayerExtension } from "../index";
import {
	LOCAL_PRESENCE_MIN_INTERVAL_MS,
	MAX_PRESENCE_UPDATES_PER_SECOND,
} from "../presence/constants";
import { LocalPresenceWriter } from "../presence/localPresenceWriter";

describe("LocalPresenceWriter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("publishes the first request straight away", () => {
		const publish = vi.fn();
		const writer = new LocalPresenceWriter({ publish, minIntervalMs: 50 });

		writer.request();

		expect(publish).toHaveBeenCalledTimes(1);
		writer.cancel();
	});

	it("folds a burst into one trailing write", () => {
		const publish = vi.fn();
		const writer = new LocalPresenceWriter({ publish, minIntervalMs: 50 });

		for (let index = 0; index < 20; index += 1) {
			writer.request();
			vi.advanceTimersByTime(1);
		}

		expect(publish).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(50);
		expect(publish).toHaveBeenCalledTimes(2);

		// Nothing more to write, so the interval closes instead of ticking on.
		vi.advanceTimersByTime(500);
		expect(publish).toHaveBeenCalledTimes(2);
		writer.cancel();
	});

	it("stays inside what a peer accepts while typing continuously", () => {
		const publish = vi.fn();
		const writer = new LocalPresenceWriter({
			publish,
			minIntervalMs: LOCAL_PRESENCE_MIN_INTERVAL_MS,
		});

		// One selection change per 10ms is faster than anyone types.
		for (let index = 0; index < 100; index += 1) {
			writer.request();
			vi.advanceTimersByTime(10);
		}

		expect(publish.mock.calls.length).toBeLessThanOrEqual(
			MAX_PRESENCE_UPDATES_PER_SECOND,
		);
		writer.cancel();
	});

	it("drops a pending write on cancel", () => {
		const publish = vi.fn();
		const writer = new LocalPresenceWriter({ publish, minIntervalMs: 50 });

		writer.request();
		writer.request();
		writer.cancel();
		vi.advanceTimersByTime(500);

		expect(publish).toHaveBeenCalledTimes(1);
	});
});

describe("local presence over an editor", () => {
	let editor: Editor;

	beforeEach(() => {
		vi.useFakeTimers();
		editor = createEditor({
			schema: defaultSchema,
			extensions: [
				multiplayerExtension({ user: { id: "u1", name: "Ada" } }),
			],
		});
	});

	afterEach(async () => {
		await editor.destroy();
		vi.useRealTimers();
	});

	it("coalesces a burst of selection changes and keeps the last one", () => {
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "Ada and Charles",
				},
			],
			{ origin: "user" },
		);

		const localWrites: number[] = [];
		const countWrite = () => {
			localWrites.push(localWrites.length);
		};
		editor.internals.awareness?.on("change", countWrite);

		for (let offset = 0; offset < 15; offset += 1) {
			editor.selectText(blockId, offset, offset);
		}

		// One write for the first move; the rest wait for the interval.
		expect(localWrites.length).toBe(1);

		vi.advanceTimersByTime(LOCAL_PRESENCE_MIN_INTERVAL_MS);
		expect(localWrites.length).toBe(2);

		const local = editor.internals.awareness?.getLocalState() as {
			cursor?: { anchor?: string };
		};
		const cursor = editor.anchors.deserialize(local.cursor!.anchor!);
		expect(editor.anchors.resolve(cursor!)).toMatchObject({
			blockId,
			offset: 14,
		});

		editor.internals.awareness?.off("change", countWrite);
	});
});

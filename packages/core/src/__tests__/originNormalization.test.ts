import type { CommitEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "@input/pen-schema-default";
import { createEditor as createCoreEditor } from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestRawDocLike = {
	transact(fn: () => void, origin?: unknown): void;
	getMap(name: "blocks"): {
		get(blockId: string): { get(key: "content"): TestYTextLike } | undefined;
	};
};

describe("origin normalization (Wave 2.3)", () => {
	it("2.3 / COL1: remote update with a provider-custom origin tag arrives as a collaborator-typed commit with source: remote", () => {
		const editor = createEditor();
		const adapter = editor.internals.adapter;
		const editorDoc = editor.internals.crdtDoc;
		const blockId = editor.firstBlock()!.id;
		const remoteDoc = adapter.loadDocument(adapter.encodeState(editorDoc));
		const remoteYDoc = adapter.raw<TestRawDocLike>(remoteDoc);
		const remoteYText = remoteYDoc
			.getMap("blocks")
			.get(blockId)
			?.get("content");
		if (!remoteYText) {
			throw new Error(`Missing collaborator text for block ${blockId}`);
		}

		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		remoteYDoc.transact(() => {
			remoteYText.insert(0, "from peer");
		}, "y-websocket");
		adapter.applyUpdate(editorDoc, adapter.encodeState(remoteDoc));

		expect(commits).toHaveLength(1);
		expect(commits[0].origin).toEqual({ type: "collaborator" });
		expect(commits[0].source).toBe("remote");

		editor.destroy();
	});
});

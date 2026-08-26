import type { CommitEvent, OpOrigin } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { runMigrations } from "../migrations/runMigrations";
import type { DocumentMigration } from "../migrations/types";
import { createDefaultSchema } from "./fixtures/testSchema";
import { createEditor as createCoreEditor } from "../index";

/**
 * Origin-shape contract at the core end of core → yjs → undo.
 *
 * The live origin that enters `editor.apply` must be the origin on the
 * commit and the Y transaction. Copying it is the bug class: a
 * collaborator origin reminted as `user` becomes locally undoable.
 * Matching is the `.type` discriminant. Extra fields, frozen objects,
 * and a non-string `type` must not change that.
 */

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

type TestYDocLike = {
	on(
		event: "afterTransaction",
		handler: (txn: { origin: unknown; local: boolean }) => void,
	): void;
};

function originTypeOf(origin: unknown): unknown {
	if (typeof origin === "string") {
		return origin;
	}
	if (origin !== null && typeof origin === "object" && "type" in origin) {
		return origin.type;
	}
	return undefined;
}

function collectLocalTxnOrigins(editor: ReturnType<typeof createEditor>) {
	const txnOrigins: unknown[] = [];
	editor.internals.adapter
		.raw<TestYDocLike>(editor.internals.crdtDoc)
		.on("afterTransaction", (txn) => {
			if (txn.local) {
				txnOrigins.push(txn.origin);
			}
		});
	return txnOrigins;
}

function insertText(
	editor: ReturnType<typeof createEditor>,
	text: string,
	origin: OpOrigin,
) {
	const blockId = editor.firstBlock()!.id;
	const commits: CommitEvent[] = [];
	const txnOrigins = collectLocalTxnOrigins(editor);
	editor.on("commit", (event) => {
		commits.push(event);
	});
	editor.apply(
		[
			{
				type: "splice-text",
				blockId,
				from: editor.getBlock(blockId)!.length(),
				to: editor.getBlock(blockId)!.length(),
				insert: text,
			},
		],
		{ origin },
	);
	return { blockId, commits, txnOrigins };
}

describe("@input/pen-core origin shape contract", () => {
	it("keeps a string user origin typed user on the commit and the Y transaction", () => {
		const editor = createEditor();
		const { blockId, commits, txnOrigins } = insertText(
			editor,
			"typed",
			"user",
		);

		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin.type).toBe("user");
		expect(commits[0]!.source).toBe("apply");
		expect(txnOrigins.length).toBeGreaterThan(0);
		expect(
			typeof txnOrigins[0] === "object" &&
				txnOrigins[0] !== null &&
				(txnOrigins[0] as { type?: unknown }).type,
		).toBe("user");
		expect(editor.getBlock(blockId)!.textContent()).toBe("typed");

		editor.destroy();
	});

	it("keeps a fresh structured user origin identical on the commit and the Y transaction", () => {
		const editor = createEditor();
		const origin = { type: "user" as const };
		const { blockId, commits, txnOrigins } = insertText(
			editor,
			"typed",
			origin,
		);

		expect(commits[0]!.origin).toBe(origin);
		expect(txnOrigins[0]).toBe(origin);
		expect(commits[0]!.origin.type).toBe("user");
		expect(editor.getBlock(blockId)!.textContent()).toBe("typed");

		editor.destroy();
	});

	it("keeps groupId and requestId on the same structured user origin", () => {
		const editor = createEditor();
		const origin = {
			type: "user" as const,
			groupId: "turn-1",
			requestId: "req-1",
		};
		const { commits, txnOrigins } = insertText(editor, "typed", origin);

		expect(commits[0]!.origin).toBe(origin);
		expect(txnOrigins[0]).toBe(origin);
		expect(origin).toEqual({
			type: "user",
			groupId: "turn-1",
			requestId: "req-1",
		});

		editor.destroy();
	});

	it("keeps extra unknown fields on the same live origin object", () => {
		const editor = createEditor();
		const origin = {
			type: "user" as const,
			unexpected: "field",
			nested: { type: "collaborator" as const },
		};
		const { commits, txnOrigins } = insertText(
			editor,
			"typed",
			origin as OpOrigin,
		);

		expect(commits[0]!.origin).toBe(origin);
		expect(txnOrigins[0]).toBe(origin);
		expect(commits[0]!.origin.type).toBe("user");
		expect(origin).toEqual({
			type: "user",
			unexpected: "field",
			nested: { type: "collaborator" },
		});

		editor.destroy();
	});

	it("keeps a frozen structured user origin identical on the commit and the Y transaction", () => {
		const editor = createEditor();
		const frozen = Object.freeze({
			type: "user" as const,
			groupId: "frozen-1",
			requestId: "req-frozen",
		});
		const { commits, txnOrigins } = insertText(editor, "typed", frozen);

		expect(commits[0]!.origin).toBe(frozen);
		expect(txnOrigins[0]).toBe(frozen);
		expect(Object.isFrozen(commits[0]!.origin)).toBe(true);
		expect(commits[0]!.origin.type).toBe("user");

		editor.destroy();
	});

	it("does not treat a non-string type as user", () => {
		const editor = createEditor();
		const origin = { type: 1 } as unknown as OpOrigin;
		const { blockId, commits, txnOrigins } = insertText(
			editor,
			"typed",
			origin,
		);

		expect(commits[0]!.origin).toBe(origin);
		expect(commits[0]!.origin.type).not.toBe("user");
		expect(commits[0]!.source).not.toBe("remote");
		expect(txnOrigins.length).toBeGreaterThan(0);
		expect(originTypeOf(txnOrigins[0])).not.toBe("user");
		expect(editor.getBlock(blockId)!.textContent()).toBe("typed");

		editor.destroy();
	});

	it("does not rewrite a collaborator apply origin to user", () => {
		const editor = createEditor();
		const origin = { type: "collaborator" as const, actorId: "peer-1" };
		const { commits, txnOrigins } = insertText(editor, "remote", origin);

		expect(commits[0]!.origin).toBe(origin);
		expect(txnOrigins[0]).toBe(origin);
		expect(commits[0]!.origin.type).toBe("collaborator");
		expect(commits[0]!.origin.type).not.toBe("user");
		expect(commits[0]!.source).toBe("remote");

		editor.destroy();
	});

	it("does not rewrite a migration apply origin to user", () => {
		const editor = createEditor();
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		const migration: DocumentMigration = {
			id: "upgrade",
			run(next) {
				const blockId = next.firstBlock()!.id;
				next.apply([
					{
						type: "splice-text",
						blockId,
						from: next.getBlock(blockId)!.length(),
						to: next.getBlock(blockId)!.length(),
						insert: "upgraded",
					},
				]);
			},
		};

		const report = runMigrations(editor, [migration]);

		expect(report.applied).toEqual(["upgrade"]);
		expect(editor.firstBlock()!.textContent()).toBe("upgraded");
		expect(commits.length).toBeGreaterThan(0);
		for (const event of commits) {
			expect(event.origin.type).not.toBe("user");
		}
		expect(commits.some((event) => event.origin.type === "migration")).toBe(
			true,
		);

		editor.destroy();
	});

	it("keeps a structured origin arriving via adapter.transact", () => {
		const editor = createEditor();
		const origin = {
			type: "user" as const,
			groupId: "transact-1",
			unexpected: "field",
		};
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		const adapter = editor.internals.adapter;
		const ydoc = adapter.raw<Y.Doc>(editor.internals.crdtDoc);
		const blockId = editor.firstBlock()!.id;
		const content = (ydoc.getMap("blocks") as Y.Map<Y.Map<unknown>>)
			.get(blockId)
			?.get("content");
		if (!(content instanceof Y.Text)) {
			throw new Error(`block ${blockId} has no text`);
		}

		adapter.transact(
			editor.internals.crdtDoc,
			() => {
				content.insert(content.length, "typed");
			},
			origin,
		);

		expect(editor.getBlock(blockId)!.textContent()).toBe("typed");
		expect(commits.length).toBeGreaterThan(0);
		const event = commits.at(-1)!;
		expect(event.origin).toBe(origin);
		expect(event.origin.type).toBe("user");

		editor.destroy();
	});

	it("does not rewrite a collaborator origin arriving via adapter.transact to user", () => {
		const editor = createEditor();
		const origin = { type: "collaborator" as const, actorId: "peer-3" };
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		const adapter = editor.internals.adapter;
		const ydoc = adapter.raw<Y.Doc>(editor.internals.crdtDoc);
		const blockId = editor.firstBlock()!.id;
		const content = (ydoc.getMap("blocks") as Y.Map<Y.Map<unknown>>)
			.get(blockId)
			?.get("content");
		if (!(content instanceof Y.Text)) {
			throw new Error(`block ${blockId} has no text`);
		}

		adapter.transact(
			editor.internals.crdtDoc,
			() => {
				content.insert(content.length, "remote");
			},
			origin,
		);

		expect(editor.getBlock(blockId)!.textContent()).toBe("remote");
		const event = commits.at(-1)!;
		expect(event.origin).toBe(origin);
		expect(event.origin.type).toBe("collaborator");
		expect(event.origin.type).not.toBe("user");
		expect(event.source).toBe("remote");

		editor.destroy();
	});

	it("does not rewrite an openTextStream origin type to user", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const origin = {
			type: "collaborator" as const,
			actorId: "peer-stream",
			unexpected: "field",
		};
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		const writer = editor.openTextStream({ blockId }, { origin });
		writer.append("streamed");
		writer.flush();
		writer.close();

		expect(commits.length).toBeGreaterThan(0);
		for (const event of commits) {
			expect(event.origin.type).toBe("collaborator");
			expect(event.origin.type).not.toBe("user");
			expect(event.source).toBe("stream");
		}
		expect(editor.getBlock(blockId)!.textContent()).toBe("streamed");

		editor.destroy();
	});
});

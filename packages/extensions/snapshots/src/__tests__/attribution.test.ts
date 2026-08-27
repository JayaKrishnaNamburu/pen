import { createEditor } from "@input/pen-core";
import { createTwoPeerHarness } from "@input/pen-test";
import { MULTIPLAYER_CONTROLLER_SLOT } from "@input/pen-types";
import type {
	CommitEvent,
	PenPersistence,
	VersionEntry,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { defaultSchema } from "@input/pen-schema";
import {
	buildBlameRanges,
	getCharacterAttribution,
	getSnapshotsController,
	snapshotsExtension,
} from "../index";

describe("history attribution", () => {
	it("returns attribution ranges with opaque client handles when no resolver is set", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				snapshotsExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		editor.internals.adapter.getAttributionRanges = () => [
			{
				offset: 0,
				length: 5,
				clientId: 1,
			},
			{
				offset: 5,
				length: 6,
				clientId: 2,
			},
		];

		const attributions = getCharacterAttribution(editor, "block-1");

		expect(attributions).toHaveLength(2);
		expect(new Set(attributions.map((entry) => entry.clientId)).size).toBe(
			2,
		);
		expect(attributions[0]?.author).toEqual({
			verified: false,
			id: "1",
			name: "User 1",
			clientId: 1,
		});
		expect(attributions[0]?.userName).toBe("User 1");
		expect(attributions[0]?.displayHint).toBeUndefined();
	});

	it("keeps peer-asserted presence on displayHint, never as author", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				snapshotsExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		const controller = getSnapshotsController(editor)!;
		editor.internals.adapter.getAttributionRanges = () => [
			{
				offset: 0,
				length: 5,
				clientId: 1,
			},
			{
				offset: 5,
				length: 1,
				clientId: 2,
			},
		];

		editor.internals.assignSlot(MULTIPLAYER_CONTROLLER_SLOT, {
			getIdentityMap() {
				return {
					get(clientId: number) {
						if (clientId === 2) {
							return {
								id: "u2",
								name: "Babbage",
								color: "#abc123",
							};
						}

						return {
							id: "u1",
							name: "Ada",
							color: "#123456",
						};
					},
				};
			},
		});

		const blameRanges = controller.getBlameRanges("block-1");
		const namedRanges = buildBlameRanges(
			controller.getCharacterAttribution("block-1"),
		);

		expect(blameRanges).toEqual(namedRanges);
		expect(
			blameRanges.every((range) => range.author.verified === false),
		).toBe(true);
		expect(
			blameRanges.some((range) => range.author.name === "Babbage"),
		).toBe(false);
		expect(
			blameRanges.some(
				(range) =>
					range.displayHint?.unverified === true &&
					range.displayHint.name === "Babbage",
			),
		).toBe(true);
	});

	it("treats a retained author ledger as an unverified display hint", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				snapshotsExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		editor.internals.adapter.getAttributionRanges = () => [
			{
				offset: 0,
				length: 4,
				clientId: 77,
			},
		];

		editor.internals.assignSlot(MULTIPLAYER_CONTROLLER_SLOT, {
			getAuthorLedger() {
				return {
					resolve(clientId: number) {
						if (clientId === 77) {
							return {
								id: "u2",
								name: "Babbage",
								color: "#abc123",
							};
						}

						return null;
					},
				};
			},
			getIdentityMap() {
				return {
					get() {
						return null;
					},
				};
			},
		});

		const blameRanges = buildBlameRanges(
			getCharacterAttribution(editor, "block-1"),
		);

		expect(blameRanges).toEqual([
			{
				from: 0,
				to: 4,
				author: {
					verified: false,
					id: "77",
					name: "User 77",
					clientId: 77,
				},
				displayHint: {
					unverified: true,
					name: "Babbage",
					userId: "u2",
					color: "#abc123",
				},
				timestamp: 0,
			},
		]);
	});

	it("uses the host resolver as verified identity", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				snapshotsExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
					resolveAuthor(clientId) {
						if (clientId === 2) {
							return {
								id: "user-b",
								name: "Babbage",
								color: "#abc123",
							};
						}

						return null;
					},
				}),
			],
		});
		editor.internals.adapter.getAttributionRanges = () => [
			{
				offset: 0,
				length: 4,
				clientId: 2,
			},
		];

		const [range] = getSnapshotsController(editor)!.getBlameRanges("block-1");

		expect(range?.author).toEqual({
			verified: true,
			id: "user-b",
			name: "Babbage",
			color: "#abc123",
		});
	});
});

describe("COL3 identity is host-authoritative", () => {
	const peerAName = "Ada";
	const peerBClientId = 99;

	function installForgedPresence(
		editor: ReturnType<typeof createEditor>,
	): void {
		editor.internals.adapter.getAttributionRanges = () => [
			{
				offset: 0,
				length: 5,
				clientId: peerBClientId,
			},
		];
		editor.internals.assignSlot(MULTIPLAYER_CONTROLLER_SLOT, {
			getIdentityMap() {
				return {
					get(clientId: number) {
						if (clientId === peerBClientId) {
							return {
								id: "forged-as-a",
								name: peerAName,
								color: "#ff0000",
							};
						}

						return {
							id: "user-a",
							name: peerAName,
						};
					},
				};
			},
		});
	}

	it("COL3: without a resolver, blame shows B's opaque handle, never A's presence name", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				snapshotsExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		installForgedPresence(editor);

		const [range] = getSnapshotsController(editor)!.getBlameRanges("block-1");

		expect(range?.author.verified).toBe(false);
		expect(range?.author).toEqual({
			verified: false,
			id: String(peerBClientId),
			name: `User ${peerBClientId}`,
			clientId: peerBClientId,
		});
		expect(range?.author.name).not.toBe(peerAName);
		expect(range?.displayHint).toEqual({
			unverified: true,
			name: peerAName,
			userId: "forged-as-a",
			color: "#ff0000",
		});
	});

	it("COL3: with a host resolver, blame shows the resolved identity, never A's presence name", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				snapshotsExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
					resolveAuthor(clientId) {
						if (clientId === peerBClientId) {
							return {
								id: "user-b",
								name: "Babbage",
							};
						}

						return {
							id: "user-a",
							name: peerAName,
						};
					},
				}),
			],
		});
		installForgedPresence(editor);

		const [range] = getSnapshotsController(editor)!.getBlameRanges("block-1");

		expect(range?.author).toEqual({
			verified: true,
			id: "user-b",
			name: "Babbage",
		});
		expect(range?.author.name).not.toBe(peerAName);
		expect(range?.displayHint?.unverified).toBe(true);
		expect(range?.displayHint?.name).toBe(peerAName);
	});

	it("COL1: remote peer B edit is collaborator-origin and attributed to B's opaque handle", () => {
		const harness = createTwoPeerHarness({
			blocks: [{ id: "b1", type: "paragraph", content: "Hello" }],
		});
		const peerBClientId = harness.peerB.editor.clientId;
		const commits: CommitEvent[] = [];
		harness.peerA.editor.on("commit", (event) => {
			commits.push(event);
		});

		harness.peerB.editor.apply(
			[
				{
					type: "splice-text",
					blockId: "b1",
					from: 5,
					to: 5,
					insert: " world",
				},
			],
			{ origin: { type: "user" } },
		);
		harness.exchange("b-then-a");
		harness.assertConverged();
		expect(harness.peerB.editor.getBlock("b1").textContent()).toBe(
			"Hello world",
		);
		expect(harness.peerA.editor.getBlock("b1").textContent()).toBe(
			"Hello world",
		);

		expect(commits.length).toBeGreaterThan(0);
		expect(
			commits.every((event) => event.origin.type === "collaborator"),
		).toBe(true);
		expect(commits.every((event) => event.source === "remote")).toBe(true);
		expect(commits.some((event) => event.origin.type === "user")).toBe(
			false,
		);

		const remoteRanges = getCharacterAttribution(
			harness.peerA.editor,
			"b1",
		).filter((range) => range.clientId === peerBClientId);

		expect(remoteRanges.length).toBeGreaterThan(0);
		expect(
			remoteRanges.every((range) => range.author.verified === false),
		).toBe(true);
		expect(
			remoteRanges.every(
				(range) => range.author.name === `User ${peerBClientId}`,
			),
		).toBe(true);
		expect(remoteRanges.every((range) => range.author.name !== "Ada")).toBe(
			true,
		);
		expect(harness.peerA.editor.getBlock("b1").textContent()).toBe(
			"Hello world",
		);

		harness.destroy();
	});

	it("COL3: snapshots store clientId, never a peer-asserted name", async () => {
		const persistence = new MemoryPersistence();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				snapshotsExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		editor.internals.assignSlot(MULTIPLAYER_CONTROLLER_SLOT, {
			getIdentityMap() {
				return {
					get() {
						return {
							id: "forged",
							name: "Ada",
							color: "#ff0000",
						};
					},
				};
			},
		});

		const created = await getSnapshotsController(editor)!.createSnapshot(
			"Manual checkpoint",
			"manual",
		);

		expect(created.metadata.clientId).toBe(editor.clientId);
		expect(created.metadata).not.toHaveProperty("name");
		expect(created.metadata).not.toHaveProperty("author");
		expect(JSON.stringify(created.metadata)).not.toContain("Ada");
		expect(JSON.stringify(created.metadata)).not.toContain("forged");

		editor.destroy();
	});
});

class MemoryPersistence implements PenPersistence {
	async loadDocument(): Promise<Uint8Array | null> {
		return null;
	}

	async saveSnapshot(): Promise<void> {}

	async appendUpdate(): Promise<void> {}

	async getUpdates(): Promise<Uint8Array[]> {
		return [];
	}

	async compact(): Promise<void> {}

	async saveVersionSnapshot(): Promise<void> {}

	async listVersions(): Promise<VersionEntry[]> {
		return [];
	}

	async loadVersion(
		_docId: string,
		_versionId: string,
	): Promise<{ state: Uint8Array; snapshot: Uint8Array }> {
		throw new Error("Not implemented");
	}
}

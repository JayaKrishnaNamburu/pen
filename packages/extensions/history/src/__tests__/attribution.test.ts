import { createEditor } from "@pen/core";
import { MULTIPLAYER_CONTROLLER_SLOT } from "@pen/types";
import type { PenPersistence, VersionEntry } from "@pen/types";
import { describe, expect, it } from "vitest";
import {
	buildBlameRanges,
	getCharacterAttribution,
	getHistoryController,
	historyExtension,
} from "../index";

describe("history attribution", () => {
	it("returns attribution ranges with fallback authors", () => {
		const editor = createEditor({
			extensions: [
				historyExtension({
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
		expect(new Set(attributions.map((entry) => entry.clientId)).size).toBe(2);
		expect(attributions[0]?.userName).toMatch(/^User /);
	});

	it("builds blame ranges from multiplayer identity data when available", () => {
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		const controller = getHistoryController(editor)!;
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

		editor.internals.setSlot(MULTIPLAYER_CONTROLLER_SLOT, {
			getIdentityMap() {
				return {
					resolve(clientId: number) {
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
		const namedRanges = buildBlameRanges(controller.getCharacterAttribution("block-1"));

		expect(blameRanges).toEqual(namedRanges);
		expect(blameRanges.some((range) => range.author.name === "Babbage")).toBe(true);
	});

	it("prefers retained author ledger data when live peer identity is gone", () => {
		const editor = createEditor({
			extensions: [
				historyExtension({
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

		editor.internals.setSlot(MULTIPLAYER_CONTROLLER_SLOT, {
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
					resolve(clientId: number) {
						return {
							id: String(clientId),
							name: `User ${clientId}`,
						};
					},
				};
			},
		});

		const blameRanges = buildBlameRanges(getCharacterAttribution(editor, "block-1"));

		expect(blameRanges).toEqual([
			{
				from: 0,
				to: 4,
				author: {
					id: "u2",
					name: "Babbage",
					color: "#abc123",
				},
				timestamp: 0,
			},
		]);
	});
});

class MemoryPersistence implements PenPersistence {
	async loadDocument(): Promise<Uint8Array | null> {
		return null;
	}

	async saveSnapshot(): Promise<void> { }

	async appendUpdate(): Promise<void> { }

	async getUpdates(): Promise<Uint8Array[]> {
		return [];
	}

	async compact(): Promise<void> { }

	async saveVersionSnapshot(): Promise<void> { }

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

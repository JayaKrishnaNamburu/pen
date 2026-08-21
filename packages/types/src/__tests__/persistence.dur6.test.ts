import { describe, expect, it } from "vitest";

import type {
	AssetProvider,
	PenPersistence,
	VersionEntry,
	VersionMetadata,
} from "../types/persistence";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const PEN_PERSISTENCE_KEYS = [
	"loadDocument",
	"saveSnapshot",
	"appendUpdate",
	"getUpdates",
	"compact",
	"saveVersionSnapshot",
	"listVersions",
	"loadVersion",
] as const satisfies readonly (keyof PenPersistence)[];

type PenPersistenceKey = (typeof PEN_PERSISTENCE_KEYS)[number];
type _PenPersistenceKeysLocked = Assert<
	Equal<keyof PenPersistence, PenPersistenceKey>
>;

const ASSET_PROVIDER_KEYS = [
	"maxSize",
	"upload",
	"resolve",
	"delete",
] as const satisfies readonly (keyof AssetProvider)[];

type AssetProviderKey = (typeof ASSET_PROVIDER_KEYS)[number];
type _AssetProviderKeysLocked = Assert<
	Equal<keyof AssetProvider, AssetProviderKey>
>;

const SAMPLE_METADATA: VersionMetadata = {
	trigger: "manual",
	clientId: 1,
	timestamp: 0,
};

function createConformingPersistence(): PenPersistence {
	return {
		async loadDocument() {
			return null;
		},
		async saveSnapshot() {},
		async appendUpdate() {},
		async getUpdates() {
			return [];
		},
		async compact() {},
		async saveVersionSnapshot() {},
		async listVersions(): Promise<VersionEntry[]> {
			return [];
		},
		async loadVersion() {
			return {
				state: new Uint8Array(),
				snapshot: new Uint8Array(),
			};
		},
	};
}

function createConformingAssetProvider(): AssetProvider {
	return {
		async upload() {
			return {
				id: "a",
				url: "https://example.test/a",
				mimeType: "image/png",
				size: 0,
			};
		},
		resolve() {
			return "https://example.test/a";
		},
		async delete() {},
	};
}

describe("PenPersistence (DUR6 / API10)", () => {
	it("DUR6: locks the eight PenPersistence members", () => {
		expect(PEN_PERSISTENCE_KEYS).toHaveLength(8);
		expect(new Set(PEN_PERSISTENCE_KEYS).size).toBe(8);
	});

	it("DUR6: a host implementation satisfies PenPersistence", async () => {
		const persistence: PenPersistence = createConformingPersistence();
		expect(await persistence.loadDocument("doc-1")).toBeNull();
		await persistence.saveSnapshot("doc-1", new Uint8Array());
		await persistence.appendUpdate("doc-1", new Uint8Array());
		expect(await persistence.getUpdates("doc-1")).toEqual([]);
		await persistence.compact("doc-1");
		await persistence.saveVersionSnapshot(
			"doc-1",
			new Uint8Array(),
			SAMPLE_METADATA,
		);
		expect(await persistence.listVersions("doc-1")).toEqual([]);
		const loaded = await persistence.loadVersion("doc-1", "v1");
		expect(loaded.snapshot).toBeInstanceOf(Uint8Array);
		expect(loaded.state).toBeInstanceOf(Uint8Array);
	});

	it("DUR6: locks the four AssetProvider members", () => {
		expect(ASSET_PROVIDER_KEYS).toHaveLength(4);
		expect(new Set(ASSET_PROVIDER_KEYS).size).toBe(4);
	});

	it("DUR6: a host implementation satisfies AssetProvider", async () => {
		const provider: AssetProvider = createConformingAssetProvider();
		const ref = await provider.upload({} as Blob);
		expect(provider.resolve(ref)).toBe(ref.url);
		await provider.delete(ref);
	});
});

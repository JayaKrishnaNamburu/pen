import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { PEN_DOCUMENT_ASSERT_COVERAGE } from "../assertDocEquals";
import {
	assertDocumentRoots,
	createDeterministicYDocFixture,
	DEFAULT_PEN_ROOTS,
	encodeFixtureUpdate,
	normalizeDocumentForSnapshot,
	runCRDTStateVectorContract,
	runExportContract,
	runHeadlessEditorContract,
} from "../index";
import { readPenDocumentKeys } from "../penDocumentSourceKeys";

describe("deterministic fixture helpers", () => {
	it("generates stable updates and normalized snapshots", () => {
		const first = createDeterministicYDocFixture();
		const second = createDeterministicYDocFixture();

		expect(first.updateBase64).toBe(second.updateBase64);
		expect(first.stateVectorBase64).toBe(second.stateVectorBase64);
		expect(first.snapshot).toEqual(second.snapshot);
		expect(encodeFixtureUpdate(first.ydoc)).toBe(first.updateBase64);
	});

	it("normalizes map keys for snapshots", () => {
		const ydoc = new Y.Doc();
		const metadata = ydoc.getMap("metadata");
		metadata.set("z", 1);
		metadata.set("a", 2);

		expect(
			Object.keys(
				normalizeDocumentForSnapshot(ydoc, [
					{ name: "metadata", type: "map" },
				]).roots.metadata as Record<string, unknown>,
			),
		).toEqual(["a", "z"]);
	});

	it("throws useful diagnostics for invalid fixture roots", () => {
		const ydoc = new Y.Doc();
		ydoc.getMap("metadata");

		expect(() =>
			assertDocumentRoots(ydoc, [{ name: "metadata", type: "array" }]),
		).toThrow('root "metadata" must be array');
	});

	it("DEFAULT_PEN_ROOTS covers every stored PenDocument key", () => {
		const sourceKeys = readPenDocumentKeys();
		expect(sourceKeys, "could not parse PenDocument from source").not.toBeNull();

		const storedKeys = Object.entries(PEN_DOCUMENT_ASSERT_COVERAGE)
			.filter(([, kind]) => kind !== "excluded")
			.map(([key]) => key)
			.sort();
		const rootNames = DEFAULT_PEN_ROOTS.map((root) => root.name);

		expect(sourceKeys!.filter((key) => key !== "adapter").sort()).toEqual(
			storedKeys,
		);
		for (const key of storedKeys) {
			expect(rootNames).toContain(key);
		}
	});
});

describe("contract helpers", () => {
	it("runs the CRDT state-vector contract", () => {
		expect(runCRDTStateVectorContract()).toMatchObject({
			emptySatisfied: false,
			syncedSatisfied: true,
		});
	});

	it("runs the headless editor contract", () => {
		expect(runHeadlessEditorContract().blockCount).toBeGreaterThan(0);
	});

	it("runs the export contract", () => {
		expect(runExportContract()).toMatchObject({
			text: "Deterministic fixture\nStable body text",
		});
	});

	it("CRDT state-vector contract fails when the empty document already satisfies", () => {
		expect(() =>
			runCRDTStateVectorContract({
				blocks: [],
			}),
		).toThrow(/empty document satisfied a populated fixture/);
	});

	it("headless editor contract fails when the fixture has no blocks", () => {
		expect(() =>
			runHeadlessEditorContract({
				blocks: [],
			}),
		).toThrow(/fixture document has no blocks/);
	});

	it("export contract fails when the fixture has no blocks", () => {
		expect(() =>
			runExportContract({
				blocks: [],
			}),
		).toThrow(/fixture document has no blocks/);
	});
});

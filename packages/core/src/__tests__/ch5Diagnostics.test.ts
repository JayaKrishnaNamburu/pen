import type {
	CRDTDocument,
	Editor,
	PenDocument,
	SchemaRegistry,
} from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSchema } from "./fixtures/testSchema";
import {
	createHeadlessEditor,
	EventEmitter,
	ExtensionManagerImpl,
	SchemaEngineImpl,
} from "../index";

function stubEditor(): Editor {
	return {} as Editor;
}

describe("CH5 diagnostic routing", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("CH5: routes a thrown event handler through the diagnostic channel", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const emitter = new EventEmitter();
		const diagnostics: unknown[] = [];
		emitter.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		emitter.on("change", () => {
			throw new Error("boom");
		});

		emitter.emit("change");

		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_EVENT_001",
				level: "error",
				source: "events",
				event: "change",
				remediation: expect.any(String),
			}),
		);
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("CH5: keeps a guarded console fallback when a diagnostic handler throws", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const emitter = new EventEmitter();
		emitter.on("diagnostic", () => {
			throw new Error("diag boom");
		});

		emitter.emit("diagnostic", {
			code: "PEN_EVENT_001",
			level: "error",
			source: "events",
			message: "test",
		});

		expect(consoleError).toHaveBeenCalledTimes(1);
		expect(consoleError.mock.calls[0]?.[0]).toMatch(
			/handler for "diagnostic" threw/,
		);
	});

	it("CH5: default diagnostics sink prints when no listener is registered", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const emitter = new EventEmitter();
		emitter.on("change", () => {
			throw new Error("boom");
		});

		emitter.emit("change");

		expect(consoleError).toHaveBeenCalled();
		expect(consoleError.mock.calls[0]?.[0]).toBe("Pen diagnostic");
		expect(consoleError.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				code: "PEN_EVENT_001",
				event: "change",
			}),
		);
	});

	it("CH5: routes sync extension activation failure through the diagnostic channel", async () => {
		const emitter = new EventEmitter();
		const diagnostics: unknown[] = [];
		emitter.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		const extensions = new ExtensionManagerImpl(emitter);
		extensions.register(
			defineExtension({
				name: "broken-activate",
				activateClient() {
					throw new Error("boom");
				},
			}),
		);

		await extensions.activateAll(stubEditor());

		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_EXT_004",
				level: "error",
				source: "extension",
				extension: "broken-activate",
				remediation: expect.any(String),
			}),
		);
	});

	it("CH5: routes sync extension deactivation failure through the diagnostic channel", async () => {
		const emitter = new EventEmitter();
		const diagnostics: unknown[] = [];
		emitter.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		const extensions = new ExtensionManagerImpl(emitter);
		extensions.register(
			defineExtension({
				name: "broken-deactivate",
				deactivateClient() {
					throw new Error("boom");
				},
			}),
		);

		await extensions.deactivateAll(stubEditor());

		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_EXT_005",
				level: "error",
				source: "extension",
				extension: "broken-deactivate",
				remediation: expect.any(String),
			}),
		);
	});

	it("CH5 I10: routes normalize-cap through the diagnostic sink without console.warn", () => {
		const consoleWarn = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});
		const diagnostics: unknown[] = [];
		const holder: { engine: SchemaEngineImpl | null } = { engine: null };
		const engine = new SchemaEngineImpl(
			{} as SchemaRegistry,
			{
				adapter: {
					transact: (_doc: unknown, fn: () => void) => {
						fn();
						holder.engine?.markDirty("loop");
					},
				},
				blocks: {
					get: () => undefined,
					entries: () => [],
				},
			} as unknown as PenDocument,
			{} as CRDTDocument,
			(event) => {
				diagnostics.push(event);
			},
		);
		holder.engine = engine;

		engine.markDirty("loop");
		engine.normalizeDirty();

		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "normalize-cap",
				level: "error",
				source: "schema",
				remediation: expect.any(String),
			}),
		);
		expect(consoleWarn).not.toHaveBeenCalled();
	});

	it("CH5 I10: hosts listening for diagnostic still see normalize-cap", () => {
		const consoleWarn = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const engine = editor.internals.engine as SchemaEngineImpl;
		const adapter = editor.internals.adapter;
		const transact = adapter.transact.bind(adapter);
		let keepDirty = false;
		adapter.transact = (doc, fn, origin) => {
			transact(doc, fn, origin);
			if (keepDirty) {
				engine.markDirty("loop");
			}
		};
		keepDirty = true;
		engine.markDirty("loop");
		engine.normalizeDirty();
		keepDirty = false;

		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "normalize-cap",
				level: "error",
				source: "schema",
			}),
		);
		expect(consoleWarn).not.toHaveBeenCalled();

		editor.destroy();
	});
});

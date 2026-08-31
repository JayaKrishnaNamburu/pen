import type { DiagnosticEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createEditor as createCoreEditor, prop } from "../index";
import { resolveSchema } from "../schema/prop";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

describe("override() regenerates validateProps from merged propSchema", () => {
	it("override adding a prop without validateProps keeps the prop through insert-block and set-props and clamps it", () => {
		const base = createDefaultSchema();
		const heading = base.resolve("heading")!;
		const schema = base.override("heading", {
			propSchema: {
				...heading.propSchema,
				textAlignment: resolveSchema(
					prop.enum(["left", "center", "right"]).default("left"),
				),
			},
		});

		const editor = createCoreEditor({
			preset: noDefaultExtensionsPreset,
			schema,
		});
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "h1",
				blockType: "heading",
				props: { level: 2, textAlignment: "center" },
				position: "last",
			},
		]);

		expect(editor.getBlock("h1")?.props.textAlignment).toBe("center");
		expect(editor.getBlock("h1")?.props.level).toBe(2);

		editor.apply([
			{
				type: "set-props",
				blockId: "h1",
				props: { textAlignment: "justify" },
			},
		]);

		expect(editor.getBlock("h1")?.props.textAlignment).toBe("left");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "prop-invalid",
				prop: "textAlignment",
				value: "justify",
				fallback: "left",
			}),
		);

		editor.destroy();
	});

	it("override with an explicit validateProps uses that validator at apply", () => {
		const base = createDefaultSchema();
		const heading = base.resolve("heading")!;
		const calls: Record<string, unknown>[] = [];
		const schema = base.override("heading", {
			propSchema: {
				...heading.propSchema,
				textAlignment: resolveSchema(prop.string().default("left")),
			},
			validateProps: (raw) => {
				calls.push({ ...raw });
				return {
					...(heading.validateProps
						? heading.validateProps(raw)
						: {}),
					textAlignment: raw.textAlignment,
				};
			},
		});

		const editor = createCoreEditor({
			preset: noDefaultExtensionsPreset,
			schema,
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "h1",
				blockType: "heading",
				props: { textAlignment: "center" },
				position: "last",
			},
		]);

		expect(calls).toEqual([{ textAlignment: "center" }]);
		expect(editor.getBlock("h1")?.props.textAlignment).toBe("center");
		editor.destroy();
	});

	it("override that does not touch propSchema keeps the existing validateProps identity", () => {
		const base = createDefaultSchema();
		const heading = base.resolve("heading")!;
		const schema = base.override("heading", {
			display: { title: "Custom Heading" },
		});

		expect(schema.resolve("heading")!.validateProps).toBe(
			heading.validateProps,
		);
		expect(schema.resolve("heading")!.display?.title).toBe(
			"Custom Heading",
		);
	});
});

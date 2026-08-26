import type { BlockSchema, DiagnosticEvent } from "@input/pen-types";
import { defineBlock, prop } from "@input/pen-core";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import { createEditor as createCoreEditor } from "../index";
import { validateOpProps } from "../editor/validateOpProps";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const widget = defineBlock("widget", {
	props: {
		height: prop.number().min(10).max(500),
		level: prop.enum([1, 2, 3]),
		title: prop.string(),
		columns: prop.array(prop.number()).optional(),
	},
	content: "none",
});

function createEditor() {
	return createCoreEditor({
		preset: noDefaultExtensionsPreset,
		schema: createDefaultSchema().extend([
			widget as unknown as BlockSchema,
		]),
	});
}

describe("DUR5 validateProps at apply", () => {
	it("DUR5: coerces a string number on the op without touching undeclared keys", () => {
		const calls: Record<string, unknown>[] = [];
		const result = validateOpProps(
			{
				propSchema: widget.propSchema,
				validateProps: (raw) => {
					calls.push({ ...raw });
					return widget.validateProps!(raw);
				},
			},
			{
				level: "2",
				hostFlag: true,
			},
		);

		expect(calls).toEqual([{ level: "2" }]);
		expect(result.props).toEqual({ level: 2, hostFlag: true });
		expect(result.diagnostics).toEqual([]);
	});

	it("DUR5: clamps an out-of-range number on the op", () => {
		expect(validateOpProps(widget, { height: 5 }).props).toEqual({
			height: 10,
		});
		expect(validateOpProps(widget, { height: 999 }).props).toEqual({
			height: 500,
		});
		expect(validateOpProps(widget, { height: 100 }).props).toEqual({
			height: 100,
		});
		expect(validateOpProps(widget, { height: 5 }).diagnostics).toEqual([]);
	});

	it("DUR5: falls back to the default and emits prop-invalid when the value cannot be salvaged", () => {
		const result = validateOpProps(widget, { level: 99 });

		expect(result.props).toEqual({ level: 1 });
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: "prop-invalid",
				level: "warn",
				source: "schema",
				prop: "level",
				value: 99,
				fallback: 1,
			}),
		]);
	});

	it("DUR5: a valid array prop is left alone and emits no diagnostic", () => {
		for (const columns of [[], [100, 200]]) {
			const result = validateOpProps(widget, { columns });

			expect(result.props).toEqual({ columns });
			expect(result.diagnostics).toEqual([]);
		}
	});

	it("DUR5: an invalid array prop still emits prop-invalid", () => {
		const result = validateOpProps(widget, { columns: "not-an-array" });

		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: "prop-invalid", prop: "columns" }),
		]);
	});

	it("DUR5: passes through props the schema does not declare", () => {
		const result = validateOpProps(widget, {
			level: 2,
			theme: "dark",
		});

		expect(result.props).toEqual({ level: 2, theme: "dark" });
		expect(result.diagnostics).toEqual([]);
	});

	it("DUR5: a single-prop update validates one prop", () => {
		const calls: Record<string, unknown>[] = [];
		const result = validateOpProps(
			{
				propSchema: widget.propSchema,
				validateProps: (raw) => {
					calls.push({ ...raw });
					return widget.validateProps!(raw);
				},
			},
			{ height: 5 },
		);

		expect(calls).toHaveLength(1);
		expect(Object.keys(calls[0]!)).toEqual(["height"]);
		expect(result.props).toEqual({ height: 10 });
		expect(result.props).not.toHaveProperty("level");
		expect(result.props).not.toHaveProperty("title");
	});

	it("DUR5: insert-block coerces, clamps, and falls back at the apply boundary", () => {
		const editor = createEditor();
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "w1",
				blockType: "widget",
				props: {
					level: "2",
					height: 5,
					title: 99,
					theme: "dark",
				},
				position: "last",
			},
		]);

		const block = editor.getBlock("w1");
		expect(block?.props.level).toBe(2);
		expect(block?.props.height).toBe(10);
		expect(block?.props.title).toBe("");
		expect(block?.props.theme).toBe("dark");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "prop-invalid",
				prop: "title",
				value: 99,
				fallback: "",
			}),
		);

		editor.destroy();
	});

	it("DUR5: update-block validates the one prop on the op and leaves others stored", () => {
		const calls: Record<string, unknown>[] = [];
		const original = widget.validateProps!;
		widget.validateProps = (raw) => {
			calls.push({ ...raw });
			return original(raw);
		};

		const editor = createEditor();
		try {
			editor.apply([
				{
					type: "insert-block",
					blockId: "w1",
					blockType: "widget",
					props: { height: 100, level: 2, title: "kept" },
					position: "last",
				},
			]);
			calls.length = 0;

			const diagnostics: DiagnosticEvent[] = [];
			editor.on("diagnostic", (event) => {
				diagnostics.push(event);
			});

			editor.apply([
				{
					type: "set-props",
					blockId: "w1",
					props: { height: 999, theme: "dark" },
				},
			]);

			expect(calls).toHaveLength(1);
			expect(Object.keys(calls[0]!)).toEqual(["height"]);
			expect(editor.getBlock("w1")?.props.height).toBe(500);
			expect(editor.getBlock("w1")?.props.level).toBe(2);
			expect(editor.getBlock("w1")?.props.title).toBe("kept");
			expect(editor.getBlock("w1")?.props.theme).toBe("dark");
			expect(
				diagnostics.filter((event) => event.code === "prop-invalid"),
			).toEqual([]);
		} finally {
			widget.validateProps = original;
			editor.destroy();
		}
	});

	it("DUR5: update-block emits prop-invalid and does not expand the op to other schema defaults", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "w1",
				blockType: "widget",
				props: { height: 80, level: 3 },
				position: "last",
			},
		]);

		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "set-props",
				blockId: "w1",
				props: { level: 99 },
			},
		]);

		expect(editor.getBlock("w1")?.props.level).toBe(1);
		expect(editor.getBlock("w1")?.props.height).toBe(80);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "prop-invalid",
				prop: "level",
				value: 99,
				fallback: 1,
			}),
		);

		editor.destroy();
	});
});

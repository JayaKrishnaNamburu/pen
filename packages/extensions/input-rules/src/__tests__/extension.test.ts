import { describe, expect, it, vi } from "vitest";
import { inputRulesExtension } from "../extension";

type BeforeApplyHook = (
	ops: any[],
	options: { origin?: string },
) => any[];

function createMockEditor(textContent: string) {
	let beforeApplyHook: BeforeApplyHook | null = null;
	const apply = vi.fn();

	const editor = {
		apply,
		getBlock: () => ({
			type: "paragraph",
			textContent: () => textContent,
		}),
		onBeforeApply: vi.fn((hook: BeforeApplyHook) => {
			beforeApplyHook = hook;
			return () => {
				beforeApplyHook = null;
			};
		}),
		internals: {
			setSlot: vi.fn(),
		},
		selection: {
			type: "text" as const,
			anchor: { blockId: "b1", offset: textContent.length },
			focus: { blockId: "b1", offset: textContent.length },
			isCollapsed: true,
		},
		schema: {
			resolve: () => ({
				content: "inline",
				fieldEditor: "richtext",
			}),
			resolveInline: () => ({ kind: "mark" }),
		},
	} as any;

	return {
		editor,
		apply,
		getHook: () => beforeApplyHook,
	};
}

describe("inputRulesExtension", () => {
	it("appends block rule transforms into the same apply pass", async () => {
		const { editor, apply, getHook } = createMockEditor("#");
		const extension = inputRulesExtension();

		await extension.activateClient?.({
			editor,
			dom: {} as Document,
			emit: () => undefined,
			getState: () => undefined,
		});

		const hook = getHook();
		expect(hook).toBeTypeOf("function");

		const ops = hook!(
			[{ type: "insert-text", blockId: "b1", offset: 1, text: " " }],
			{ origin: "user" },
		);

		expect(ops).toEqual([
			{ type: "insert-text", blockId: "b1", offset: 1, text: " " },
			{ type: "delete-text", blockId: "b1", offset: 0, length: 2 },
			{
				type: "convert-block",
				blockId: "b1",
				newType: "heading",
				newProps: { level: 1 },
			},
		]);
		expect(apply).not.toHaveBeenCalled();
	});

	it("skips transforms for bypass origins", async () => {
		const { editor, getHook } = createMockEditor("#");
		const extension = inputRulesExtension();

		await extension.activateClient?.({
			editor,
			dom: {} as Document,
			emit: () => undefined,
			getState: () => undefined,
		});

		const originalOps = [
			{ type: "insert-text", blockId: "b1", offset: 1, text: " " },
		];
		const ops = getHook()!(originalOps, { origin: "input-rule" });

		expect(ops).toBe(originalOps);
	});
});

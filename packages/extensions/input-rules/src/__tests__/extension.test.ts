import { describe, expect, it, vi } from "vitest";
import { inputRulesExtension } from "../extension";
import type { DocumentOp, Editor } from "@pen/types";

type BeforeApplyHook = (
	ops: DocumentOp[],
	options: { origin?: string },
) => DocumentOp[];

type InputRulesExtensionTestEditor = {
	apply: ReturnType<typeof vi.fn>;
	getBlock(): {
		type: string;
		textContent(): string;
	};
	onBeforeApply: ReturnType<typeof vi.fn>;
	internals: {
		setSlot: ReturnType<typeof vi.fn>;
	};
	selection: {
		type: "text";
		anchor: { blockId: string; offset: number };
		focus: { blockId: string; offset: number };
		isCollapsed: boolean;
	};
	schema: {
		resolve(): {
			content: "inline";
			fieldEditor: "richtext";
		};
		resolveInline(): { kind: "mark" };
	};
};

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
	} satisfies InputRulesExtensionTestEditor;

	return {
		editor: editor as unknown as Editor,
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

		const originalOps: DocumentOp[] = [
			{ type: "insert-text", blockId: "b1", offset: 1, text: " " },
		];
		const ops = getHook()!(originalOps, { origin: "input-rule" });

		expect(ops).toBe(originalOps);
	});
});

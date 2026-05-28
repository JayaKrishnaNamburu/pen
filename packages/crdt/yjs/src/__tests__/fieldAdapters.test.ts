import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
	createYArrayFieldAdapter,
	createYTextFieldAdapter,
} from "../fieldAdapters";

type TestItem = {
	id: string;
	label: string;
	value?: string;
};

describe("fieldAdapters", () => {
	it("reads, writes, normalizes, and observes Y.Text fields", () => {
		const doc = new Y.Doc();
		const root = doc.getMap("fields");
		const origins: unknown[] = [];
		doc.on("afterTransaction", (transaction) => {
			origins.push(transaction.origin);
		});
		const onChange = vi.fn();
		const field = createYTextFieldAdapter({
			doc,
			root,
			key: "title",
			normalize: (value) => value.trim(),
		});

		const unsubscribe = field.observe(onChange);
		field.replace("  Hello  ");

		expect(origins).toContain("pen:y-text-field:title:ensure");
		expect(field.read()).toBe("Hello");
		expect(onChange).toHaveBeenCalledTimes(1);
		unsubscribe();
		field.replace("Bye");
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it("replaces, inserts, updates, and removes array items by stable id", () => {
		const doc = new Y.Doc();
		const root = doc.getMap("fields");
		const field = createYArrayFieldAdapter<TestItem>({
			doc,
			root,
			key: "items",
			getId: (item) => item.id,
			normalizeItem: (item) => ({
				...item,
				label: item.label.trim(),
			}),
		});

		field.replace([{ id: "a", label: " A " }]);
		field.insert({ id: "b", label: "B" });
		expect(field.update("a", { value: "updated" })).toBe(true);
		expect(field.remove("b")).toBe(true);

		expect(field.read()).toEqual([
			{ id: "a", label: "A", value: "updated" },
		]);
	});

	it("updates an array item without replacing sibling Y.Map instances", () => {
		const doc = new Y.Doc();
		const root = doc.getMap("fields");
		const field = createYArrayFieldAdapter<TestItem>({
			doc,
			root,
			key: "items",
			getId: (item) => item.id,
		});

		field.replace([
			{ id: "a", label: "A" },
			{ id: "b", label: "B" },
		]);
		const array = root.get("items") as Y.Array<Y.Map<unknown>>;
		const siblingBefore = array.get(1);

		field.update("a", { label: "A+" });

		expect(array.get(1)).toBe(siblingBefore);
		expect(field.read()).toEqual([
			{ id: "a", label: "A+" },
			{ id: "b", label: "B" },
		]);
	});

	it("observes array item updates", () => {
		const doc = new Y.Doc();
		const root = doc.getMap("fields");
		const onChange = vi.fn();
		const field = createYArrayFieldAdapter<TestItem>({
			doc,
			root,
			key: "items",
			getId: (item) => item.id,
		});

		field.replace([{ id: "a", label: "A" }]);
		const unsubscribe = field.observe(onChange);
		field.update("a", { label: "A+" });

		expect(onChange).toHaveBeenCalledTimes(1);
		unsubscribe();
		field.update("a", { label: "A++" });
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it("fails safely when existing fields have the wrong Yjs type", () => {
		const doc = new Y.Doc();
		const root = doc.getMap("fields");
		root.set("title", new Y.Array());
		root.set("items", new Y.Text());

		expect(() =>
			createYTextFieldAdapter({
				doc,
				root,
				key: "title",
			}),
		).toThrow('Yjs field "title" exists but is not text');

		expect(() =>
			createYArrayFieldAdapter<TestItem>({
				doc,
				root,
				key: "items",
				getId: (item) => item.id,
			}),
		).toThrow('Yjs field "items" exists but is not array');
	});
});

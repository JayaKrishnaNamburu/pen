import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { toYMap } from "../index";

describe("toYMap", () => {
	it("writes scalars, nested maps, and array members", () => {
		const ydoc = new Y.Doc();
		const holder = ydoc.getMap("holder");
		const map = toYMap({
			count: 1,
			nested: { label: "keep" },
			list: [3, 4],
		});
		holder.set("value", map);

		expect(map.get("count")).toBe(1);

		const nested = map.get("nested");
		expect(nested).toBeInstanceOf(Y.Map);
		expect((nested as Y.Map<unknown>).get("label")).toBe("keep");

		const list = map.get("list");
		expect(list).toBeInstanceOf(Y.Array);
		expect((list as Y.Array<unknown>).toArray()).toEqual([3, 4]);

		ydoc.destroy();
	});
});

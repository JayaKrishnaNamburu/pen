import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { StructuredOpOrigin } from "../types/ops";

type _Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _IntentIsOptionalCommandName = _Assert<
	Equal<StructuredOpOrigin["intent"], string | undefined>
>;
type _IntentIsOnOrigin = _Assert<
	"intent" extends keyof StructuredOpOrigin ? true : false
>;

function readDeclaredIntent(origin: StructuredOpOrigin): string | undefined {
	return origin.intent;
}

describe("StructuredOpOrigin.intent (OP2 / INT1)", () => {
	it("OP2: ops.ts declares intent?: string on StructuredOpOrigin", () => {
		const path = fileURLToPath(new URL("../types/ops.ts", import.meta.url));
		const source = readFileSync(path, "utf8");
		const start = source.indexOf("export interface StructuredOpOrigin {");
		expect(start).toBeGreaterThan(-1);
		const fromIface = source.slice(start);
		const end = fromIface.indexOf("\n}\n");
		expect(end).toBeGreaterThan(0);
		const iface = fromIface.slice(0, end);
		expect(iface).toMatch(/\n\tintent\?: string;/);
		expect(iface.includes("intent?: string")).toBe(true);
		expect(iface.includes("intent: string")).toBe(false);
	});

	it("OP2: a constructed origin carries the command-name string", () => {
		const origin: StructuredOpOrigin = {
			type: "user",
			intent: "pen.splitBlock",
		};
		expect(readDeclaredIntent(origin)).toBe("pen.splitBlock");
		expect(Object.hasOwn(origin, "intent")).toBe(true);
	});
});

import { afterEach, describe, expect, it } from "vitest";
import { generateId } from "../utils/generateId";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const realCrypto = globalThis.crypto;

function withCrypto(replacement: Crypto | undefined): void {
	Object.defineProperty(globalThis, "crypto", {
		value: replacement,
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	withCrypto(realCrypto);
});

function expectUniqueUuids(count: number): void {
	const ids = new Set<string>();
	for (let index = 0; index < count; index++) {
		const id = generateId();
		expect(id).toMatch(UUID_V4);
		ids.add(id);
	}
	expect(ids.size).toBe(count);
}

describe("generateId (HOST4)", () => {
	it("returns a v4 UUID when the platform provides randomUUID", () => {
		expect(generateId()).toMatch(UUID_V4);
	});

	it("HOST4: falls back to getRandomValues when randomUUID is absent, as in a non-secure context", () => {
		// exactly what a browser exposes over plain http://: getRandomValues, nothing else
		withCrypto({
			getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
		} as unknown as Crypto);

		expectUniqueUuids(10_000);
	});

	it("HOST4: still returns a UUID when Web Crypto is absent entirely", () => {
		withCrypto(undefined);

		// weaker entropy on this path is acceptable; repeats within a single run are not
		expectUniqueUuids(10_000);
	});
});

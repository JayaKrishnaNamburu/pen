const HEX_DIGITS = "0123456789abcdef";
const UUID_DASH_POSITIONS = new Set([3, 5, 7, 9]);

function formatUuidV4(bytes: Uint8Array): string {
	bytes[6] = (bytes[6]! & 0x0f) | 0x40;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;

	let id = "";
	for (let index = 0; index < 16; index++) {
		const byte = bytes[index]!;
		id += HEX_DIGITS[byte >> 4]! + HEX_DIGITS[byte & 0x0f]!;
		if (UUID_DASH_POSITIONS.has(index)) {
			id += "-";
		}
	}
	return id;
}

/**
 * The only ID source in Pen (HOST4, `spec/rules/host.md`). Returns a v4 UUID.
 *
 * `crypto.randomUUID` is secure-context-only, so it is absent on plain-HTTP origins — which
 * is how a phone on the LAN reaches a dev server — and on Safari below 15.4. Calling it
 * directly therefore throws in environments Pen supports, which is why no other module may
 * (enforced by the `pen/no-bare-random-uuid` lint rule).
 *
 * `crypto.getRandomValues` has no such restriction and gives the same entropy, so the
 * insecure-context path is a real UUID, not a degraded one. The final branch runs only where
 * Web Crypto is absent entirely: same shape, weaker randomness, no throw. Pen IDs identify
 * blocks and requests; they are not secrets and are not used for authorization.
 */
export function generateId(): string {
	const webCrypto = typeof crypto === "undefined" ? undefined : crypto;

	if (typeof webCrypto?.randomUUID === "function") {
		return webCrypto.randomUUID();
	}

	if (typeof webCrypto?.getRandomValues === "function") {
		return formatUuidV4(webCrypto.getRandomValues(new Uint8Array(16)));
	}

	const bytes = new Uint8Array(16);
	for (let index = 0; index < bytes.length; index++) {
		bytes[index] = Math.floor(Math.random() * 256);
	}
	return formatUuidV4(bytes);
}

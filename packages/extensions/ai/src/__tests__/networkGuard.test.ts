import http from "node:http";
import http2 from "node:http2";
import net from "node:net";
import { describe, expect, it } from "vitest";

const PROBE = "https://example.invalid/ai-suite-probe";

describe("AI suite network guard", () => {
	it("rejects fetch and names the URL", async () => {
		await expect(fetch(PROBE)).rejects.toThrow(
			`AI suite forbids network access: ${PROBE}`,
		);
	});

	it("rejects node http.request and names the URL", () => {
		expect(() => http.request("http://example.invalid/ai-suite-probe")).toThrow(
			"AI suite forbids network access: http://example.invalid/ai-suite-probe",
		);
	});

	it("rejects net.connect so a raw socket is not a second door", () => {
		expect(() =>
			net.connect({ host: "example.invalid", port: 443 }),
		).toThrow(/AI suite forbids network access/);
	});

	it("rejects http2.connect so the HTTP/2 client is not a second door", () => {
		expect(() => http2.connect(PROBE)).toThrow(
			/AI suite forbids network access/,
		);
	});
});

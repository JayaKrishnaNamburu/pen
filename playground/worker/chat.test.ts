import { describe, expect, it } from "vitest";
import { handleChatFetch } from "./chat";

describe("handleChatFetch", () => {
	it("rejects a non-JSON body", async () => {
		const response = await handleChatFetch(
			new Request("https://playground.test/api/chat", {
				method: "POST",
				body: "nope",
			}),
			undefined,
		);
		expect(response.status).toBe(400);
	});

	it("streams the scripted model when no key is set", async () => {
		const response = await handleChatFetch(
			new Request("https://playground.test/api/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					messages: [{ role: "user", content: "hello" }],
					tools: [],
				}),
			}),
			undefined,
		);
		expect(response.ok).toBe(true);
		expect(response.headers.get("content-type")).toBe(
			"application/x-ndjson",
		);
		const body = await response.text();
		const events = body
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { type: string });
		expect(events.some((event) => event.type === "text-delta")).toBe(true);
		expect(events.at(-1)?.type).toBe("done");
	});
});

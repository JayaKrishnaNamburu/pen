import { describe, expect, it } from "vitest";
import { admitProviderImageUrl } from "../imageSrcPolicy";

describe("SEC1: provider URL admission decides on the parsed protocol", () => {
	it("drops schemes a raw-string pattern misses", () => {
		expect(admitProviderImageUrl("file:///etc/passwd")).toBeNull();
		expect(
			admitProviderImageUrl("filesystem:https://x/temporary/a"),
		).toBeNull();
		expect(admitProviderImageUrl("view-source:https://x")).toBeNull();
		expect(admitProviderImageUrl("javascript:alert(1)")).toBeNull();
		expect(
			admitProviderImageUrl("data:text/html,<script>x</script>"),
		).toBeNull();
	});

	it("keeps the local provider schemes", () => {
		expect(admitProviderImageUrl("blob:https://x/abc")).toBe(
			"blob:https://x/abc",
		);
		expect(admitProviderImageUrl("memory:asset-1")).toBe("memory:asset-1");
	});

	it("still admits ordinary image sources", () => {
		expect(admitProviderImageUrl("https://x/a.png")).toBe(
			"https://x/a.png",
		);
		expect(admitProviderImageUrl("/rel/a.png")).toBe("/rel/a.png");
	});
});

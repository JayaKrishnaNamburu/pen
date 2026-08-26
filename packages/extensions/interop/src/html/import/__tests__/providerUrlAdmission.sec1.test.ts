import { describe, expect, it } from "vitest";
import {
	admitProviderImageUrl,
	isIngestibleImageSrc,
} from "../imageSrcPolicy";

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

describe("SEC1: ingestible image src decides on the parsed protocol", () => {
	it("fetches only http(s) and admitted data:image, not a raw-string prefix", () => {
		expect(isIngestibleImageSrc("https://x/a.png")).toBe(true);
		expect(isIngestibleImageSrc("http://x/a.png")).toBe(true);
		expect(isIngestibleImageSrc("data:image/png;base64,aaa")).toBe(true);
		expect(isIngestibleImageSrc("/rel/a.png")).toBe(false);
		expect(isIngestibleImageSrc("file:///etc/passwd")).toBe(false);
		expect(isIngestibleImageSrc("javascript:alert(1)")).toBe(false);
		expect(isIngestibleImageSrc("data:text/html,<script>x</script>")).toBe(
			false,
		);
	});
});

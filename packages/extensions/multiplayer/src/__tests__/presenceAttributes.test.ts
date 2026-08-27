import { describe, expect, it } from "vitest";
import {
	createRemotePresenceAttributes,
	setPresenceAttribute,
} from "../presence/presenceAttributes";

describe("createRemotePresenceAttributes", () => {
	it("SEC2: carries no style attribute, so a peer colour has nothing to ride", () => {
		const attributes = createRemotePresenceAttributes({
			className: "pen-multiplayer-cursor",
			markerName: "data-pen-multiplayer-cursor",
			clientId: 77,
			user: {
				id: "u-css",
				name: "Ada",
				color: "red;position:absolute",
			},
		});

		expect(Object.keys(attributes)).not.toContain("style");
		expect(JSON.stringify(attributes)).not.toContain("position");
		expect(attributes["data-user-id"]).toBe("u-css");
		expect(attributes["data-user-name"]).toBe("Ada");
	});

	it("COL2: refuses event-handler attribute names", () => {
		const attributes: Record<string, string> = {};
		setPresenceAttribute(attributes, "onclick", "alert(1)");
		setPresenceAttribute(attributes, "ONMOUSEOVER", "alert(1)");
		setPresenceAttribute(attributes, "data-user-id", "u1");

		expect(attributes).toEqual({ "data-user-id": "u1" });
	});
});

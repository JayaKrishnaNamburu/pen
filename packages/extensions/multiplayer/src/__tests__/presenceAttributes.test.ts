import { describe, expect, it } from "vitest";
import { assignMultiplayerColor } from "../presence/colorAssignment";
import {
	createRemotePresenceAttributes,
	setPresenceAttribute,
} from "../presence/presenceAttributes";

describe("createRemotePresenceAttributes", () => {
	it("COL2: interpolates a normalized color into style, never raw CSS", () => {
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

		expect(attributes.style).toBe(
			`--pen-multiplayer-color: ${assignMultiplayerColor("u-css")}`,
		);
		expect(attributes.style).not.toContain("position");
		expect(attributes.style).not.toContain(";");
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

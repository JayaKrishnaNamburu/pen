import { describe, expect, it } from "vitest";
import {
	COLLABORATION_ROUTE,
	DEFAULT_ROOM,
	roomFromPath,
} from "./collaborationRoute";

describe("roomFromPath", () => {
	it("uses the default room on the bare collaboration path", () => {
		expect(roomFromPath(COLLABORATION_ROUTE)).toBe(DEFAULT_ROOM);
	});

	it("reads the first path segment as the room", () => {
		expect(roomFromPath(`${COLLABORATION_ROUTE}/pen-studio`)).toBe(
			"pen-studio",
		);
	});

	it("decodes a percent-encoded room", () => {
		expect(roomFromPath(`${COLLABORATION_ROUTE}/pen%20studio`)).toBe(
			"pen studio",
		);
	});

	it("falls back when the room is missing or too long", () => {
		expect(roomFromPath(`${COLLABORATION_ROUTE}/`)).toBe(DEFAULT_ROOM);
		expect(roomFromPath("/other")).toBe(DEFAULT_ROOM);
		expect(roomFromPath(`${COLLABORATION_ROUTE}/${"x".repeat(65)}`)).toBe(
			DEFAULT_ROOM,
		);
	});
});

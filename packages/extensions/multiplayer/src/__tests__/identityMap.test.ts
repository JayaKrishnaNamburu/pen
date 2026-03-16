import { describe, expect, it } from "vitest";
import { ClientIdentityMap } from "../presence/identityMap";
import { assignMultiplayerColor } from "../presence/colorAssignment";

describe("ClientIdentityMap", () => {
	it("stores and retrieves users", () => {
		const map = new ClientIdentityMap();

		map.set(1, { id: "u1", name: "Ada" });

		expect(map.get(1)).toEqual({
			id: "u1",
			name: "Ada",
			color: assignMultiplayerColor("u1"),
		});
	});

	it("returns a fallback user when none is stored", () => {
		const map = new ClientIdentityMap();

		expect(map.resolve(7)).toEqual({
			id: "7",
			name: "User 7",
			color: assignMultiplayerColor("7"),
		});
	});

	it("updates from awareness states with valid users only", () => {
		const map = new ClientIdentityMap();

		map.updateFromAwareness(
			new Map<number, Record<string, unknown>>([
				[1, { user: { id: "u1", name: "Ada" } }],
				[2, { user: { id: 2, name: "Invalid" } }],
				[3, { other: true }],
			]),
		);

		expect(map.get(1)).toEqual({
			id: "u1",
			name: "Ada",
			color: assignMultiplayerColor("u1"),
		});
		expect(map.get(2)).toBeNull();
		expect(map.get(3)).toBeNull();
	});

	it("normalizes colors from awareness state", () => {
		const map = new ClientIdentityMap();

		map.updateFromAwareness(
			new Map([
				[
					1,
					{
						user: {
							id: "u1",
							name: "Ada",
							color: "red;position:absolute",
						},
					},
				],
			]),
		);

		expect(map.get(1)).toEqual({
			id: "u1",
			name: "Ada",
			color: assignMultiplayerColor("u1"),
		});
	});

	it("allows peer identity overrides", () => {
		const map = new ClientIdentityMap({
			resolvePeerIdentity(user) {
				return {
					...user,
					color: "#123456",
				};
			},
		});

		map.updateFromAwareness(
			new Map([
				[
					1,
					{
						user: {
							id: "u1",
							name: "Ada",
						},
					},
				],
			]),
		);

		expect(map.get(1)).toEqual({
			id: "u1",
			name: "Ada",
			color: "#123456",
		});
	});
});

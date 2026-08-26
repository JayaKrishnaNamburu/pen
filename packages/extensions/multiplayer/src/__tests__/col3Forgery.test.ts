import { createEditor } from "@input/pen-core";
import { createTestDocument } from "@input/pen-test";
import { describe, expect, it } from "vitest";
import { defaultSchema } from "@input/pen-schema-default";
import { MultiplayerControllerImpl } from "../controller";
import { AuthorLedger } from "../presence/authorLedger";
import { assignMultiplayerColor } from "../presence/colorAssignment";
import {
	ClientIdentityMap,
	asPresenceDisplayHint,
} from "../presence/identityMap";
import type { MultiplayerAwarenessState } from "../types";
import { wireCursor } from "./presenceAnchors";

const PEER_A_NAME = "Ada Lovelace";
const PEER_B_CLIENT_ID = 88;

describe("COL3 identity is host-authoritative", () => {
	it("COL3: peer-asserted display name is never verified identity", () => {
		const { crdtDoc } = createTestDocument([
			{ id: "b1", type: "paragraph", content: "Hello" },
		]);
		const editor = createEditor({
			schema: defaultSchema,
			document: crdtDoc,
		});
		const identityMap = new ClientIdentityMap();
		const authorLedger = new AuthorLedger();
		const controller = new MultiplayerControllerImpl({
			editor,
			config: { user: { id: "u1", name: PEER_A_NAME } },
			authorLedger,
			identityMap,
		});

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[editor.clientId, { user: { id: "u1", name: PEER_A_NAME } }],
				[
					PEER_B_CLIENT_ID,
					{
						user: {
							id: "forged-as-a",
							name: PEER_A_NAME,
							color: "#ff0000",
						},
						cursor: wireCursor(editor, 1),
					},
				],
			]),
		);

		const stored = identityMap.get(PEER_B_CLIENT_ID);
		const ledger = authorLedger.resolve(PEER_B_CLIENT_ID);
		const hint = asPresenceDisplayHint(stored);
		const peer = controller.getPeers().find((entry) => {
			return entry.clientId === PEER_B_CLIENT_ID;
		});

		expect(stored).toMatchObject({
			id: "forged-as-a",
			name: PEER_A_NAME,
			unverified: true,
		});
		expect(ledger).toEqual(stored);
		expect(stored).not.toHaveProperty("verified", true);
		expect(ledger).not.toHaveProperty("verified", true);
		expect(peer?.user).not.toHaveProperty("verified", true);
		expect(hint).toEqual({
			unverified: true,
			name: PEER_A_NAME,
			userId: "forged-as-a",
			color: "#ff0000",
		});

		editor.destroy();
	});

	it("COL3: host resolvePeerIdentity cannot stamp verified on a presence user", () => {
		const map = new ClientIdentityMap({
			resolvePeerIdentity(user) {
				return {
					...user,
					verified: true,
					name: "Ada Lovelace",
				} as typeof user & { verified: true };
			},
		});

		map.updateFromAwareness(
			new Map([
				[
					PEER_B_CLIENT_ID,
					{
						user: {
							id: "forged-as-a",
							name: "Ada Lovelace",
						},
					},
				],
			]),
		);

		const stored = map.get(PEER_B_CLIENT_ID);
		expect(stored).toEqual({
			id: "forged-as-a",
			name: "Ada Lovelace",
			unverified: true,
			color: assignMultiplayerColor("forged-as-a"),
		});
		expect(stored).not.toHaveProperty("verified");
		expect(asPresenceDisplayHint(stored)?.unverified).toBe(true);
	});
});

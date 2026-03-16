import { assignMultiplayerColor, normalizeMultiplayerColor } from "./colorAssignment";
import type {
	ClientIdentityMapLike,
	MultiplayerAwarenessState,
	MultiplayerUser,
	ResolvePeerIdentity,
	ResolvePeerIdentityContext,
} from "../types";

function createFallbackUser(clientId: number): MultiplayerUser {
	return {
		id: String(clientId),
		name: `User ${clientId}`,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isMultiplayerUser(value: unknown): value is MultiplayerUser {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		(value.color == null || typeof value.color === "string") &&
		(value.avatar == null || typeof value.avatar === "string")
	);
}

interface ClientIdentityMapOptions {
	resolvePeerIdentity?: ResolvePeerIdentity;
}

export class ClientIdentityMap implements ClientIdentityMapLike {
	private readonly map = new Map<number, MultiplayerUser>();
	private readonly resolvePeerIdentity: ResolvePeerIdentity | undefined;

	constructor(options: ClientIdentityMapOptions = {}) {
		this.resolvePeerIdentity = options.resolvePeerIdentity;
	}

	set(clientId: number, user: MultiplayerUser): void {
		this.map.set(
			clientId,
			this.normalizeUser(user, {
				clientId,
				source: "remote-awareness",
				awareness: null,
				defaultColor: assignMultiplayerColor(user.id),
			}),
		);
	}

	get(clientId: number): MultiplayerUser | null {
		return this.map.get(clientId) ?? null;
	}

	resolve(clientId: number): MultiplayerUser {
		const existingUser = this.map.get(clientId);
		if (existingUser) {
			return existingUser;
		}

		return this.normalizeUser(createFallbackUser(clientId), {
			clientId,
			source: "fallback",
			awareness: null,
			defaultColor: assignMultiplayerColor(String(clientId)),
		});
	}

	updateFromAwareness(states: Map<number, MultiplayerAwarenessState>): void {
		for (const [clientId, state] of states) {
			const user = state.user;
			if (isMultiplayerUser(user)) {
				this.map.set(
					clientId,
					this.normalizeUser(user, {
						clientId,
						source: "remote-awareness",
						awareness: state,
						defaultColor: assignMultiplayerColor(user.id),
					}),
				);
			}
		}
	}

	entries(): ReadonlyMap<number, MultiplayerUser> {
		return this.map;
	}

	private normalizeUser(
		user: MultiplayerUser,
		context: ResolvePeerIdentityContext,
	): MultiplayerUser {
		const normalizedUser = this.resolvePeerIdentity
			? this.resolvePeerIdentity(user, context)
			: user;
		return {
			...normalizedUser,
			color: normalizeMultiplayerColor(
				normalizedUser.color,
				context.defaultColor,
			),
		};
	}
}

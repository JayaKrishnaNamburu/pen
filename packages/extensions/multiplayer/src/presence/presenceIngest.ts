import type { DiagnosticEvent, Editor } from "@input/pen-types";
import {
	validateAwarenessStates,
	type AwarenessDocumentView,
} from "./awarenessValidator";
import {
	MAX_PRESENCE_UPDATES_PER_SECOND,
	MAX_TRACKED_PEERS,
	PRESENCE_REJECTED_CODE,
	type PresenceRejectionReason,
} from "./constants";
import type { MultiplayerAwarenessState } from "../types";

const PRESENCE_REJECTION_MESSAGES: Record<PresenceRejectionReason, string> = {
	oversized: "Presence state exceeded a size or length bound.",
	"wrong-typed": "Presence state had an invalid shape or type.",
	"script-bearing": "Presence state contained script-bearing content.",
	"nonexistent-block": "Presence selection named a block that is not in the document.",
	"out-of-range-offset": "Presence selection offset is outside the block.",
	"rate-limited": "Presence updates from this peer exceeded the per-second limit.",
	"peer-cap": "Additional peers are counted and not rendered past the tracked-peer cap.",
};

export interface PresenceIngestOptions {
	editor: Editor;
	localClientId: number;
	now?: () => number;
}

export class PresenceIngest {
	private readonly editor: Editor;
	private readonly localClientId: number;
	private readonly now: () => number;
	private readonly accepted = new Map<number, MultiplayerAwarenessState>();
	private readonly trackedPeers = new Set<number>();
	private readonly updateStamps = new Map<number, number[]>();

	constructor(options: PresenceIngestOptions) {
		this.editor = options.editor;
		this.localClientId = options.localClientId;
		this.now = options.now ?? Date.now;
	}

	ingest(
		rawStates: Map<number, unknown>,
	): Map<number, MultiplayerAwarenessState> {
		const validated = validateAwarenessStates(
			rawStates,
			createDocumentView(this.editor),
			this.localClientId,
		);
		const seen = new Set<string>();
		for (const rejection of validated.rejections) {
			const key = `${rejection.clientId}:${rejection.reason}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			this.emitRejection(rejection.clientId, rejection.reason);
		}

		const next = new Map<number, MultiplayerAwarenessState>();
		const localState = validated.states.get(this.localClientId);
		if (localState) {
			next.set(this.localClientId, localState);
		}

		this.forgetAbsentPeers(rawStates);

		let overflow = 0;
		for (const [clientId, state] of validated.states) {
			if (clientId === this.localClientId) {
				continue;
			}
			if (!this.allowUpdate(clientId)) {
				const previous = this.accepted.get(clientId);
				if (previous) {
					next.set(clientId, previous);
				}
				this.emitRejection(clientId, "rate-limited");
				continue;
			}
			if (!this.trackPeer(clientId)) {
				overflow += 1;
				continue;
			}
			next.set(clientId, state);
			this.accepted.set(clientId, state);
		}

		if (overflow > 0) {
			this.emitRejection(undefined, "peer-cap", overflow);
		}

		for (const clientId of [...this.accepted.keys()]) {
			if (clientId !== this.localClientId && !next.has(clientId)) {
				this.accepted.delete(clientId);
			}
		}
		for (const clientId of [...this.trackedPeers]) {
			if (!next.has(clientId)) {
				this.trackedPeers.delete(clientId);
			}
		}

		return next;
	}

	destroy(): void {
		this.accepted.clear();
		this.trackedPeers.clear();
		this.updateStamps.clear();
	}

	private allowUpdate(clientId: number): boolean {
		const now = this.now();
		const windowStart = now - 1_000;
		const stamps = (this.updateStamps.get(clientId) ?? []).filter(
			(stamp) => stamp > windowStart,
		);
		if (stamps.length >= MAX_PRESENCE_UPDATES_PER_SECOND) {
			this.updateStamps.set(clientId, stamps);
			return false;
		}
		stamps.push(now);
		this.updateStamps.set(clientId, stamps);
		return true;
	}

	private trackPeer(clientId: number): boolean {
		if (this.trackedPeers.has(clientId)) {
			return true;
		}
		if (this.trackedPeers.size >= MAX_TRACKED_PEERS) {
			return false;
		}
		this.trackedPeers.add(clientId);
		return true;
	}

	private forgetAbsentPeers(rawStates: Map<number, unknown>): void {
		for (const clientId of [...this.trackedPeers]) {
			if (!rawStates.has(clientId)) {
				this.trackedPeers.delete(clientId);
				this.accepted.delete(clientId);
				this.updateStamps.delete(clientId);
			}
		}
	}

	private emitRejection(
		clientId: number | undefined,
		reason: PresenceRejectionReason,
		untrackedPeerCount?: number,
	): void {
		const event: DiagnosticEvent = {
			code: PRESENCE_REJECTED_CODE,
			level: "warn",
			source: "multiplayer",
			extension: "multiplayer",
			message: PRESENCE_REJECTION_MESSAGES[reason],
			reason,
		};
		if (clientId !== undefined) {
			event.clientId = clientId;
		}
		if (untrackedPeerCount !== undefined) {
			event.untrackedPeerCount = untrackedPeerCount;
		}
		this.editor.internals.emit("diagnostic", event);
	}
}

function createDocumentView(editor: Editor): AwarenessDocumentView {
	return {
		blockLength(blockId: string): number | null {
			const block = editor.getBlock(blockId);
			if (!block) {
				return null;
			}
			return block.textContent({ resolved: true }).length;
		},
	};
}

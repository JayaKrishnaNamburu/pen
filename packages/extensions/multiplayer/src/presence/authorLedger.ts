import type {
	AuthorIdentity,
	AuthorLedgerEntry,
	AuthorLedgerLike,
} from "../types";

export class AuthorLedger implements AuthorLedgerLike {
	private readonly entriesByClientId = new Map<number, AuthorLedgerEntry>();

	record(
		clientId: number,
		author: AuthorIdentity,
		timestamp = Date.now(),
	): void {
		const existingEntry = this.entriesByClientId.get(clientId);
		if (existingEntry) {
			this.entriesByClientId.set(clientId, {
				clientId,
				author,
				firstSeenAt: existingEntry.firstSeenAt,
				lastSeenAt: timestamp,
			});
			return;
		}

		this.entriesByClientId.set(clientId, {
			clientId,
			author,
			firstSeenAt: timestamp,
			lastSeenAt: timestamp,
		});
	}

	resolve(clientId: number): AuthorIdentity | null {
		return this.entriesByClientId.get(clientId)?.author ?? null;
	}

	entries(): readonly AuthorLedgerEntry[] {
		return Array.from(this.entriesByClientId.values());
	}
}

import type { DiagnosticEvent } from "@input/pen-types";

export type DomSchedulerPhase = "idle" | "read" | "write";

export type DomSchedulerOwner = string | { readonly rootId: string };

export type DomSchedulerOptions = {
	onDiagnostic?: (event: DiagnosticEvent) => void;
};

type ScheduledJob = () => void;

/**
 * One scheduler per editor root (SCH3). Construct with that root's id or
 * owner; do not share an instance or its queues across editors.
 *
 * Verbatim contract: `read`, `write`, `measureNow`, `phase`.
 * Standalone Wave 3.1 module: not wired to editor.apply or React.
 */
export class DomScheduler {
	readonly rootId: string;
	private _phase: DomSchedulerPhase = "idle";
	private measureNowCalls = 0;
	private readonly onDiagnostic?: (event: DiagnosticEvent) => void;
	private readQueue: ScheduledJob[] = [];
	private writeQueue: ScheduledJob[] = [];
	private activeReads: ScheduledJob[] | null = null;
	private activeWrites: ScheduledJob[] | null = null;
	private rafHandle: number | null = null;
	private readAfterWriteForced = false;

	constructor(owner: DomSchedulerOwner, options?: DomSchedulerOptions) {
		this.rootId = typeof owner === "string" ? owner : owner.rootId;
		this.onDiagnostic = options?.onDiagnostic;
	}

	get phase(): DomSchedulerPhase {
		return this._phase;
	}

	get diagnostics(): { readonly measureNowCount: number } {
		return { measureNowCount: this.measureNowCalls };
	}

	read<T>(fn: () => T): Promise<T> {
		return new Promise((resolve, reject) => {
			this.enqueueRead(() => {
				try {
					resolve(fn());
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	write(fn: () => void): Promise<void> {
		return new Promise((resolve, reject) => {
			this.enqueueWrite(() => {
				try {
					fn();
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	measureNow<T>(fn: () => T): T {
		this.measureNowCalls += 1;
		return fn();
	}

	private enqueueRead(job: ScheduledJob): void {
		if (this._phase === "read" && this.activeReads) {
			this.activeReads.push(job);
			return;
		}

		if (this._phase === "write") {
			this.readQueue.push(job);
			if (!this.readAfterWriteForced) {
				this.readAfterWriteForced = true;
				this.onDiagnostic?.({
					code: "read-after-write",
					level: "warn",
					source: "scheduler",
					message:
						"read queued during write phase; routed to a layout-observing next-frame flush",
				});
			}
			this.scheduleFlush();
			return;
		}

		this.readQueue.push(job);
		this.scheduleFlush();
	}

	private enqueueWrite(job: ScheduledJob): void {
		if (
			(this._phase === "read" || this._phase === "write") &&
			this.activeWrites
		) {
			this.activeWrites.push(job);
			return;
		}

		this.writeQueue.push(job);
		this.scheduleFlush();
	}

	private scheduleFlush(): void {
		if (this.rafHandle != null) {
			return;
		}

		this.rafHandle = globalThis.requestAnimationFrame(() => {
			this.rafHandle = null;
			this.flush();
		});
	}

	private flush(): void {
		// Collect: pending queues. CommitEvent[] and the selection record join
		// this snapshot when Wave 2 wires the renderer flush — not this module.
		this.activeReads = this.readQueue;
		this.activeWrites = this.writeQueue;
		this.readQueue = [];
		this.writeQueue = [];
		this.readAfterWriteForced = false;

		this._phase = "read";
		// geometry cache invalidation scan — Wave 3.2
		this.drain(this.activeReads);

		this._phase = "write";
		// renderer DOM updates already committed by construction
		this.drain(this.activeWrites);
		// wave-5: projector runs last-before-overlays
		// overlay paints — Wave 3.3

		this.activeReads = null;
		this.activeWrites = null;
		this._phase = "idle";

		if (this.readQueue.length > 0 || this.writeQueue.length > 0) {
			this.scheduleFlush();
		}
	}

	private drain(jobs: ScheduledJob[]): void {
		for (const job of jobs) {
			job();
		}
	}
}

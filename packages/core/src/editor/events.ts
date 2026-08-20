import type { Unsubscribe } from "@input/pen-types";

type Handler = (...args: unknown[]) => void;

export class EventEmitter {
	private readonly _handlers = new Map<string, Set<Handler>>();

	on(event: string, handler: Handler): Unsubscribe {
		let set = this._handlers.get(event);
		if (!set) {
			set = new Set();
			this._handlers.set(event, set);
		}
		set.add(handler);
		return () => {
			set!.delete(handler);
		};
	}

	off(event: string, handler: Handler): void {
		this._handlers.get(event)?.delete(handler);
	}

	emit(event: string, ...args: unknown[]): void {
		const set = this._handlers.get(event);
		if (!set || set.size === 0) {
			if (event === "diagnostic") {
				// CH5 default diagnostics sink: print when no host is listening
				// so default DX matches the pre-channel console sites.
				console.error("Pen diagnostic", args[0]);
			}
			return;
		}
		for (const handler of set) {
			try {
				handler(...args);
			} catch (err) {
				if (event === "diagnostic") {
					// CH5: emitting a diagnostic about a diagnostic handler would
					// recurse. This console is the sink of last resort.
					console.error(
						`EventEmitter: handler for "${event}" threw:`,
						err,
					);
					continue;
				}
				this.emit("diagnostic", {
					code: "PEN_EVENT_001",
					level: "error",
					source: "events",
					message: `EventEmitter: handler for "${event}" threw`,
					remediation:
						"Guard the listener so a throw cannot prevent later handlers from running.",
					error: err,
					event,
				});
			}
		}
	}

	has(event: string): boolean {
		return (this._handlers.get(event)?.size ?? 0) > 0;
	}

	removeAllListeners(event?: string): void {
		if (event) {
			this._handlers.delete(event);
		} else {
			this._handlers.clear();
		}
	}
}

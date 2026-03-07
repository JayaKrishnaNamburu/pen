import type { Unsubscribe } from "@pen/types";

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
    if (!set) return;
    for (const handler of set) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`EventEmitter: handler for "${event}" threw:`, err);
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this._handlers.delete(event);
    } else {
      this._handlers.clear();
    }
  }
}

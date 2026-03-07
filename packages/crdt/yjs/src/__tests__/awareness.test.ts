import { describe, expect, it } from "vitest";

import { yjsAdapter } from "../adapter.js";
import { createYjsDocument } from "../document.js";
import { createYjsAwareness } from "../awareness.js";

describe("awareness", () => {
  const adapter = yjsAdapter();

  it("setLocalState and getStates include local client", () => {
    const doc = createYjsDocument(adapter);
    const awareness = createYjsAwareness(doc);

    awareness.setLocalState({ cursor: { blockId: "b1", offset: 5 } });
    const states = awareness.getStates();
    expect(states.size).toBeGreaterThanOrEqual(1);

    const localState = awareness.getLocalState();
    expect(localState).toEqual({ cursor: { blockId: "b1", offset: 5 } });

    awareness.destroy();
  });

  it("on('change') fires when state changes", () => {
    const doc = createYjsDocument(adapter);
    const awareness = createYjsAwareness(doc);

    const changes: unknown[] = [];
    const cb = (event: unknown) => changes.push(event);

    awareness.on("change", cb);
    awareness.setLocalState({ cursor: { blockId: "b1", offset: 0 } });

    expect(changes.length).toBeGreaterThanOrEqual(1);

    awareness.off("change", cb);
    awareness.destroy();
  });

  it("off('change') removes the listener", () => {
    const doc = createYjsDocument(adapter);
    const awareness = createYjsAwareness(doc);

    const changes: unknown[] = [];
    const cb = (event: unknown) => changes.push(event);

    awareness.on("change", cb);
    awareness.off("change", cb);

    awareness.setLocalState({ cursor: { blockId: "b2", offset: 0 } });
    expect(changes).toHaveLength(0);

    awareness.destroy();
  });

  it("destroy cleans up the awareness instance", () => {
    const doc = createYjsDocument(adapter);
    const awareness = createYjsAwareness(doc);

    awareness.setLocalState({ initial: true });

    const changes: unknown[] = [];
    const cb = (event: unknown) => changes.push(event);
    awareness.on("change", cb);

    awareness.destroy();

    const postDestroy: unknown[] = [];
    awareness.on("change", (e) => postDestroy.push(e));
    expect(postDestroy).toHaveLength(0);
  });
});

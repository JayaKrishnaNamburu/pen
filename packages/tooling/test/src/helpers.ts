import * as Y from "yjs";

let testIdCounter = 0;

export function generateTestId(): string {
  return `test-block-${++testIdCounter}`;
}

export function resetTestIdCounter(): void {
  testIdCounter = 0;
}

export function toYMap(obj: Record<string, unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      map.set(key, toYMap(value as Record<string, unknown>));
    } else if (Array.isArray(value)) {
      const arr = new Y.Array<unknown>();
      arr.push(value);
      map.set(key, arr);
    } else {
      map.set(key, value);
    }
  }
  return map;
}

import { createTwoPeerHarness } from "./twoPeerHarness";
import type { TestEditorOptions, TestCollaboration } from "./types";

export function createTestCollaboration(
  options?: TestEditorOptions,
): TestCollaboration {
  // peers must share a seed; independent populateYDoc histories lose one side on sync
  const harness = createTwoPeerHarness(options);
  return {
    editorA: harness.peerA.editor,
    editorB: harness.peerB.editor,
    sync() {
      harness.sync();
    },
  };
}

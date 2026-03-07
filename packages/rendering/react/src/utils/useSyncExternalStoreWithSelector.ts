import { useSyncExternalStore } from "react";

/**
 * `useSyncExternalStore` with a selector and equality check.
 * Avoids re-renders when the selected slice hasn't changed.
 */
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: () => Snapshot,
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  let prevSelection: Selection | undefined;
  let prevSnapshot: Snapshot | undefined;

  const getSelection = (): Selection => {
    const snapshot = getSnapshot();
    if (snapshot === prevSnapshot && prevSelection !== undefined) {
      return prevSelection;
    }
    const nextSelection = selector(snapshot);
    if (
      prevSelection !== undefined &&
      isEqual &&
      isEqual(prevSelection, nextSelection)
    ) {
      return prevSelection;
    }
    prevSnapshot = snapshot;
    prevSelection = nextSelection;
    return nextSelection;
  };

  const getServerSelection = (): Selection => {
    return selector(getServerSnapshot());
  };

  return useSyncExternalStore(subscribe, getSelection, getServerSelection);
}

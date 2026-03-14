import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

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
	const instanceRef = useRef<{
		hasValue: boolean;
		value: Selection | undefined;
	}>({
		hasValue: false,
		value: undefined,
	});

	const [getSelection, getServerSelection] = useMemo(() => {
		let hasMemo = false;
		let memoizedSnapshot: Snapshot | undefined;
		let memoizedSelection: Selection | undefined;

		const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
			if (!hasMemo) {
				hasMemo = true;
				memoizedSnapshot = nextSnapshot;
				const nextSelection = selector(nextSnapshot);

				if (instanceRef.current.hasValue && isEqual) {
					const currentSelection = instanceRef.current.value as Selection;
					if (isEqual(currentSelection, nextSelection)) {
						memoizedSelection = currentSelection;
						return currentSelection;
					}
				}

				memoizedSelection = nextSelection;
				return nextSelection;
			}

			if (Object.is(memoizedSnapshot, nextSnapshot)) {
				return memoizedSelection as Selection;
			}

			const nextSelection = selector(nextSnapshot);

			if (
				isEqual &&
				memoizedSelection !== undefined &&
				isEqual(memoizedSelection, nextSelection)
			) {
				memoizedSnapshot = nextSnapshot;
				return memoizedSelection;
			}

			memoizedSnapshot = nextSnapshot;
			memoizedSelection = nextSelection;
			return nextSelection;
		};

		return [
			() => memoizedSelector(getSnapshot()),
			() => memoizedSelector(getServerSnapshot()),
		] as const;
	}, [getServerSnapshot, getSnapshot, isEqual, selector]);

	const selection = useSyncExternalStore(
		subscribe,
		getSelection,
		getServerSelection,
	);

	useEffect(() => {
		instanceRef.current.hasValue = true;
		instanceRef.current.value = selection;
	}, [selection]);

	return selection;
}

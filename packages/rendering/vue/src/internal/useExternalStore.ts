import {
  getCurrentScope,
  onScopeDispose,
  readonly,
  shallowRef,
  type ShallowRef,
} from "vue";

export function useExternalStore<T>(
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => T,
  isEqual?: (left: T, right: T) => boolean,
) {
  const snapshot: ShallowRef<T> = shallowRef(getSnapshot());

  const updateSnapshot = () => {
    const nextSnapshot = getSnapshot();
    const equal = isEqual
      ? isEqual(snapshot.value, nextSnapshot)
      : Object.is(snapshot.value, nextSnapshot);
    if (!equal) {
      snapshot.value = nextSnapshot;
    }
  };

  const unsubscribe = subscribe(updateSnapshot);
  if (getCurrentScope()) {
    onScopeDispose(unsubscribe);
  }

  return readonly(snapshot);
}

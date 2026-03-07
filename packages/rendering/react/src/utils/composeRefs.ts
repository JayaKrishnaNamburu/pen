import type { Ref, MutableRefObject } from "react";

export function composeRefs<T>(
  ...refs: (Ref<T> | undefined | null)[]
): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") {
        ref(node);
      } else {
        (ref as MutableRefObject<T | null>).current = node;
      }
    }
  };
}

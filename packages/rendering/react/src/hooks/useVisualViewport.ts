import { useSyncExternalStore } from "react";

export interface VisualViewportState {
  height: number;
  offsetTop: number;
}

const SERVER_SNAPSHOT: VisualViewportState = { height: 800, offsetTop: 0 };

export function useVisualViewport(): VisualViewportState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(callback: () => void): () => void {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return () => {};
  vv.addEventListener("resize", callback);
  vv.addEventListener("scroll", callback);
  return () => {
    vv.removeEventListener("resize", callback);
    vv.removeEventListener("scroll", callback);
  };
}

function getSnapshot(): VisualViewportState {
  return {
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  };
}

function getServerSnapshot(): VisualViewportState {
  return SERVER_SNAPSHOT;
}

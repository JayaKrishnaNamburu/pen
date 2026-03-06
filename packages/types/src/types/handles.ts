import type { AppPlacement } from "./block.js";
import type { LayoutProps } from "./layout.js";

export interface BlockHandle {
  readonly id: string;
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly index: number;

  readonly prev: BlockHandle | null;
  readonly next: BlockHandle | null;
  readonly parent: BlockHandle | null;
  readonly children: readonly BlockHandle[];

  descendants(type?: string): Iterable<BlockHandle>;
  ancestors(): Iterable<BlockHandle>;
  siblings(): Iterable<BlockHandle>;

  readonly layout: LayoutProps | null;
  readonly isLayoutChild: boolean;
  layoutParent(): BlockHandle | null;

  anchoredApps(): readonly AppHandle[];

  textContent(options?: { resolved?: boolean }): string;
  textDeltas(): Array<{
    insert: string;
    attributes?: Record<string, unknown>;
  }>;
  length(): number;

  meta(namespace: string): Readonly<Record<string, unknown>> | null;
}

export interface AppHandle {
  readonly id: string;
  readonly type: string;
  readonly placement: AppPlacement;
  readonly config: Readonly<Record<string, unknown>>;
  readonly anchorBlock: BlockHandle | null;
}

export interface Block<
  Type extends string = string,
  Props extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  type: Type;
  props: Props;
  content?: string;
  children?: Block[];
}

export type AnchorPosition =
  | "before"
  | "after"
  | "left"
  | "right"
  | "overlay";

export type AppPlacement =
  | { mode: "inline"; blockId: string; index: number }
  | { mode: "anchored"; blockId: string; anchor: AnchorPosition };

export interface App<
  Type extends string = string,
  Config extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  type: Type;
  config: Config;
  placement: AppPlacement;
}

export interface Range {
  index: number;
  length: number;
}

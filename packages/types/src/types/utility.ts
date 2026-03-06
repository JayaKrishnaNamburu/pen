export type Unsubscribe = () => void;

export type Spacing =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number };

export type BorderDef = {
  width?: number;
  style?: string;
  color?: string;
};

import type { Spacing, BorderDef } from "./utility.js";

export interface LayoutSchema {
  modes: readonly ("flex" | "grid")[];
  defaultMode: "flex" | "grid";
  allowedChildren?: string[];
  minChildren?: number;
  maxChildren?: number;
}

export interface LayoutProps {
  display: "flex" | "grid";
  direction?: "row" | "column" | "row-reverse" | "column-reverse";
  wrap?: "nowrap" | "wrap" | "wrap-reverse";
  gap?: number | string;
  alignItems?: "start" | "center" | "end" | "stretch" | "baseline";
  justifyContent?:
    | "start"
    | "center"
    | "end"
    | "between"
    | "around"
    | "evenly";
  columns?: string;
  rows?: string;
  autoFlow?: "row" | "column" | "dense";
  padding?: Spacing;
  margin?: Spacing;
  background?: string;
  border?: BorderDef;
  borderRadius?: number | string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  overflow?: "visible" | "hidden" | "auto";
}

export interface LayoutChildProps {
  flex?: string;
  alignSelf?: "start" | "center" | "end" | "stretch";
  order?: number;
  gridColumn?: string;
  gridRow?: string;
  colSpan?: number;
}

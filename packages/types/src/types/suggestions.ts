import type { Position } from "./ops.js";

export interface BlockSuggestion {
  id: string;
  action: "insert-block" | "delete-block" | "move-block" | "convert-block";
  author: string;
  authorType: "user" | "ai";
  createdAt: number;
  model?: string;
  previousState?: {
    type?: string;
    position?: Position;
    props?: Record<string, unknown>;
  };
}

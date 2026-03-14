import type { Editor } from "@pen/core";
import type { GenerationState } from "@pen/ai";
import { useAI } from "./useAI";

export function useGeneration(editor: Editor): GenerationState | null {
	return useAI(editor).activeGeneration;
}

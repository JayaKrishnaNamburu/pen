import type { Editor } from "@input/pen-types";
import type { GenerationState } from "@input/pen-ai";
import { useAI } from "./useAI";

export function useGeneration(editor: Editor): GenerationState | null {
	return useAI(editor).activeGeneration;
}

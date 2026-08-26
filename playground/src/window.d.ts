import type { AIController } from "@input/pen-ai";
import type { Editor } from "@input/pen-types";

declare global {
	interface Window {
		penPlayground?: { editor: Editor; aiController: AIController | null };
	}
}

export {};

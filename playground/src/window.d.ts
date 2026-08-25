import type { Editor } from "@input/pen-types";

declare global {
	interface Window {
		penPlayground?: { editor: Editor };
	}
}

export {};

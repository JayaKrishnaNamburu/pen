export interface InputBackend {
	activate(element: HTMLElement, ytext: unknown): void;
	deactivate(): void;
	updateSelection(relPos: unknown): void;
}

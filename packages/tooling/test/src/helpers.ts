let testIdCounter = 0;

export function generateTestId(): string {
	return `test-block-${++testIdCounter}`;
}

export function resetTestIdCounter(): void {
	testIdCounter = 0;
}

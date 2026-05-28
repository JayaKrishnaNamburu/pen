export type FieldEditorSelectionSource =
	| "user-dom"
	| "programmatic"
	| "edit-context-textupdate"
	| "history"
	| "composition"
	| "cell";

export type FieldEditorSelectionCell = {
	row: number;
	col: number;
};

export type FieldEditorSelectionSnapshot = {
	blockId: string;
	anchorOffset: number;
	focusOffset: number;
	cell?: FieldEditorSelectionCell;
};

const DEFAULT_PRECEDENCE: readonly FieldEditorSelectionSource[] = [
	"programmatic",
	"edit-context-textupdate",
	"composition",
	"cell",
	"user-dom",
	"history",
];

export class FieldEditorSelectionAuthority {
	private readonly selections = new Map<
		FieldEditorSelectionSource,
		FieldEditorSelectionSnapshot
	>();
	private applyingSelectionDepth = 0;

	get isApplyingSelection(): number {
		return this.applyingSelectionDepth;
	}

	set(
		source: FieldEditorSelectionSource,
		selection: FieldEditorSelectionSnapshot | null,
	): void {
		if (selection) {
			this.selections.set(source, selection);
			return;
		}
		this.selections.delete(source);
	}

	get(
		source: FieldEditorSelectionSource,
		blockId?: string | null,
	): FieldEditorSelectionSnapshot | null {
		const selection = this.selections.get(source) ?? null;
		if (!selection || (blockId && selection.blockId !== blockId)) {
			return null;
		}
		return selection;
	}

	has(source: FieldEditorSelectionSource): boolean {
		return this.selections.has(source);
	}

	resolve(
		blockId: string,
		sources: readonly FieldEditorSelectionSource[] = DEFAULT_PRECEDENCE,
	): FieldEditorSelectionSnapshot | null {
		for (const source of sources) {
			const selection = this.get(source, blockId);
			if (selection) {
				return selection;
			}
		}
		return null;
	}

	clear(source: FieldEditorSelectionSource): void {
		this.selections.delete(source);
	}

	reset(): void {
		this.selections.clear();
		this.applyingSelectionDepth = 0;
	}

	beginApplyingSelection(): () => void {
		this.applyingSelectionDepth += 1;
		let released = false;
		return () => {
			if (released) {
				return;
			}
			released = true;
			this.applyingSelectionDepth = Math.max(
				0,
				this.applyingSelectionDepth - 1,
			);
		};
	}

	applySelectionUntilNextFrame(): void {
		const release = this.beginApplyingSelection();
		requestAnimationFrame(release);
	}
}

import type { SelectionState } from "@pen/types";
import {
	resolveSelectAllBehavior,
	type EditorSelectAllBehavior,
} from "../constants/selectAll";

export type SelectAllScope = "cell" | "block" | "document";

type SelectAllCycle = {
	blockId: string;
	scope: SelectAllScope;
};

export class SelectAllController {
	private behavior: EditorSelectAllBehavior;
	private cycle: SelectAllCycle | null = null;
	private preserveCycle = false;

	constructor(behavior?: EditorSelectAllBehavior) {
		this.behavior = behavior ?? resolveSelectAllBehavior("content-first");
	}

	getBehavior(): EditorSelectAllBehavior {
		return this.behavior;
	}

	setBehavior(behavior: EditorSelectAllBehavior): void {
		if (this.behavior === behavior) {
			return;
		}
		this.behavior = behavior;
		this.resetCycle();
	}

	recordScope(blockId: string, scope: SelectAllScope): void {
		this.preserveCycle = true;
		this.cycle = { blockId, scope };
	}

	resetCycle(): void {
		this.preserveCycle = false;
		this.cycle = null;
	}

	consumeShouldPreserveCycle(
		selection: SelectionState | null,
		matchesSelection: (
			cycle: SelectAllCycle,
			selection: SelectionState | null,
		) => boolean,
	): boolean {
		const preserve =
			this.preserveCycle ||
			(this.cycle ? matchesSelection(this.cycle, selection) : false);
		this.preserveCycle = false;
		if (!preserve) {
			this.cycle = null;
		}
		return preserve;
	}

	hasScope(blockId: string | null | undefined, scope: SelectAllScope): boolean {
		return (
			this.cycle != null &&
			this.cycle.blockId === blockId &&
			this.cycle.scope === scope
		);
	}
}

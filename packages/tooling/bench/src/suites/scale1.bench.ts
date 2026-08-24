import type { BenchDefinition } from "../bench";
import {
	SCALE1_MEASUREMENTS,
	type EnvelopeRungId,
} from "../constants/scale1";
import { emptyTimerFloor } from "../harness/floor";
import {
	ENVELOPE_TABLE_BLOCK_ID,
	assertPeerBObservedText,
	assertPeerBObservesPeerAInsert,
	createEnvelopeCollaboration,
	createEnvelopeEditor,
	envelopeKeystroke,
	type EnvelopeKeystroke,
} from "../fixtures/envelope";

export function scale1EnvelopeBenchId(rungId: EnvelopeRungId): string {
	return `scale1.envelope.${rungId}`;
}

export function scale1EnvelopeFloorId(rungId: EnvelopeRungId): string {
	return `scale1.envelope.${rungId}.floor`;
}

function createRungRunner(
	rungId: EnvelopeRungId,
): Pick<BenchDefinition, "fn" | "teardown" | "floor"> {
	if (rungId === "concurrentPeers-2") {
		return createPeerRunner();
	}

	let editor: ReturnType<typeof createEnvelopeEditor> | null = null;
	let floorEditor: ReturnType<typeof createEnvelopeEditor> | null = null;
	const keystroke = envelopeKeystroke(rungId);

	return {
		fn: (b) => {
			if (!editor) {
				editor = createEnvelopeEditor(rungId);
			}
			const before = measureTargetLength(editor, keystroke);
			b.start();
			editor.apply(keystroke.ops, { origin: "user" });
			b.end();
			b.observe(
				"insertedCharCount",
				measureTargetLength(editor, keystroke) - before,
				1,
			);
		},
		floor: (b) => {
			if (!floorEditor) {
				floorEditor = createEnvelopeEditor(rungId);
			}
			emptyTimerFloor(b);
		},
		teardown: async () => {
			if (editor) {
				await editor.destroy();
				editor = null;
			}
			if (floorEditor) {
				await floorEditor.destroy();
				floorEditor = null;
			}
		},
	};
}

const PEER_TIMED_INSERT = "x";

function measureTargetLength(
	editor: ReturnType<typeof createEnvelopeEditor>,
	keystroke: EnvelopeKeystroke,
): number {
	const op = keystroke.ops[0];
	if (op?.type === "splice-text" && op.cell) {
		return String(
			editor.internals.getCellText(
				ENVELOPE_TABLE_BLOCK_ID,
				op.cell.row,
				op.cell.col,
			) ?? "",
		).length;
	}
	return editor.getBlock(keystroke.targetId).textContent().length;
}

export function createPeerRunner(
	createCollab: () => ReturnType<typeof createEnvelopeCollaboration> = () =>
		createEnvelopeCollaboration(100),
): Pick<BenchDefinition, "fn" | "teardown" | "floor"> {
	let collab: ReturnType<typeof createEnvelopeCollaboration> | null = null;
	let floorCollab: ReturnType<typeof createEnvelopeCollaboration> | null =
		null;
	const keystroke = envelopeKeystroke("concurrentPeers-2");

	return {
		fn: (b) => {
			if (!collab) {
				collab = createCollab();
				assertPeerBObservesPeerAInsert(collab);
			}
			b.start();
			collab.editorA.apply(keystroke.ops, { origin: "user" });
			collab.sync();
			b.end();
			assertPeerBObservedText(collab, keystroke.targetId, PEER_TIMED_INSERT);
			b.observe("peerObservedInsert", 1, 1);
		},
		floor: (b) => {
			if (!floorCollab) {
				floorCollab = createCollab();
			}
			b.start();
			floorCollab.sync();
			b.end();
		},
		teardown: async () => {
			if (collab) {
				await collab.editorA.destroy();
				await collab.editorB.destroy();
				collab = null;
			}
			if (floorCollab) {
				await floorCollab.editorA.destroy();
				await floorCollab.editorB.destroy();
				floorCollab = null;
			}
		},
	};
}

function createRungFloorRunner(
	rungId: EnvelopeRungId,
): Pick<BenchDefinition, "fn" | "teardown"> {
	if (rungId === "concurrentPeers-2") {
		return createPeerFloorRunner();
	}

	let editor: ReturnType<typeof createEnvelopeEditor> | null = null;

	return {
		fn: (b) => {
			if (!editor) {
				editor = createEnvelopeEditor(rungId);
			}
			b.start();
			b.end();
		},
		teardown: async () => {
			if (!editor) {
				return;
			}
			await editor.destroy();
			editor = null;
		},
	};
}

function createPeerFloorRunner(): Pick<BenchDefinition, "fn" | "teardown"> {
	let collab: ReturnType<typeof createEnvelopeCollaboration> | null = null;

	return {
		fn: (b) => {
			if (!collab) {
				collab = createEnvelopeCollaboration(100);
			}
			b.start();
			collab.sync();
			b.end();
		},
		teardown: async () => {
			if (!collab) {
				return;
			}
			await collab.editorA.destroy();
			await collab.editorB.destroy();
			collab = null;
		},
	};
}

export const scale1Benchmarks: BenchDefinition[] = SCALE1_MEASUREMENTS.map(
	(spec) => ({
		id: scale1EnvelopeBenchId(spec.id),
		name: `SCALE1 envelope ${spec.id}`,
		axis: spec.axis,
		axisPoint: spec.point,
		...createRungRunner(spec.id),
	}),
);

/** Same setup as `scale1Benchmarks` with Pen's apply removed from the clock. */
export const scale1FloorBenchmarks: BenchDefinition[] = SCALE1_MEASUREMENTS.map(
	(spec) => ({
		id: scale1EnvelopeFloorId(spec.id),
		name: `SCALE1 envelope ${spec.id} harness floor`,
		axis: spec.axis,
		axisPoint: spec.point,
		...createRungFloorRunner(spec.id),
	}),
);

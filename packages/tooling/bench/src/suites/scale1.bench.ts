import type { BenchDefinition } from "../bench";
import type { EnvelopeRungId } from "../constants/scale1";
import { SCALE1_MEASUREMENTS } from "../constants/scale1";
import {
	createEnvelopeCollaboration,
	createEnvelopeEditor,
	envelopeKeystroke,
} from "../fixtures/envelope";

function createRungRunner(
	rungId: EnvelopeRungId,
): Pick<BenchDefinition, "fn" | "teardown"> {
	if (rungId === "concurrentPeers-2") {
		return createPeerRunner();
	}

	let editor: ReturnType<typeof createEnvelopeEditor> | null = null;
	const keystroke = envelopeKeystroke(rungId);

	return {
		fn: (b) => {
			if (!editor) {
				editor = createEnvelopeEditor(rungId);
			}
			b.start();
			editor.apply(keystroke.ops, { origin: "user" });
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

function createPeerRunner(): Pick<BenchDefinition, "fn" | "teardown"> {
	let collab: ReturnType<typeof createEnvelopeCollaboration> | null = null;
	const keystroke = envelopeKeystroke("concurrentPeers-2");

	return {
		fn: (b) => {
			if (!collab) {
				collab = createEnvelopeCollaboration(100);
			}
			b.start();
			collab.editorA.apply(keystroke.ops, { origin: "user" });
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
		id: `scale1.envelope.${spec.id}`,
		name: `SCALE1 envelope ${spec.id}`,
		axis: spec.axis,
		axisPoint: spec.point,
		...createRungRunner(spec.id),
	}),
);

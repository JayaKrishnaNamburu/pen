import type { DocumentOp, Extension, OpOrigin } from "@input/pen-types";
import { INPUT_RULES_ENGINE_SLOT_KEY } from "@input/pen-types";
import { InputRuleEngine } from "./engine";
import { defaultBlockRules } from "./defaultRules";
import { defaultInlineRules } from "./inlineRules";
import type { AutoformatConfig } from "./types";

export const AUTOFORMAT_EXTENSION_NAME = "autoformat";

const BYPASS_ORIGINS = new Set<OpOrigin>([
	"input-rule",
	"collaborator",
	"import",
	"history",
	"system",
]);

export function autoformatExtension(config: AutoformatConfig = {}): Extension {
	const engine = new InputRuleEngine();

	if (!config.disableDefaults) {
		for (const rule of defaultBlockRules) {
			engine.register(rule);
		}
	}

	if (!config.disableDefaultInlineRules) {
		for (const rule of defaultInlineRules) {
			engine.registerInline(rule);
		}
	}

	if (config.rules) {
		for (const rule of config.rules) {
			engine.register(rule);
		}
	}

	if (config.inlineRules) {
		for (const rule of config.inlineRules) {
			engine.registerInline(rule);
		}
	}

	let unsub: (() => void) | null = null;
	const produced = new WeakSet<DocumentOp[]>();

	return {
		name: AUTOFORMAT_EXTENSION_NAME,
		version: "0.0.0",

		activateClient: async (ctx) => {
			const { editor } = ctx;

			unsub?.();
			unsub = editor.onBeforeApply(
				(ops, options) => {
					const origin = options.origin ?? "user";
					if (BYPASS_ORIGINS.has(origin)) return ops;
					if (produced.has(ops)) return ops;
					const next = appendInputRuleTransforms(editor, engine, ops);
					produced.add(next);
					return next;
				},
				{ priority: 300 },
			);

			ctx.editor.internals.assignSlot(
				INPUT_RULES_ENGINE_SLOT_KEY,
				engine,
			);
		},

		deactivateClient: async () => {
			unsub?.();
			unsub = null;
		},
	};
}

function appendInputRuleTransforms(
	editor: Parameters<NonNullable<Extension["activateClient"]>>[0]["editor"],
	engine: InputRuleEngine,
	ops: DocumentOp[],
): DocumentOp[] {
	const transformedOps: DocumentOp[] = [];

	for (const op of ops) {
		transformedOps.push(op);

		if (
			op.type !== "splice-text" ||
			typeof op.insert !== "string" ||
			op.insert.length !== 1 ||
			op.from !== op.to
		) {
			continue;
		}

		const blockResult = engine.tryMatch(editor, op.blockId, op.insert, {
			offset: op.from,
		});
		if (blockResult) {
			transformedOps.push(...blockResult);
			continue;
		}

		const inlineResult = engine.tryMatchInline(
			editor,
			op.blockId,
			op.insert,
			{
				offset: op.from,
			},
		);
		if (inlineResult) {
			transformedOps.push(...inlineResult);
		}
	}

	return transformedOps;
}

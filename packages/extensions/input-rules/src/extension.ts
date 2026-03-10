import type { DocumentOp, Extension, OpOrigin } from "@pen/types";
import { defineExtension, INPUT_RULES_ENGINE_SLOT_KEY } from "@pen/types";
import { InputRuleEngine } from "./engine";
import { defaultBlockRules } from "./defaultRules";
import { defaultInlineRules } from "./inlineRules";
import type { InputRulesConfig } from "./types";

export const INPUT_RULES_EXTENSION_NAME = "input-rules";

const BYPASS_ORIGINS = new Set<OpOrigin>([
	"input-rule",
	"collaborator",
	"import",
	"history",
	"system",
]);

export function inputRulesExtension(config: InputRulesConfig = {}): Extension {
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

	return defineExtension({
		name: INPUT_RULES_EXTENSION_NAME,

		activateClient: async (ctx) => {
			const { editor } = ctx;

			unsub = editor.onBeforeApply(
				(ops, options) => {
					const origin = options.origin ?? "user";
					if (BYPASS_ORIGINS.has(origin)) return ops;
					return appendInputRuleTransforms(editor, engine, ops);
				},
				{ priority: 300 },
			);

			ctx.editor.internals.setSlot(INPUT_RULES_ENGINE_SLOT_KEY, engine);
		},

		deactivateClient: async () => {
			unsub?.();
			unsub = null;
		},
	});
}

function appendInputRuleTransforms(
	editor: Parameters<NonNullable<Extension["activateClient"]>>[0]["editor"],
	engine: InputRuleEngine,
	ops: DocumentOp[],
): DocumentOp[] {
	const transformedOps: DocumentOp[] = [];

	for (const op of ops) {
		transformedOps.push(op);

		if (op.type !== "insert-text" || op.text.length !== 1) {
			continue;
		}

		const blockResult = engine.tryMatch(editor, op.blockId, op.text, {
			offset: op.offset,
		});
		if (blockResult) {
			transformedOps.push(...blockResult);
			continue;
		}

		const inlineResult = engine.tryMatchInline(editor, op.blockId, op.text, {
			offset: op.offset,
		});
		if (inlineResult) {
			transformedOps.push(...inlineResult);
		}
	}

	return transformedOps;
}

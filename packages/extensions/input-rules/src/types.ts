export type {
	InputRule,
	InputRuleHandler,
	InputRuleContext,
} from "@input/pen-types";

export interface InlineInputRule {
	id: string;
	trigger: string;
	pattern: RegExp;
	markType: string;
}

export interface InputRulesConfig {
	rules?: import("@input/pen-types").InputRule[];
	inlineRules?: InlineInputRule[];
	disableDefaults?: boolean;
	disableDefaultInlineRules?: boolean;
}
